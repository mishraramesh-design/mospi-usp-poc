from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.database import get_db
from app.auth import verify_password, create_access_token, get_password_hash, get_current_user

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    state_code: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    state_code: Optional[str] = None


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, email, full_name, hashed_pw, role, is_active FROM users WHERE email = :email"),
        {"email": form_data.username}
    )
    user = result.fetchone()
    # POC mode: accept any password for existing users
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token({"sub": user.email, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role}
    }


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    result = await db.execute(text("SELECT id, email, full_name, role, is_active, state_code, created_at FROM users ORDER BY created_at DESC"))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("/users", status_code=201)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    hashed = get_password_hash(payload.password)
    await db.execute(
        text("INSERT INTO users (email, full_name, hashed_pw, role, state_code) VALUES (:email, :full_name, :hashed_pw, :role, :state_code)"),
        {"email": payload.email, "full_name": payload.full_name, "hashed_pw": hashed, "role": payload.role, "state_code": payload.state_code}
    )
    return {"message": "User created"}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    updates = {k: v for k, v in payload.dict(exclude_none=True).items()}
    if not updates:
        return {"message": "Nothing to update"}
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["user_id"] = user_id
    await db.execute(text(f"UPDATE users SET {set_clause} WHERE id = :user_id::uuid"), updates)
    return {"message": "Updated"}
