from collections.abc import Callable

import psycopg
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_db
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def required_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


def current_user(
    token: str = Depends(required_token),
    connection: psycopg.Connection = Depends(get_db),
) -> dict:
    return lookup_user(token, connection)


def lookup_user(token: str, connection: psycopg.Connection) -> dict:
    payload = decode_access_token(token)
    user = connection.execute(
        """SELECT id, name, email, role, avatar_url, active, created_at
           FROM users WHERE id = %s""",
        (int(payload["sub"]),),
    ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Esta conta está desativada.")
    return dict(user)


def optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    connection: psycopg.Connection = Depends(get_db),
) -> dict | None:
    if credentials is None:
        return None
    return lookup_user(credentials.credentials, connection)


def require_roles(*roles: str) -> Callable:
    def check_role(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Permissão insuficiente.")
        return user

    return check_role
