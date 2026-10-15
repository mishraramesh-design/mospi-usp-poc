"""Sampling frame management and stratified allocation."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
import csv, io, json
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


@router.get("/frames")
async def list_frames(survey_id: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    params: dict = {}
    f = ""
    if survey_id:
        f = "WHERE sf.survey_id = :sid::uuid"
        params["sid"] = survey_id
    result = await db.execute(text(f"""
        SELECT sf.id, sf.frame_name, sf.total_units, sf.uploaded_at,
               s.code AS survey_code, u.full_name AS uploaded_by_name,
               (SELECT COUNT(*) FROM sampling_units su WHERE su.frame_id = sf.id) AS unit_count,
               (SELECT COUNT(*) FROM sampling_units su WHERE su.frame_id = sf.id AND su.selected=true) AS selected_count
        FROM sampling_frames sf
        LEFT JOIN surveys s ON sf.survey_id = s.id
        LEFT JOIN users u ON sf.uploaded_by = u.id
        {f}
        ORDER BY sf.uploaded_at DESC
    """), params)
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/frames/{survey_id}/upload")
async def upload_frame(
    survey_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Upload CSV sampling frame. Expected columns: fsu_code, state_code, district_code, sector, stratum, nss_region, fsu_name, hh_count"""
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Insufficient permissions")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    rows = list(reader)
    if not rows:
        raise HTTPException(400, "Empty file")

    # Create frame
    frame_result = await db.execute(text("""
        INSERT INTO sampling_frames (survey_id, frame_name, total_units, uploaded_by)
        VALUES (:sid::uuid, :name, :total, :uid::uuid) RETURNING id
    """), {"sid": survey_id, "name": file.filename, "total": len(rows), "uid": current_user["id"]})
    frame_id = str(frame_result.fetchone().id)

    # Insert units
    for row in rows:
        await db.execute(text("""
            INSERT INTO sampling_units (frame_id, fsu_code, state_code, district_code, sector, stratum, nss_region, fsu_name, hh_count)
            VALUES (:fid::uuid, :fsu_code, :state_code, :district_code, :sector, :stratum, :nss_region, :fsu_name, :hh_count)
        """), {
            "fid": frame_id,
            "fsu_code": row.get("fsu_code", ""),
            "state_code": row.get("state_code"),
            "district_code": row.get("district_code"),
            "sector": row.get("sector"),
            "stratum": row.get("stratum"),
            "nss_region": row.get("nss_region"),
            "fsu_name": row.get("fsu_name"),
            "hh_count": int(row.get("hh_count", 0) or 0)
        })
    return {"frame_id": frame_id, "units_loaded": len(rows)}


@router.post("/frames/{frame_id}/allocate")
async def allocate_sample(frame_id: str, n: int = 100, method: str = "proportional", db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Proportional stratified allocation — selects n units from frame."""
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Insufficient permissions")

    # Simple proportional: select proportionally from each stratum
    await db.execute(text("""
        WITH strata_counts AS (
            SELECT stratum, COUNT(*) AS stratum_total
            FROM sampling_units WHERE frame_id = :fid::uuid GROUP BY stratum
        ),
        frame_total AS (SELECT SUM(stratum_total) AS total FROM strata_counts),
        allocations AS (
            SELECT s.stratum,
                   GREATEST(1, ROUND(s.stratum_total::numeric / ft.total * :n)) AS alloc
            FROM strata_counts s CROSS JOIN frame_total ft
        ),
        to_select AS (
            SELECT su.id,
                   ROW_NUMBER() OVER (PARTITION BY su.stratum ORDER BY random()) AS rn,
                   a.alloc
            FROM sampling_units su
            JOIN allocations a ON su.stratum = a.stratum
            WHERE su.frame_id = :fid::uuid AND su.selected = FALSE
        )
        UPDATE sampling_units SET selected = TRUE
        WHERE id IN (SELECT id FROM to_select WHERE rn <= alloc)
    """), {"fid": frame_id, "n": n})

    count = await db.execute(
        text("SELECT COUNT(*) FROM sampling_units WHERE frame_id = :fid::uuid AND selected=true"),
        {"fid": frame_id}
    )
    return {"message": f"Allocation complete", "selected": count.scalar(), "method": method}


@router.get("/frames/{frame_id}/units")
async def list_units(
    frame_id: str,
    selected_only: bool = False,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    sel_filter = "AND su.selected = TRUE" if selected_only else ""
    result = await db.execute(text(f"""
        SELECT su.id, su.fsu_code, su.state_code, su.district_code, su.sector,
               su.stratum, su.nss_region, su.fsu_name, su.hh_count, su.selected,
               u.full_name AS assigned_to_name
        FROM sampling_units su
        LEFT JOIN users u ON su.assigned_to = u.id
        WHERE su.frame_id = :fid::uuid {sel_filter}
        ORDER BY su.state_code, su.district_code
        LIMIT :limit
    """), {"fid": frame_id, "limit": limit})
    return [dict(r._mapping) for r in result.fetchall()]


@router.get("/states")
async def list_states(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(text("SELECT code, name FROM states ORDER BY name"))
    return [dict(r._mapping) for r in result.fetchall()]
