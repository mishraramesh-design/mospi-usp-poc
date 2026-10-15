"""Statistical analysis — R Plumber proxy + tabulation plans."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
from app.database import get_db
from app.auth import get_current_user
from app.config import settings

router = APIRouter()


class TabPlanCreate(BaseModel):
    name: str
    survey_id: str
    plan_json: Dict[str, Any]


class TabulationRequest(BaseModel):
    plan_id: Optional[str] = None
    survey_code: str
    design: Dict[str, str]   # id_var, strata_var, cluster_var, weight_var
    estimator: str = "svymean"
    target_var: str
    by_vars: List[str] = []
    confidence_level: float = 0.95


@router.get("/plans")
async def list_plans(survey_id: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    params: dict = {}
    f = ""
    if survey_id:
        f = "WHERE tp.survey_id = :sid::uuid"
        params["sid"] = survey_id
    result = await db.execute(text(f"""
        SELECT tp.id, tp.name, tp.plan_json, tp.created_at,
               s.code AS survey_code, u.full_name AS created_by_name
        FROM tabulation_plans tp
        LEFT JOIN surveys s ON tp.survey_id = s.id
        LEFT JOIN users u ON tp.created_by = u.id
        {f}
        ORDER BY tp.created_at DESC
    """), params)
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/plans", status_code=201)
async def create_plan(payload: TabPlanCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    import json
    result = await db.execute(text("""
        INSERT INTO tabulation_plans (name, survey_id, plan_json, created_by)
        VALUES (:name, :sid::uuid, :plan::jsonb, :uid::uuid)
        RETURNING id
    """), {"name": payload.name, "sid": payload.survey_id,
           "plan": json.dumps(payload.plan_json), "uid": current_user["id"]})
    return {"id": str(result.fetchone().id)}


@router.post("/tabulate")
async def tabulate(req: TabulationRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Proxy to R Plumber /tabulate endpoint."""
    payload = {
        "survey_code": req.survey_code,
        "design": req.design,
        "estimator": req.estimator,
        "target_var": req.target_var,
        "by_vars": req.by_vars,
        "confidence_level": req.confidence_level,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{settings.r_api_url}/tabulate", json=payload)
            resp.raise_for_status()
            result_data = resp.json()
    except httpx.ConnectError:
        # Return demo data when R API not available
        result_data = _demo_tabulation(req)

    # Save result
    import json, time
    if req.plan_id:
        await db.execute(text("""
            INSERT INTO tabulation_results (plan_id, result_json, r_code, execution_ms)
            VALUES (:pid::uuid, :result::jsonb, :r_code, :ms)
        """), {"pid": req.plan_id, "result": json.dumps(result_data),
               "r_code": result_data.get("r_code", ""), "ms": result_data.get("execution_ms", 0)})

    return result_data


@router.get("/results")
async def list_results(plan_id: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    params: dict = {}
    f = ""
    if plan_id:
        f = "WHERE tr.plan_id = :pid::uuid"
        params["pid"] = plan_id
    result = await db.execute(text(f"""
        SELECT tr.id, tr.run_at, tr.execution_ms, tp.name AS plan_name
        FROM tabulation_results tr LEFT JOIN tabulation_plans tp ON tr.plan_id = tp.id
        {f} ORDER BY tr.run_at DESC LIMIT 20
    """), params)
    return [dict(r._mapping) for r in result.fetchall()]


def _demo_tabulation(req: TabulationRequest) -> dict:
    """Return realistic demo output when R API is unavailable."""
    states = [
        ("MH", "Maharashtra"), ("UP", "Uttar Pradesh"), ("KA", "Karnataka"),
        ("TN", "Tamil Nadu"), ("RJ", "Rajasthan"), ("WB", "West Bengal"),
        ("GJ", "Gujarat"), ("AP", "Andhra Pradesh"), ("KL", "Kerala"), ("BR", "Bihar"),
    ]
    import random
    random.seed(42)
    rows = []
    for code, name in states:
        for sector in ["Rural", "Urban"]:
            ur = round(random.uniform(3.5, 18.5), 2)
            se = round(ur * random.uniform(0.05, 0.12), 2)
            deff = round(random.uniform(1.1, 2.8), 2)
            rows.append({
                "state_code": code, "state_name": name, "sector": sector,
                "estimate": ur, "se": se, "cv": round(se/ur*100, 1),
                "ci_lower": round(ur - 1.96*se, 2), "ci_upper": round(ur + 1.96*se, 2),
                "deff": deff, "n": random.randint(200, 800)
            })
    return {
        "status": "success",
        "estimator": req.estimator,
        "target_var": req.target_var,
        "by_vars": req.by_vars,
        "rows": rows,
        "execution_ms": 1243,
        "r_code": f"""# R Code — {req.survey_code}
library(survey)
design <- svydesign(
  id = ~{req.design.get('cluster_var','fsu_code')},
  strata = ~{req.design.get('strata_var','nss_region')},
  weights = ~{req.design.get('weight_var','multiplier')},
  data = survey_data,
  nest = TRUE
)
result <- svyby(
  ~{req.target_var},
  ~{' + '.join(req.by_vars) or 'state_code'},
  design, {req.estimator},
  deff = TRUE, vartype = c("se","ci","cv")
)
print(result)""",
        "note": "Demo data — R API offline. Deploy R container for live estimates."
    }
