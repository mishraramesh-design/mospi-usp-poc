from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


@router.get("/record/{bronze_id}")
async def record_lineage(bronze_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Full lineage trail for a single bronze submission."""
    events = await db.execute(text("""
        SELECT le.id, le.entity_type, le.entity_id, le.event_type,
               le.event_data, le.triggered_by, le.occurred_at
        FROM lineage_events le
        WHERE le.bronze_id = :bid::uuid
        ORDER BY le.occurred_at ASC
    """), {"bid": bronze_id})
    rows = events.fetchall()

    # Bronze details
    bronze = await db.execute(
        text("SELECT id, odk_instance_id, source, submitted_at, state_code, district_code, fsu_code, raw_data FROM bronze_submissions WHERE id = :id::uuid"),
        {"id": bronze_id}
    )
    b = bronze.fetchone()

    # Silver record
    silver = await db.execute(
        text("SELECT id, dq_status, dq_score, cleaned_at FROM silver_records WHERE bronze_id = :bid::uuid ORDER BY silver_version DESC LIMIT 1"),
        {"bid": bronze_id}
    )
    s = silver.fetchone()

    return {
        "bronze": dict(b._mapping) if b else None,
        "silver": dict(s._mapping) if s else None,
        "events": [dict(e._mapping) for e in rows]
    }


@router.get("/feed")
async def lineage_feed(
    limit: int = Query(50, le=200),
    survey_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Recent lineage events stream."""
    params: dict = {"limit": limit}
    f = ""
    if survey_id:
        f = "AND b.survey_id = :sid::uuid"
        params["sid"] = survey_id

    result = await db.execute(text(f"""
        SELECT le.event_type, le.entity_type, le.triggered_by, le.occurred_at,
               b.odk_instance_id, b.state_code, s.code AS survey_code
        FROM lineage_events le
        LEFT JOIN bronze_submissions b ON le.bronze_id = b.id
        LEFT JOIN surveys s ON b.survey_id = s.id
        WHERE 1=1 {f}
        ORDER BY le.occurred_at DESC
        LIMIT :limit
    """), params)
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/stats")
async def lineage_stats(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT
            event_type,
            COUNT(*) AS count,
            MAX(occurred_at) AS latest
        FROM lineage_events
        GROUP BY event_type
        ORDER BY count DESC
    """))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]
