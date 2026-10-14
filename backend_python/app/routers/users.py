import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from app.dependencies import current_user, require_roles
from app.db import get_db
from app.schemas import PasswordReset, ProfileUpdate, RoleUpdate, StatusUpdate, UserCreate
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["Usuários"])


@router.get("")
def list_users(
    _user: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    rows = connection.execute(
        """SELECT id, name, email, role, active, created_at
           FROM users ORDER BY created_at DESC"""
    ).fetchall()
    return {"users": [dict(row) for row in rows]}


@router.get("/metrics")
def metrics(
    _user: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    total_users = connection.execute(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'comum'"
    ).fetchone()["total"]
    total_admins = connection.execute(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'"
    ).fetchone()["total"]
    subscribers = connection.execute(
        """SELECT p.name AS plan, COUNT(s.id)::int AS total
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'ativa' GROUP BY p.name ORDER BY p.name"""
    ).fetchall()
    most_watched = connection.execute(
        "SELECT id, title, view_count FROM media ORDER BY view_count DESC LIMIT 10"
    ).fetchall()
    return {
        "totalUsers": total_users,
        "totalAdmins": total_admins,
        "subscribersByPlan": [dict(row) for row in subscribers],
        "mostWatched": [dict(row) for row in most_watched],
    }


@router.put("/me")
def update_profile(
    payload: ProfileUpdate,
    user: dict = Depends(current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    if payload.name is None and payload.avatar_url is None:
        raise HTTPException(status_code=422, detail="Informe nome ou avatar_url.")
    connection.execute(
        """UPDATE users
           SET name = COALESCE(%s, name),
               avatar_url = COALESCE(%s, avatar_url),
               updated_at = NOW()
           WHERE id = %s""",
        (payload.name, payload.avatar_url, user["id"]),
    )
    connection.commit()
    return {"message": "Perfil atualizado com sucesso."}


@router.post("", status_code=201)
def create_user(
    payload: UserCreate,
    actor: dict = Depends(require_roles("superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    try:
        row = connection.execute(
            """INSERT INTO users (name, email, password_hash, role, created_by)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (payload.name, payload.email, hash_password(payload.password), payload.role, actor["id"]),
        ).fetchone()
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.") from exc
    connection.commit()
    return {"message": f'Usuário "{payload.name}" criado com papel "{payload.role}".', "userId": row["id"]}


@router.put("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: PasswordReset,
    _actor: dict = Depends(require_roles("superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s RETURNING id",
        (hash_password(payload.newPassword), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    connection.commit()
    return {"message": "Senha redefinida com sucesso."}


@router.put("/{user_id}/role")
def update_role(
    user_id: int,
    payload: RoleUpdate,
    _actor: dict = Depends(require_roles("superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        "UPDATE users SET role = %s, updated_at = NOW() WHERE id = %s RETURNING id",
        (payload.role, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    connection.commit()
    return {"message": "Papel do usuário atualizado com sucesso."}


@router.put("/{user_id}/status")
def update_status(
    user_id: int,
    payload: StatusUpdate,
    _actor: dict = Depends(require_roles("superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        "UPDATE users SET active = %s, updated_at = NOW() WHERE id = %s RETURNING id",
        (payload.active, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    connection.commit()
    return {"message": f"Usuário {'ativado' if payload.active else 'desativado'} com sucesso."}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    actor: dict = Depends(require_roles("superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    if int(actor["id"]) == user_id:
        raise HTTPException(status_code=400, detail="Você não pode remover a própria conta.")
    row = connection.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    connection.commit()
    return {"message": "Usuário removido com sucesso."}
