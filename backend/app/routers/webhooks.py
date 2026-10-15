"""ODK Central webhook receiver — ingests submissions into Bronze layer."""
from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import json, logging
from typing import Optional
from app.database import AsyncSessionLocal

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/odk-submission")
async def odk_submission_webhook(request: Request, x_odk_signature: Optional[str] = Header(None)):
    """
    Receives ODK Central webhook on new submission.
    Stores raw payload in Bronze layer and triggers LISTEN/NOTIFY.
    """
    body = await request.json()
    logger.info(f"ODK webhook received: {body.get('meta', {}).get('instanceID', 'unknown')}")

    async with AsyncSessionLocal() as db:
        try:
            # Find survey by ODK form ID
            form_id = body.get("formId") or body.get("_xmlns", "").split("/")[-1]
            survey_result = await db.execute(
                text("SELECT id FROM surveys WHERE odk_form_id = :fid"),
                {"fid": form_id}
            )
            survey_row = survey_result.fetchone()

            # Extract location if present
            geom_sql = ""
            geom_params = {}
            loc = body.get("meta", {}).get("location") or body.get("location")
            if loc and isinstance(loc, dict):
                lat, lon = loc.get("lat") or loc.get("latitude"), loc.get("long") or loc.get("longitude")
                if lat and lon:
                    geom_sql = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"
                    geom_params = {"lat": float(lat), "lon": float(lon)}

            instance_id = body.get("meta", {}).get("instanceID") or body.get("instanceID", f"auto-{hash(str(body))}")
            state_code = body.get("state") or body.get("state_code")
            district_code = body.get("district") or body.get("district_code")
            fsu_code = body.get("fsu_code") or body.get("fsu")

            geom_expr = geom_sql if geom_sql else "NULL"
            params = {
                "survey_id": str(survey_row.id) if survey_row else None,
                "instance_id": instance_id,
                "raw_data": json.dumps(body),
                "source": "ODK_COLLECT",
                "state_code": state_code,
                "district_code": district_code,
                "fsu_code": fsu_code,
                **geom_params
            }

            await db.execute(text(f"""
                INSERT INTO bronze_submissions
                    (survey_id, odk_instance_id, raw_data, source, state_code, district_code, fsu_code, geom)
                VALUES
                    (:survey_id::uuid, :instance_id, :raw_data::jsonb, :source, :state_code, :district_code, :fsu_code,
                     {geom_expr})
                ON CONFLICT (odk_instance_id) DO NOTHING
            """), params)

            await db.commit()
            return {"status": "accepted", "instance_id": instance_id}

        except Exception as e:
            await db.rollback()
            logger.error(f"Webhook error: {e}")
            raise HTTPException(500, f"Failed to ingest submission: {str(e)}")


@router.post("/enketo-submission")
async def enketo_webhook(request: Request):
    """Enketo CAWI submission (same Bronze ingest, different source tag)."""
    body = await request.json()
    body["_source"] = "ENKETO"
    async with AsyncSessionLocal() as db:
        try:
            instance_id = body.get("meta", {}).get("instanceID", f"enketo-{hash(str(body))}")
            await db.execute(text("""
                INSERT INTO bronze_submissions (odk_instance_id, raw_data, source)
                VALUES (:iid, :data::jsonb, 'ENKETO')
                ON CONFLICT (odk_instance_id) DO NOTHING
            """), {"iid": instance_id, "data": json.dumps(body)})
            await db.commit()
            return {"status": "accepted"}
        except Exception as e:
            await db.rollback()
            raise HTTPException(500, str(e))
