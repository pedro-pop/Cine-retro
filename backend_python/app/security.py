from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, status

from app.config import get_settings

ALGORITHM = "HS256"
MIN_JWT_SECRET_BYTES = 32


def require_jwt_secret() -> str:
    secret = get_settings().jwt_secret
    if len(secret.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET precisa ter pelo menos 32 bytes.",
        )
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), encoded_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(user: dict) -> str:
    settings = get_settings()
    secret = require_jwt_secret()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    return jwt.encode(
        {"sub": str(user["id"]), "role": user["role"], "exp": expires},
        secret,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    secret = require_jwt_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise jwt.InvalidTokenError("Missing subject")
        return payload
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
