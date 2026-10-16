"""
Synthetic Ground Truth Preview — Simulator Router
Generates statistically shaped household data using numpy/scipy.
No GPU or SLM required — runs on standard CPU.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
import json, uuid
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


# ── Request models ──────────────────────────────────────────────────────────

class VolumeSimRequest(BaseModel):
    survey_id: str
    n_households: int = 500
    state_codes: Optional[List[str]] = None   # None = all India
    sector: Optional[str] = None               # Rural/Urban/Both
    seed: int = 42


class EdgeCaseRequest(BaseModel):
    survey_id: str
    n_households: int = 50
    edge_types: List[str] = ["outlier_income", "missing_critical", "invalid_age", "inconsistent"]


class ReviewRequest(BaseModel):
    survey_id: str
    questions: List[dict]   # question objects from form builder


# ── Volume Simulation ────────────────────────────────────────────────────────

@router.post("/volume")
async def simulate_volume(
    req: VolumeSimRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generate N statistically shaped household records."""
    run_id = str(uuid.uuid4())

    # Create run record
    await db.execute(text("""
        INSERT INTO simulator_runs (id, survey_id, mode, params, status, created_by)
        VALUES (:id::uuid, :sid::uuid, 'volume', :params::jsonb, 'running', :uid::uuid)
    """), {
        "id": run_id,
        "sid": req.survey_id,
        "params": json.dumps({"n_households": req.n_households, "state_codes": req.state_codes, "sector": req.sector}),
        "uid": current_user["id"]
    })

    # Run synchronously for POC (fast enough at 500 records)
    result = _generate_volume_data(req)

    await db.execute(text("""
        UPDATE simulator_runs SET
            status = 'done',
            result_data = :result::jsonb,
            report_data = :report::jsonb,
            n_records = :n,
            finished_at = NOW()
        WHERE id = :id::uuid
    """), {
        "id": run_id,
        "result": json.dumps(result["records"][:50]),   # sample — full in report
        "report": json.dumps(result["report"]),
        "n": len(result["records"])
    })

    return {
        "run_id": run_id,
        "n_records": len(result["records"]),
        "report": result["report"],
        "sample_records": result["records"][:10],
        "message": f"Generated {len(result['records'])} synthetic households"
    }


def _generate_volume_data(req: VolumeSimRequest) -> dict:
    """Core numpy/scipy statistical generation."""
    try:
        import numpy as np
        from scipy import stats
        rng = np.random.default_rng(req.seed)
    except ImportError:
        import random
        rng = None

    n = req.n_households
    states = req.state_codes or ["UP", "MH", "RJ", "TN", "WB", "MP", "GJ", "KA", "AP", "TG"]
    sectors = ["Rural", "Urban"] if not req.sector or req.sector == "Both" else [req.sector]

    records = []
    for i in range(n):
        if rng is not None:
            # Statistically shaped distributions (MoSPI HCES 2022-23 reference)
            hh_size = int(np.clip(rng.normal(4.2, 1.8), 1, 12))
            age_head = int(np.clip(rng.normal(44, 12), 18, 80))
            sector_val = rng.choice(sectors, p=[0.65, 0.35] if len(sectors) == 2 else [1.0])
            state_val = rng.choice(states)

            # MPCE based on sector (log-normal distribution)
            if sector_val == "Rural":
                mpce = float(np.clip(rng.lognormal(np.log(3773), 0.55), 800, 25000))
            else:
                mpce = float(np.clip(rng.lognormal(np.log(6459), 0.60), 1200, 60000))

            # Social group (Census 2011 proportions)
            social_group = rng.choice(
                ["Scheduled Tribe", "Scheduled Caste", "Other Backward Class", "Others"],
                p=[0.086, 0.166, 0.410, 0.338]
            )
            # Employment status
            emp_status = rng.choice(
                ["Self-employed", "Regular wage/salaried", "Casual wage labour",
                 "Attended domestic duties", "Full-time student", "Others"],
                p=[0.45, 0.24, 0.13, 0.09, 0.05, 0.04]
            )
            # Food expenditure (% of MPCE — Engel's law, rural higher share)
            food_share = rng.normal(0.47 if sector_val == "Rural" else 0.39, 0.08)
            food_share = float(np.clip(food_share, 0.20, 0.75))
            exp_food = round(mpce * food_share, 2)

            edu_level = rng.choice(
                ["Not literate", "Below primary", "Primary", "Middle",
                 "Secondary", "Higher secondary", "Graduate", "Post graduate"],
                p=[0.25, 0.08, 0.15, 0.13, 0.14, 0.12, 0.10, 0.03]
            )
        else:
            # Fallback without numpy
            import random
            hh_size = random.randint(1, 10)
            age_head = random.randint(25, 70)
            sector_val = random.choice(sectors)
            state_val = random.choice(states)
            mpce = round(random.uniform(2000, 8000), 2)
            social_group = random.choice(["SC", "ST", "OBC", "Others"])
            emp_status = random.choice(["Self-employed", "Regular wage/salaried", "Casual wage labour"])
            food_share = 0.45
            exp_food = round(mpce * food_share, 2)
            edu_level = random.choice(["Primary", "Secondary", "Graduate"])

        records.append({
            "hh_id": f"SIM{i+1:05d}",
            "state_code": str(state_val),
            "sector": str(sector_val),
            "hh_size": hh_size,
            "age_head": age_head,
            "social_group": str(social_group),
            "employment_status": str(emp_status),
            "education_level": str(edu_level),
            "mpce_total": round(float(mpce), 2),
            "exp_food": exp_food,
            "food_share_pct": round(food_share * 100, 1),
            "exp_education": round(float(mpce) * 0.05, 2),
            "exp_medical": round(float(mpce) * 0.04, 2),
            "owns_mobile": True if float(mpce) > 3000 else (hash(str(i)) % 2 == 0),
        })

    # Build tabulation report
    report = _build_tabulation_report(records)
    return {"records": records, "report": report}


def _build_tabulation_report(records: list) -> dict:
    """Generate frequency tables and cross-tabs for the report preview."""
    from collections import Counter, defaultdict

    n = len(records)

    # Sector distribution
    sector_counts = Counter(r["sector"] for r in records)

    # Social group distribution
    sg_counts = Counter(r["social_group"] for r in records)

    # Employment distribution
    emp_counts = Counter(r["employment_status"] for r in records)

    # MPCE quintiles
    mpce_vals = sorted(r["mpce_total"] for r in records)
    q_size = n // 5
    quintiles = []
    for qi in range(5):
        subset = mpce_vals[qi*q_size:(qi+1)*q_size]
        quintiles.append({
            "quintile": f"Q{qi+1}",
            "min": round(subset[0], 0) if subset else 0,
            "max": round(subset[-1], 0) if subset else 0,
            "mean": round(sum(subset)/len(subset), 0) if subset else 0,
            "count": len(subset)
        })

    # State-wise mean MPCE
    state_mpce = defaultdict(list)
    for r in records:
        state_mpce[r["state_code"]].append(r["mpce_total"])
    state_summary = [
        {
            "state": st,
            "n": len(vals),
            "mean_mpce": round(sum(vals)/len(vals), 2),
            "rural_pct": round(sum(1 for r in records if r["state_code"] == st and r["sector"] == "Rural") / len(vals) * 100, 1)
        }
        for st, vals in sorted(state_mpce.items())
    ]

    # Education × Sector cross-tab
    edu_sectors = defaultdict(lambda: {"Rural": 0, "Urban": 0})
    for r in records:
        edu_sectors[r["education_level"]][r["sector"]] += 1

    # Food share analysis
    food_shares = [r["food_share_pct"] for r in records]
    avg_food_share = round(sum(food_shares) / len(food_shares), 1) if food_shares else 0

    # Overall stats
    mpce_all = [r["mpce_total"] for r in records]
    mean_mpce = round(sum(mpce_all) / n, 2) if n else 0
    median_idx = n // 2
    median_mpce = round(sorted(mpce_all)[median_idx], 2) if mpce_all else 0

    # Gini coefficient approximation
    sorted_vals = sorted(mpce_all)
    n2 = len(sorted_vals)
    gini = 0.0
    if n2 > 1:
        cumsum = 0
        for idx, val in enumerate(sorted_vals):
            cumsum += val
            gini += (2 * (idx + 1) - n2 - 1) * val
        total = sum(sorted_vals)
        gini = abs(gini / (n2 * total)) if total > 0 else 0
    gini = round(gini, 4)

    return {
        "n_households": n,
        "mean_mpce": mean_mpce,
        "median_mpce": median_mpce,
        "gini_coefficient": gini,
        "avg_food_share_pct": avg_food_share,
        "sector_distribution": [{"sector": k, "count": v, "pct": round(v/n*100,1)} for k, v in sector_counts.items()],
        "social_group_distribution": [{"group": k, "count": v, "pct": round(v/n*100,1)} for k, v in sg_counts.items()],
        "employment_distribution": [{"status": k, "count": v, "pct": round(v/n*100,1)} for k, v in emp_counts.items()],
        "mpce_quintiles": quintiles,
        "state_summary": state_summary[:8],  # top 8 for display
        "education_cross_tab": [
            {"education": k, **v} for k, v in sorted(edu_sectors.items())
        ],
    }


# ── Edge Case Simulation ─────────────────────────────────────────────────────

@router.post("/edgecases")
async def simulate_edge_cases(
    req: EdgeCaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generate edge-case records for validation testing."""
    cases = []
    edge_descriptions = []

    for i in range(req.n_households):
        edge_type = req.edge_types[i % len(req.edge_types)]
        record = {
            "hh_id": f"EDGE{i+1:04d}",
            "state_code": "UP",
            "sector": "Rural",
            "hh_size": 4,
            "mpce_total": 3500.0,
            "edge_type": edge_type,
        }

        if edge_type == "outlier_income":
            record["mpce_total"] = 250000.0 if i % 2 == 0 else 85.0
            record["flag"] = "MPCE > 99th percentile" if i % 2 == 0 else "MPCE below poverty line threshold"
            edge_descriptions.append("Extreme income outlier — may indicate data entry error or genuine ultra-rich/destitute household")

        elif edge_type == "missing_critical":
            record["sector"] = None
            record["hh_size"] = None
            record["flag"] = "Missing: sector, hh_size"
            edge_descriptions.append("Critical fields blank — DQ rule R-001 would fail this record")

        elif edge_type == "invalid_age":
            record["age_head"] = 8 if i % 3 == 0 else 112
            record["flag"] = f"Age of head = {record['age_head']} — implausible"
            edge_descriptions.append("Implausible age for household head — constraint validator should catch this")

        elif edge_type == "inconsistent":
            record["hh_size"] = 1
            record["hh_size_alt"] = 6   # from a different question
            record["flag"] = "hh_size inconsistency between roster count and reported size"
            edge_descriptions.append("Cross-field inconsistency — roster count differs from reported size")

        cases.append(record)

    # Unique descriptions
    unique_desc = list(dict.fromkeys(edge_descriptions))

    run_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO simulator_runs (id, survey_id, mode, params, status, result_data, n_records, created_by, finished_at)
        VALUES (:id::uuid, :sid::uuid, 'edgecases', :params::jsonb, 'done', :result::jsonb, :n, :uid::uuid, NOW())
    """), {
        "id": run_id, "sid": req.survey_id,
        "params": json.dumps({"n_households": req.n_households, "edge_types": req.edge_types}),
        "result": json.dumps(cases[:20]),
        "n": len(cases), "uid": current_user["id"]
    })

    return {
        "run_id": run_id,
        "n_records": len(cases),
        "records": cases,
        "edge_type_summary": {et: sum(1 for c in cases if c.get("edge_type") == et) for et in req.edge_types},
        "descriptions": unique_desc,
        "message": "Edge case records generated for DQ validation testing"
    }


# ── Questionnaire Design Review ──────────────────────────────────────────────

@router.post("/review")
async def review_questionnaire(
    req: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Analyse questionnaire design and flag issues (rule-based SME review)."""
    flaws = []
    suggestions = []

    for i, q in enumerate(req.questions):
        label = q.get("label", "")
        qtype = q.get("type", "text")
        name = q.get("name", "")
        choices = q.get("choices", "") or ""

        # Rule 1: Double-barreled question
        double_barrel_words = [" and ", " or ", " & ", " as well as "]
        if any(w in label.lower() for w in double_barrel_words):
            flaws.append({
                "question_no": i + 1,
                "field_name": name,
                "severity": "high",
                "type": "Double-barreled question",
                "description": f"Question {i+1} asks about two things simultaneously: '{label[:80]}'. Split into two separate questions.",
                "suggestion": "Separate into two distinct questions — one per concept."
            })

        # Rule 2: Too long
        if len(label) > 120:
            flaws.append({
                "question_no": i + 1,
                "field_name": name,
                "severity": "medium",
                "type": "Question too long",
                "description": f"Question {i+1} is {len(label)} characters. Enumerators on tablets prefer under 80 characters.",
                "suggestion": "Shorten to the essential ask. Move context to a hint field."
            })

        # Rule 3: Missing unit for numeric questions
        if qtype in ("integer", "decimal"):
            unit_words = ["rs.", "rs ", "rupee", "₹", "kg", "km", "litre", "days", "month", "year", "hour", "%", "percent"]
            if not any(w in label.lower() for w in unit_words):
                flaws.append({
                    "question_no": i + 1,
                    "field_name": name,
                    "severity": "medium",
                    "type": "Missing unit of measurement",
                    "description": f"Question {i+1} is numeric but has no unit: '{label[:60]}'. Respondents may answer in different units.",
                    "suggestion": "Add the unit in parentheses, e.g. '(Rs. per month)' or '(completed years)'."
                })

        # Rule 4: Ambiguous open text that should be coded
        opinion_words = ["opinion", "feel", "think about", "views on", "describe your", "explain"]
        if qtype == "text" and any(w in label.lower() for w in opinion_words) and len(label) < 100:
            flaws.append({
                "question_no": i + 1,
                "field_name": name,
                "severity": "low",
                "type": "Unstructured subjective question",
                "description": f"Question {i+1} asks for opinion/feeling as open text. This is hard to tabulate.",
                "suggestion": "Consider a Likert scale (1–5 agree/disagree) or coded response list for tabulation."
            })

        # Rule 5: Select question with too many choices
        if qtype in ("select_one", "select_multiple") and choices:
            choice_list = [c.strip() for c in choices.split(",") if c.strip()]
            if len(choice_list) > 12:
                flaws.append({
                    "question_no": i + 1,
                    "field_name": name,
                    "severity": "medium",
                    "type": "Too many choices",
                    "description": f"Question {i+1} has {len(choice_list)} response options. On a tablet screen this is hard to navigate.",
                    "suggestion": "Group choices into categories, or use a cascading select (select_one from filtered list)."
                })

        # Rule 6: Missing "Others" option for select questions
        if qtype in ("select_one", "select_multiple") and choices:
            choice_list = [c.strip().lower() for c in choices.split(",")]
            if "others" not in choice_list and "other" not in choice_list and len(choice_list) < 10:
                suggestions.append({
                    "question_no": i + 1,
                    "field_name": name,
                    "type": "Missing 'Others' option",
                    "description": f"Question {i+1} select list has no 'Others' catch-all. If real-world responses don't fit, data is forced.",
                    "suggestion": "Add 'Others (specify)' as the last choice."
                })

        # Rule 7: Field name not snake_case
        if not name.replace("_", "").isalnum() or " " in name:
            flaws.append({
                "question_no": i + 1,
                "field_name": name,
                "severity": "low",
                "type": "Invalid field name",
                "description": f"Field name '{name}' contains spaces or special characters. XLSForm requires snake_case.",
                "suggestion": "Use snake_case: e.g. 'monthly_income' not 'Monthly Income'."
            })

    # Questionnaire-level checks
    has_gps = any(q.get("type") == "geopoint" for q in req.questions)
    has_date = any(q.get("type") == "date" for q in req.questions)
    has_hh_id = any("hh_id" in q.get("name", "").lower() or "household_id" in q.get("name", "").lower() for q in req.questions)

    if not has_gps:
        suggestions.append({"type": "Missing GPS capture", "description": "No geopoint question found. Consider adding GPS location for spatial analysis and fraud detection.", "severity": "info"})
    if not has_date:
        suggestions.append({"type": "Missing interview date", "description": "No date question found. Interview date is critical for temporal analysis and field monitoring.", "severity": "info"})
    if not has_hh_id:
        flaws.append({"severity": "high", "type": "Missing household identifier", "description": "No household ID field found. Without a unique identifier, data cannot be linked across survey rounds.", "suggestion": "Add an 'hh_id' text field as the first question."})

    run_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO simulator_runs (id, survey_id, mode, params, status, flaws, n_records, created_by, finished_at)
        VALUES (:id::uuid, :sid::uuid, 'review', :params::jsonb, 'done', :flaws::jsonb, :n, :uid::uuid, NOW())
    """), {
        "id": run_id, "sid": req.survey_id,
        "params": json.dumps({"n_questions": len(req.questions)}),
        "flaws": json.dumps({"flaws": flaws, "suggestions": suggestions}),
        "n": len(req.questions), "uid": current_user["id"]
    })

    severity_order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    flaws_sorted = sorted(flaws, key=lambda f: severity_order.get(f.get("severity", "low"), 3))

    return {
        "run_id": run_id,
        "n_questions_reviewed": len(req.questions),
        "flaws": flaws_sorted,
        "suggestions": suggestions,
        "summary": {
            "total_issues": len(flaws),
            "high": sum(1 for f in flaws if f.get("severity") == "high"),
            "medium": sum(1 for f in flaws if f.get("severity") == "medium"),
            "low": sum(1 for f in flaws if f.get("severity") == "low"),
        },
        "verdict": "PASS ✓" if not flaws else ("NEEDS REVISION" if any(f.get("severity") == "high" for f in flaws) else "MINOR ISSUES")
    }


# ── Skip Logic Assistant ─────────────────────────────────────────────────────

class SkipLogicRequest(BaseModel):
    plain_english: str
    available_fields: Optional[List[dict]] = []   # [{name, type, choices}, …]


@router.post("/skip-logic")
async def generate_skip_logic(
    req: SkipLogicRequest,
    current_user: dict = Depends(get_current_user)
):
    """Convert plain English skip logic into XLSForm relevant expression."""
    expr = _parse_skip_logic(req.plain_english, req.available_fields or [])
    return {
        "input": req.plain_english,
        "xlsform_expression": expr["expression"],
        "explanation": expr["explanation"],
        "confidence": expr["confidence"]
    }


def _parse_skip_logic(text: str, fields: list) -> dict:
    """Rule-based English → XLSForm relevant expression converter."""
    import re
    t = text.lower().strip()

    # Build field lookup
    field_map = {f["name"].lower(): f["name"] for f in fields}
    field_names = list(field_map.values())

    # Common pattern rules
    # Pattern: "if X is Y" or "when X = Y"
    patterns = [
        # Age comparisons
        (r"age[^a-z]*(?:is|>|>=|greater than|more than|at least|over)\s*(\d+)",
         lambda m: (f"${{{_find_field('age', field_names)}}}>={m.group(1)}", f"age ≥ {m.group(1)} years")),
        (r"age[^a-z]*(?:<|<=|less than|under|below|younger than)\s*(\d+)",
         lambda m: (f"${{{_find_field('age', field_names)}}}<{m.group(1)}", f"age < {m.group(1)} years")),
        (r"(?:between|aged)\s*(\d+)\s*(?:and|to|-)\s*(\d+)",
         lambda m: (f"${{{_find_field('age', field_names)}}} >= {m.group(1)} and ${{{_find_field('age', field_names)}}} <= {m.group(2)}", f"age between {m.group(1)} and {m.group(2)}")),

        # Household size
        (r"hh.?size|household size|members?\s*(?:is|are|>|>=|at least|more than)\s*(\d+)",
         lambda m: (f"${{{_find_field('hh_size', field_names)}}} >= {m.group(1)}", f"household size ≥ {m.group(1)}")),

        # Sector
        (r"(?:if|when|only if)\s+(?:the\s+)?(?:household\s+)?(?:is\s+in\s+)?rural",
         lambda m: (f"${{{_find_field('sector', field_names)}}}='Rural'", "sector is Rural")),
        (r"(?:if|when|only if)\s+(?:the\s+)?(?:household\s+)?(?:is\s+in\s+)?urban",
         lambda m: (f"${{{_find_field('sector', field_names)}}}='Urban'", "sector is Urban")),

        # Child-related
        (r"child(?:ren)?\s+(?:under|below|less than|younger than)\s+(\d+)",
         lambda m: (f"${{{_find_field('hh_size', field_names)}}} > 1", f"has children under {m.group(1)}")),

        # Employment
        (r"(?:is|are)\s+(?:currently\s+)?(?:employed|working|self.?employed)",
         lambda m: (f"${{{_find_field('employment', field_names)}}}!='Attended domestic duties' and ${{{_find_field('employment', field_names)}}}!='Full-time student'", "person is employed")),
        (r"(?:is|are)\s+not\s+(?:employed|working)",
         lambda m: (f"${{{_find_field('employment', field_names)}}}='Attended domestic duties' or ${{{_find_field('employment', field_names)}}}='Casual wage labour'", "person not in regular employment")),

        # Education
        (r"(?:completed|has)\s+(?:primary|class\s+[5-8]|middle)\s+(?:school|education)",
         lambda m: (f"${{{_find_field('education', field_names)}}}!='Not literate' and ${{{_find_field('education', field_names)}}}!='Below primary'", "person has primary education")),
        (r"(?:is\s+)?(?:graduate|completed\s+graduation|college)",
         lambda m: (f"${{{_find_field('education', field_names)}}}='Graduate' or ${{{_find_field('education', field_names)}}}='Post graduate and above'", "person is graduate or above")),

        # Female / Male
        (r"\b(?:female|woman|women)\b",
         lambda m: (f"${{{_find_field('sex', field_names)}}}='Female'", "person is female")),
        (r"\b(?:male|man|men)\b",
         lambda m: (f"${{{_find_field('sex', field_names)}}}='Male'", "person is male")),

        # Yes/No answer reference
        (r"(?:if|when)\s+(?:the\s+)?(?:answer|response)\s+(?:to\s+)?(?:the\s+)?previous\s+(?:question\s+)?(?:is|=)\s*['\"]?yes['\"]?",
         lambda m: ("${prev_field}='yes'", "previous answer is Yes — update field name manually")),

        # Numeric > threshold
        (r"(?:income|expenditure|mpce|salary)\s+(?:is\s+)?(?:more than|greater than|above|over|>=|>)\s+(?:rs\.?\s*)?(\d[\d,]*)",
         lambda m: (f"${{{_find_field('mpce', field_names)}}} > {m.group(1).replace(',', '')}", f"monthly expenditure > Rs.{m.group(1)}")),
    ]

    for pattern, handler in patterns:
        m = re.search(pattern, t)
        if m:
            try:
                expr, expl = handler(m)
                return {
                    "expression": expr,
                    "explanation": expl,
                    "confidence": "high"
                }
            except Exception:
                continue

    # Generic fallback — try to extract field name and value
    # "if [field] is [value]" pattern
    m = re.search(r"(?:if|when|only if|show if)\s+(?:the\s+)?(\w[\w_\s]+?)\s+(?:is|=|equals?|==)\s+['\"]?(\w[\w\s]+?)['\"]?\s*$", t)
    if m:
        field_raw = m.group(1).strip().replace(" ", "_")
        value = m.group(2).strip()
        matched_field = _find_field(field_raw, field_names) or field_raw
        return {
            "expression": f"${{{matched_field}}}='{value}'",
            "explanation": f"Show when {matched_field} equals '{value}'",
            "confidence": "medium"
        }

    # Cannot parse — return template
    return {
        "expression": "${field_name}='value'",
        "explanation": "Could not auto-parse — please specify: 'Show this question only if [field_name] is [value]'",
        "confidence": "low"
    }


def _find_field(keyword: str, fields: list) -> str:
    """Find the best matching field name from the question list."""
    keyword = keyword.lower().replace(" ", "_")
    # Exact match first
    for f in fields:
        if keyword in f.lower():
            return f
    # Common defaults
    defaults = {
        "age": "age_years",
        "hh_size": "hh_size",
        "sector": "sector",
        "sex": "sex",
        "employment": "usual_activity_status",
        "education": "education_level",
        "mpce": "mpce_total",
        "income": "mpce_total",
    }
    for k, v in defaults.items():
        if k in keyword:
            return v
    return keyword


# ── Run history ──────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_runs(
    survey_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    q = "SELECT id, survey_id, mode, status, n_records, started_at, finished_at FROM simulator_runs"
    params = {}
    if survey_id:
        q += " WHERE survey_id = :sid::uuid"
        params["sid"] = survey_id
    q += " ORDER BY started_at DESC LIMIT 20"
    result = await db.execute(text(q), params)
    rows = result.fetchall()
    return [
        {
            "run_id": str(r.id),
            "survey_id": str(r.survey_id),
            "mode": r.mode,
            "status": r.status,
            "n_records": r.n_records,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in rows
    ]
