"""Data Quality engine — Great Expectations runner + DQ audit trail."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


@router.get("/runs")
async def list_dq_runs(
    survey_id: Optional[str] = None,
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    params: dict = {"limit": limit}
    filter_sql = ""
    if survey_id:
        filter_sql = "WHERE dr.survey_id = :survey_id::uuid"
        params["survey_id"] = survey_id

    result = await db.execute(text(f"""
        SELECT dr.id, dr.run_type, dr.started_at, dr.finished_at,
               dr.total_records, dr.passed, dr.warned, dr.failed,
               s.code AS survey_code, s.title AS survey_title,
               ROUND(dr.passed::numeric / NULLIF(dr.total_records,0) * 100, 1) AS pass_pct
        FROM dq_runs dr
        LEFT JOIN surveys s ON dr.survey_id = s.id
        {filter_sql}
        ORDER BY dr.started_at DESC
        LIMIT :limit
    """), params)
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT dr.*, s.code AS survey_code
        FROM dq_runs dr LEFT JOIN surveys s ON dr.survey_id = s.id
        WHERE dr.id = :id::uuid
    """), {"id": run_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "DQ run not found")

    checks = await db.execute(text("""
        SELECT dc.id, dc.check_name, dc.dimension, dc.status, dc.column_name,
               dc.expected, dc.actual, dc.message, dc.checked_at,
               sr.hh_id, sr.state_code
        FROM dq_checks dc
        LEFT JOIN silver_records sr ON dc.silver_id = sr.id
        WHERE dc.run_id = :run_id::uuid
        ORDER BY dc.status DESC, dc.checked_at
        LIMIT 200
    """), {"run_id": run_id})
    check_rows = checks.fetchall()
    return {**dict(row._mapping), "checks": [dict(c._mapping) for c in check_rows]}


@router.get("/scorecard")
async def scorecard(survey_id: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Dimension-wise DQ scorecard for radar chart."""
    params: dict = {}
    survey_filter = ""
    if survey_id:
        survey_filter = "AND dc.silver_id IN (SELECT id FROM silver_records WHERE survey_id = :sid::uuid)"
        params["sid"] = survey_id

    result = await db.execute(text(f"""
        SELECT
            dc.dimension,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE dc.status='pass') AS passed,
            COUNT(*) FILTER (WHERE dc.status='warn') AS warned,
            COUNT(*) FILTER (WHERE dc.status='fail') AS failed,
            ROUND(COUNT(*) FILTER (WHERE dc.status='pass')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS score
        FROM dq_checks dc
        WHERE 1=1 {survey_filter}
        GROUP BY dc.dimension
        ORDER BY dc.dimension
    """), params)
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/rules")
async def list_rules(
    survey_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Per-rule failure statistics."""
    params: dict = {}
    survey_filter = ""
    if survey_id:
        survey_filter = "AND dc.silver_id IN (SELECT id FROM silver_records WHERE survey_id = :sid::uuid)"
        params["sid"] = survey_id

    result = await db.execute(text(f"""
        SELECT
            dc.check_name,
            dc.dimension,
            dc.column_name,
            COUNT(*) AS total_checks,
            COUNT(*) FILTER (WHERE dc.status='fail') AS failures,
            ROUND(COUNT(*) FILTER (WHERE dc.status='fail')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS failure_rate
        FROM dq_checks dc
        WHERE 1=1 {survey_filter}
        GROUP BY dc.check_name, dc.dimension, dc.column_name
        ORDER BY failures DESC
        LIMIT 50
    """), params)
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("/run")
async def run_dq(survey_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Trigger a DQ run for all pending silver records of a survey."""
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Insufficient permissions")

    # Count pending records
    result = await db.execute(
        text("SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='pending'"),
        {"sid": survey_id}
    )
    pending = result.scalar()

    if pending == 0:
        return {"message": "No pending records to validate"}

    # Create DQ run record
    run_result = await db.execute(
        text("""INSERT INTO dq_runs (survey_id, run_type, total_records, passed, warned, failed)
                VALUES (:sid::uuid, 'manual', :total, 0, 0, 0) RETURNING id"""),
        {"sid": survey_id, "total": pending}
    )
    run_id = str(run_result.fetchone().id)

    # In production, this would call Great Expectations; here we simulate
    await db.execute(text("""
        UPDATE silver_records SET dq_status = CASE
            WHEN random() > 0.9 THEN 'fail'
            WHEN random() > 0.75 THEN 'warn'
            ELSE 'pass' END,
            dq_score = CASE
            WHEN dq_status = 'fail' THEN 40 + random()*20
            WHEN dq_status = 'warn' THEN 70 + random()*15
            ELSE 90 + random()*10 END
        WHERE survey_id = :sid::uuid AND dq_status = 'pending'
    """), {"sid": survey_id})

    # Update run summary
    await db.execute(text("""
        UPDATE dq_runs SET
            finished_at = NOW(),
            passed = (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='pass'),
            warned = (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='warn'),
            failed = (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='fail')
        WHERE id = :run_id::uuid
    """), {"sid": survey_id, "run_id": run_id})

    return {"run_id": run_id, "message": f"DQ run completed for {pending} records"}
