"""Bronze → Silver → Gold pipeline status and manual triggers."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


@router.get("/overview")
async def pipeline_overview(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """High-level medallion pipeline counts across all surveys."""
    result = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM bronze_submissions) AS bronze_total,
            (SELECT COUNT(*) FROM silver_records) AS silver_total,
            (SELECT COUNT(*) FROM silver_records WHERE dq_status='pass') AS silver_pass,
            (SELECT COUNT(*) FROM silver_records WHERE dq_status='warn') AS silver_warn,
            (SELECT COUNT(*) FROM silver_records WHERE dq_status='fail') AS silver_fail,
            (SELECT COUNT(*) FROM gold_plfs_state) AS gold_plfs_records,
            (SELECT COUNT(*) FROM bronze_submissions WHERE submitted_at > NOW() - INTERVAL '24 hours') AS bronze_24h,
            (SELECT AVG(dq_score) FROM silver_records WHERE dq_score IS NOT NULL) AS avg_dq_score
    """))
    row = result.fetchone()
    return dict(row._mapping)


@router.get("/bronze")
async def list_bronze(
    survey_id: Optional[str] = None,
    state_code: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    filters = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if survey_id:
        filters.append("b.survey_id = :survey_id::uuid")
        params["survey_id"] = survey_id
    if state_code:
        filters.append("b.state_code = :state_code")
        params["state_code"] = state_code

    where = " AND ".join(filters)
    result = await db.execute(text(f"""
        SELECT b.id, b.odk_instance_id, b.source, b.submitted_at, b.state_code,
               b.district_code, b.fsu_code,
               s.code AS survey_code, s.title AS survey_title,
               u.full_name AS submitter_name,
               (SELECT 1 FROM silver_records sr WHERE sr.bronze_id = b.id LIMIT 1) IS NOT NULL AS promoted
        FROM bronze_submissions b
        LEFT JOIN surveys s ON b.survey_id = s.id
        LEFT JOIN users u ON b.submitter_id = u.id
        WHERE {where}
        ORDER BY b.submitted_at DESC
        LIMIT :limit OFFSET :offset
    """), params)
    rows = result.fetchall()

    count_result = await db.execute(text(f"""
        SELECT COUNT(*) FROM bronze_submissions b WHERE {where}
    """), params)
    total = count_result.scalar()
    return {"total": total, "items": [dict(r._mapping) for r in rows]}


@router.get("/bronze/{bronze_id}")
async def get_bronze(bronze_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(
        text("SELECT * FROM bronze_submissions WHERE id = :id::uuid"),
        {"id": bronze_id}
    )
    row = result.fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")
    d = dict(row._mapping)
    # also fetch silver
    sr = await db.execute(
        text("SELECT * FROM silver_records WHERE bronze_id = :bid::uuid ORDER BY silver_version DESC LIMIT 1"),
        {"bid": bronze_id}
    )
    silver = sr.fetchone()
    d["silver"] = dict(silver._mapping) if silver else None
    return d


@router.get("/silver")
async def list_silver(
    survey_id: Optional[str] = None,
    dq_status: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    filters = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if survey_id:
        filters.append("sr.survey_id = :survey_id::uuid")
        params["survey_id"] = survey_id
    if dq_status:
        filters.append("sr.dq_status = :dq_status")
        params["dq_status"] = dq_status

    where = " AND ".join(filters)
    result = await db.execute(text(f"""
        SELECT sr.id, sr.bronze_id, sr.dq_status, sr.dq_score, sr.cleaned_at,
               sr.hh_id, sr.state_code, sr.district_code, sr.sector, sr.fsu_code,
               s.code AS survey_code
        FROM silver_records sr
        LEFT JOIN surveys s ON sr.survey_id = s.id
        WHERE {where}
        ORDER BY sr.cleaned_at DESC
        LIMIT :limit OFFSET :offset
    """), params)
    rows = result.fetchall()
    count_result = await db.execute(text(f"SELECT COUNT(*) FROM silver_records sr WHERE {where}"), params)
    total = count_result.scalar()
    return {"total": total, "items": [dict(r._mapping) for r in rows]}


@router.get("/trend")
async def ingestion_trend(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Last 14 days ingestion trend for chart."""
    result = await db.execute(text("""
        SELECT
            date_trunc('day', submitted_at)::date AS day,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE source='ODK_COLLECT') AS capi,
            COUNT(*) FILTER (WHERE source='ENKETO') AS cawi
        FROM bronze_submissions
        WHERE submitted_at > NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1
    """))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("/trigger-bronze-to-silver")
async def trigger_bronze_to_silver(survey_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Trigger Airflow DAG for Bronze→Silver promotion."""
    import httpx
    from app.config import settings
    if current_user["role"] not in ("admin", "supervisor"):
        from fastapi import HTTPException
        raise HTTPException(403, "Insufficient permissions")
    conf = {"survey_id": survey_id} if survey_id else {}
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{settings.airflow_url}/api/v1/dags/bronze_to_silver/dagRuns",
                json={"conf": conf},
                auth=(settings.airflow_user, settings.airflow_password),
                timeout=15.0
            )
            return {"status": "triggered", "dag_run": resp.json()}
        except Exception as e:
            return {"status": "airflow_unavailable", "message": str(e)}


@router.post("/trigger-silver-to-gold")
async def trigger_silver_to_gold(survey_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Trigger Airflow DAG for Silver→Gold aggregation."""
    import httpx
    from app.config import settings
    if current_user["role"] not in ("admin", "supervisor"):
        from fastapi import HTTPException
        raise HTTPException(403, "Insufficient permissions")
    conf = {"survey_id": survey_id} if survey_id else {}
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{settings.airflow_url}/api/v1/dags/silver_to_gold/dagRuns",
                json={"conf": conf},
                auth=(settings.airflow_user, settings.airflow_password),
                timeout=15.0
            )
            return {"status": "triggered", "dag_run": resp.json()}
        except Exception as e:
            return {"status": "airflow_unavailable", "message": str(e)}
