import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.errors import UniqueViolation

from app.db import get_db
from app.dependencies import current_user
from app.schemas import LoginRequest, RegisterRequest
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "avatar_url": user.get("avatar_url"),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, connection: psycopg.Connection = Depends(get_db)):
    try:
        user = connection.execute(
            """INSERT INTO users (name, email, password_hash, role)
               VALUES (%s, %s, %s, 'comum')
               RETURNING id, name, email, role, avatar_url""",
            (payload.name, payload.email, hash_password(payload.password)),
        ).fetchone()
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.") from exc
    connection.commit()
    user = dict(user)
    return {
        "message": "Cadastro realizado com sucesso!",
        "token": create_access_token(user),
        "user": public_user(user),
    }


@router.post("/login")
def login(payload: LoginRequest, connection: psycopg.Connection = Depends(get_db)):
    user = connection.execute(
        """SELECT id, name, email, role, avatar_url, password_hash, active
           FROM users WHERE lower(email) = %s""",
        (payload.email,),
    ).fetchone()
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Esta conta está desativada. Contate o suporte.")
    result = dict(user)
    return {
        "message": "Login realizado com sucesso!",
        "token": create_access_token(result),
        "user": public_user(result),
    }


@router.get("/me")
def get_me(user: dict = Depends(current_user)):
    return {"user": public_user(user)}
