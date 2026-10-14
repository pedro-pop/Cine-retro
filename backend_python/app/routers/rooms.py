import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.db import get_db
from app.dependencies import current_user, optional_current_user, require_roles
from app.schemas import RoomCreate, SeatReservation
from app.services.seats import move_seat, reserve_seat

router = APIRouter(prefix="/api/rooms", tags=["Salas e poltronas"])


@router.get("")
def list_rooms(connection: psycopg.Connection = Depends(get_db)):
    rows = connection.execute("SELECT * FROM rooms ORDER BY id ASC").fetchall()
    return {"rooms": [dict(row) for row in rows]}


@router.get("/{room_id}/seats")
def list_seats(
    room_id: int,
    media_id: int | None = Query(default=None, gt=0),
    user: dict | None = Depends(optional_current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    room = connection.execute("SELECT * FROM rooms WHERE id = %s", (room_id,)).fetchone()
    if room is None:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")
    taken: list[str] = []
    my_seat = None
    if media_id is not None:
        rows = connection.execute(
            """SELECT seat_row, seat_number FROM seat_selections
               WHERE room_id = %s AND media_id = %s""",
            (room_id, media_id),
        ).fetchall()
        taken = [f'{row["seat_row"]}{row["seat_number"]}' for row in rows]
        if user is not None:
            row = connection.execute(
                """SELECT seat_row, seat_number FROM seat_selections
                   WHERE room_id = %s AND media_id = %s AND user_id = %s
                   ORDER BY selected_at DESC LIMIT 1""",
                (room_id, media_id, user["id"]),
            ).fetchone()
            if row is not None:
                my_seat = {"row": row["seat_row"], "number": row["seat_number"]}
    return {"room": dict(room), "takenSeats": taken, "mySeat": my_seat}


@router.post("/{room_id}/select-seat", status_code=201)
def select_seat(
    room_id: int,
    payload: SeatReservation,
    user: dict | None = Depends(optional_current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    reserve_seat(
        connection,
        room_id=room_id,
        media_id=payload.media_id,
        seat_row=payload.seat_row,
        seat_number=payload.seat_number,
        user_id=user["id"] if user else None,
    )
    connection.commit()
    return {"message": f"Poltrona {payload.seat_row}{payload.seat_number} reservada com sucesso!"}


@router.put("/{room_id}/select-seat")
def change_seat(
    room_id: int,
    payload: SeatReservation,
    user: dict = Depends(current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    move_seat(
        connection,
        room_id=room_id,
        media_id=payload.media_id,
        seat_row=payload.seat_row,
        seat_number=payload.seat_number,
        user_id=user["id"],
    )
    connection.commit()
    return {"message": f"Poltrona alterada para {payload.seat_row}{payload.seat_number}."}


@router.post("", status_code=201)
def create_room(
    payload: RoomCreate,
    _user: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        """INSERT INTO rooms (name, theme, total_rows, seats_per_row)
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (payload.name, payload.theme, payload.total_rows, payload.seats_per_row),
    ).fetchone()
    connection.commit()
    return {"message": "Sala criada com sucesso.", "roomId": row["id"]}
