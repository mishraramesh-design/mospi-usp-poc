"""
Question Bank router — semantic search over MoSPI historical questions.
Uses pg_trgm for similarity search (no SLM dependency needed for POC).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()


@router.get("")
async def search_questions(
    q: Optional[str] = Query(None, description="Search text"),
    source: Optional[str] = Query(None, description="Filter by source survey"),
    section: Optional[str] = Query(None, description="Filter by section"),
    q_type: Optional[str] = Query(None, description="Filter by question type"),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Search question bank with trigram similarity ranking."""
    base = """
        SELECT
            id, question_text, field_name, question_type,
            choices, source_survey, source_round, section, tags, usage_count,
            CASE WHEN :q IS NOT NULL THEN
                greatest(
                    similarity(lower(question_text), lower(:q)),
                    similarity(lower(field_name), lower(:q)),
                    CASE WHEN tags @> ARRAY[lower(:q)] THEN 0.8 ELSE 0 END
                )
            ELSE 1.0 END AS score
        FROM question_bank
        WHERE is_active = TRUE
    """
    conditions = []
    params: dict = {"q": q, "limit": limit}

    if q:
        conditions.append("""(
            similarity(lower(question_text), lower(:q)) > 0.08
            OR similarity(lower(field_name), lower(:q)) > 0.08
            OR question_text ILIKE :qlike
            OR field_name ILIKE :qlike
            OR :q = ANY(tags)
        )""")
        params["qlike"] = f"%{q}%"

    if source:
        conditions.append("source_survey = :source")
        params["source"] = source

    if section:
        conditions.append("section ILIKE :section")
        params["section"] = f"%{section}%"

    if q_type:
        conditions.append("question_type = :q_type")
        params["q_type"] = q_type

    if conditions:
        base += " AND " + " AND ".join(conditions)

    base += " ORDER BY score DESC, usage_count DESC LIMIT :limit"

    result = await db.execute(text(base), params)
    rows = result.fetchall()

    return [
        {
            "id": str(r.id),
            "question_text": r.question_text,
            "field_name": r.field_name,
            "question_type": r.question_type,
            "choices": r.choices,
            "source_survey": r.source_survey,
            "source_round": r.source_round,
            "section": r.section,
            "tags": r.tags or [],
            "usage_count": r.usage_count,
            "score": round(float(r.score), 3),
        }
        for r in rows
    ]


@router.get("/sources")
async def get_sources(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """List all source surveys with question counts."""
    result = await db.execute(text("""
        SELECT source_survey, COUNT(*) as count
        FROM question_bank WHERE is_active = TRUE
        GROUP BY source_survey ORDER BY count DESC
    """))
    return [{"source": r.source_survey, "count": r.count} for r in result.fetchall()]


@router.get("/sections")
async def get_sections(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT DISTINCT section FROM question_bank
        WHERE is_active = TRUE AND section IS NOT NULL
        ORDER BY section
    """))
    return [r.section for r in result.fetchall()]


@router.post("/{question_id}/use")
async def record_usage(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Increment usage counter when a question is added to a form."""
    await db.execute(text("""
        UPDATE question_bank SET usage_count = usage_count + 1
        WHERE id = :qid::uuid
    """), {"qid": question_id})
    return {"ok": True}


class QuestionCreate(BaseModel):
    question_text: str
    field_name: str
    question_type: str
    choices: Optional[str] = None
    source_survey: str
    source_round: Optional[str] = None
    section: Optional[str] = None
    tags: Optional[List[str]] = []


@router.post("")
async def add_question(
    payload: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Add a new question to the bank (admin/supervisor only)."""
    if current_user["role"] not in ("admin", "supervisor"):
        from fastapi import HTTPException
        raise HTTPException(403, "Insufficient permissions")

    result = await db.execute(text("""
        INSERT INTO question_bank
            (question_text, field_name, question_type, choices, source_survey, source_round, section, tags)
        VALUES
            (:question_text, :field_name, :question_type, :choices, :source_survey, :source_round, :section, :tags)
        RETURNING id
    """), {
        "question_text": payload.question_text,
        "field_name": payload.field_name,
        "question_type": payload.question_type,
        "choices": payload.choices,
        "source_survey": payload.source_survey,
        "source_round": payload.source_round,
        "section": payload.section,
        "tags": payload.tags or [],
    })
    new_id = result.fetchone().id
    return {"id": str(new_id), "message": "Question added to bank"}
