import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db
from app.dependencies import current_user

router = APIRouter(prefix="/api/plans", tags=["Planos e assinaturas"])


@router.get("")
def list_plans(connection: psycopg.Connection = Depends(get_db)):
    rows = connection.execute("SELECT * FROM plans ORDER BY price ASC").fetchall()
    return {"plans": [dict(row) for row in rows]}


@router.post("/{plan_id}/subscribe", status_code=201)
def subscribe(
    plan_id: int,
    user: dict = Depends(current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    plan = connection.execute("SELECT id, name FROM plans WHERE id = %s FOR SHARE", (plan_id,)).fetchone()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    connection.execute(
        "SELECT id FROM users WHERE id = %s FOR UPDATE",
        (user["id"],),
    )
    connection.execute(
        "UPDATE subscriptions SET status = 'cancelada' WHERE user_id = %s AND status = 'ativa'",
        (user["id"],),
    )
    connection.execute(
        """INSERT INTO subscriptions (user_id, plan_id, status, expires_at)
           VALUES (%s, %s, 'ativa', NOW() + INTERVAL '1 month')""",
        (user["id"], plan_id),
    )
    connection.commit()
    return {"message": f'Assinatura do plano "{plan["name"]}" realizada com sucesso!'}


@router.get("/my-subscription")
def my_subscription(
    user: dict = Depends(current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        """SELECT s.*, p.name AS plan_name, p.price, p.quality
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = %s AND s.status = 'ativa'
           ORDER BY s.started_at DESC LIMIT 1""",
        (user["id"],),
    ).fetchone()
    return {"subscription": dict(row) if row else None}
