from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import uuid, json
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


class SurveyCreate(BaseModel):
    code: str
    title: str
    description: Optional[str] = None
    survey_type: str = "CAPI"
    reference_period_start: Optional[date] = None
    reference_period_end: Optional[date] = None


@router.get("")
async def list_surveys(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT s.id, s.code, s.title, s.description, s.survey_type, s.status,
               s.reference_period_start, s.reference_period_end, s.odk_form_id,
               u.full_name AS created_by_name,
               (SELECT COUNT(*) FROM bronze_submissions b WHERE b.survey_id = s.id) AS bronze_count,
               (SELECT COUNT(*) FROM silver_records sr WHERE sr.survey_id = s.id) AS silver_count
        FROM surveys s
        LEFT JOIN users u ON s.created_by = u.id
        ORDER BY s.created_at DESC
    """))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/{survey_id}")
async def get_survey(survey_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(
        text("SELECT * FROM surveys WHERE id = :id::uuid"),
        {"id": survey_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    return dict(row._mapping)


@router.post("", status_code=201)
async def create_survey(payload: SurveyCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    result = await db.execute(
        text("""INSERT INTO surveys (code, title, description, survey_type, reference_period_start,
                reference_period_end, created_by)
                VALUES (:code, :title, :description, :survey_type, :rps, :rpe, :created_by::uuid)
                RETURNING id"""),
        {"code": payload.code, "title": payload.title, "description": payload.description,
         "survey_type": payload.survey_type, "rps": payload.reference_period_start,
         "rpe": payload.reference_period_end, "created_by": current_user["id"]}
    )
    row = result.fetchone()
    return {"id": str(row.id), "message": "Survey created"}


@router.patch("/{survey_id}/status")
async def update_status(survey_id: str, status: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    valid = ("draft", "active", "closed", "archived")
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")
    await db.execute(
        text("UPDATE surveys SET status = :status WHERE id = :id::uuid"),
        {"status": status, "id": survey_id}
    )
    return {"message": f"Status updated to {status}"}


@router.get("/{survey_id}/stats")
async def survey_stats(survey_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Detailed stats for a single survey including Bronze/Silver/Gold counts and DQ summary."""
    result = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM bronze_submissions WHERE survey_id = :sid::uuid) AS bronze_total,
            (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid) AS silver_total,
            (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='pass') AS silver_pass,
            (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='warn') AS silver_warn,
            (SELECT COUNT(*) FROM silver_records WHERE survey_id = :sid::uuid AND dq_status='fail') AS silver_fail,
            (SELECT AVG(dq_score) FROM silver_records WHERE survey_id = :sid::uuid) AS avg_dq_score,
            (SELECT COUNT(*) FROM lineage_events WHERE entity_type='bronze'
             AND bronze_id IN (SELECT id FROM bronze_submissions WHERE survey_id = :sid::uuid)) AS lineage_events
    """), {"sid": survey_id})
    row = result.fetchone()
    return dict(row._mapping)
