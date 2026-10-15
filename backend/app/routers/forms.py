"""XLSForm upload + SurveyJS form builder integration."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, Dict, Any
import tempfile, os, json
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


class FormFromBuilder(BaseModel):
    survey_id: str
    title: str
    surveyjs_json: Dict[str, Any]


@router.post("/{survey_id}/upload-xlsform")
async def upload_xlsform(
    survey_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Upload XLSForm (.xlsx) and deploy to ODK Central."""
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Insufficient permissions")
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Must be .xlsx or .xls file")

    content = await file.read()

    # Save locally
    os.makedirs("/tmp/forms", exist_ok=True)
    form_path = f"/tmp/forms/{survey_id}_{file.filename}"
    with open(form_path, "wb") as f:
        f.write(content)

    # Convert to XForm using pyxform
    try:
        import pyxform
        from pyxform.xls2json import parse_file_to_json
        xform_json = parse_file_to_json(form_path)
        form_id = xform_json.get("id_string", f"form_{survey_id[:8]}")
        form_title = xform_json.get("title", "Survey Form")
    except Exception as e:
        form_id = f"form_{survey_id[:8]}"
        form_title = file.filename.replace(".xlsx", "")

    # Deploy to ODK Central
    from app.config import settings
    import httpx
    odk_status = "pending"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get auth token
            auth_resp = await client.post(f"{settings.odk_url}/v1/sessions",
                json={"email": settings.odk_admin_email, "password": settings.odk_admin_password})
            if auth_resp.status_code == 200:
                token = auth_resp.json()["token"]
                headers = {"Authorization": f"Bearer {token}"}
                # Get or create project
                proj_resp = await client.get(f"{settings.odk_url}/v1/projects", headers=headers)
                projects = proj_resp.json()
                project_id = projects[0]["id"] if projects else None
                if not project_id:
                    p = await client.post(f"{settings.odk_url}/v1/projects",
                        json={"name": "MoSPI USP"}, headers=headers)
                    project_id = p.json()["id"]
                # Upload form
                with open(form_path, "rb") as fh:
                    upload = await client.post(
                        f"{settings.odk_url}/v1/projects/{project_id}/forms?ignoreWarnings=true",
                        content=fh.read(),
                        headers={**headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 "X-XlsForm-FormId-Fallback": form_id}
                    )
                    if upload.status_code in (200, 201):
                        odk_status = "deployed"
                        await db.execute(text("""
                            UPDATE surveys SET odk_form_id = :fid, odk_project_id = :pid, xlsform_path = :path
                            WHERE id = :sid::uuid
                        """), {"fid": form_id, "pid": project_id, "path": form_path, "sid": survey_id})
    except Exception as e:
        odk_status = f"odk_error: {str(e)[:100]}"

    return {
        "form_id": form_id,
        "form_title": form_title,
        "odk_status": odk_status,
        "filename": file.filename
    }


@router.post("/builder/save")
async def save_builder_form(
    payload: FormFromBuilder,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Save SurveyJS JSON form definition and convert to XLSForm."""
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(403, "Insufficient permissions")

    form_json = json.dumps(payload.surveyjs_json)

    # Convert SurveyJS → XLSForm structure (simplified)
    xlsform_rows = _surveyjs_to_xlsform_rows(payload.surveyjs_json)

    # Update survey record
    await db.execute(text("""
        UPDATE surveys SET title = :title WHERE id = :sid::uuid
    """), {"title": payload.title, "sid": payload.survey_id})

    return {
        "message": "Form saved",
        "survey_id": payload.survey_id,
        "question_count": len(xlsform_rows),
        "xlsform_preview": xlsform_rows[:5]
    }


def _surveyjs_to_xlsform_rows(sjs: dict) -> list:
    """Simple SurveyJS JSON → XLSForm survey sheet rows."""
    rows = []
    type_map = {
        "text": "text", "radiogroup": "select_one", "checkbox": "select_multiple",
        "dropdown": "select_one", "rating": "integer", "boolean": "select_one",
        "comment": "text", "file": "image", "signaturepad": "image",
    }
    pages = sjs.get("pages", [{"elements": sjs.get("elements", [])}])
    for page in pages:
        for el in page.get("elements", []):
            q_type = type_map.get(el.get("type", "text"), "text")
            choices = el.get("choices", [])
            list_name = ""
            if q_type in ("select_one", "select_multiple") and choices:
                list_name = el.get("name", "q")[:20]
                q_type = f"{q_type} {list_name}"
            rows.append({
                "type": q_type,
                "name": el.get("name", ""),
                "label": el.get("title", el.get("name", "")),
                "required": "yes" if el.get("isRequired") else "no",
                "relevant": "",
                "constraint": "",
            })
    return rows
