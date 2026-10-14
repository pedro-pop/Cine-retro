import psycopg
from fastapi import HTTPException
from psycopg.errors import UniqueViolation


def reserve_seat(
    connection: psycopg.Connection,
    *,
    room_id: int,
    media_id: int,
    seat_row: str,
    seat_number: int,
    user_id: int | None,
) -> None:
    room = connection.execute(
        "SELECT total_rows, seats_per_row FROM rooms WHERE id = %s FOR UPDATE",
        (room_id,),
    ).fetchone()
    if room is None:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    media = connection.execute("SELECT id FROM media WHERE id = %s", (media_id,)).fetchone()
    if media is None:
        raise HTTPException(status_code=404, detail="Mídia não encontrada.")

    row_index = 0
    for char in seat_row:
        row_index = row_index * 26 + ord(char) - ord("A") + 1
    if row_index > min(room["total_rows"], 10) or seat_number > room["seats_per_row"]:
        raise HTTPException(status_code=422, detail="A poltrona não pertence a esta sala.")

    connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(%s), hashtext(%s))",
        (f"cine-retro-room-{room_id}", f"media-{media_id}-seat-{seat_row}-{seat_number}"),
    )
    occupied = connection.execute(
        """SELECT id FROM seat_selections
           WHERE room_id = %s AND media_id = %s
             AND seat_row = %s AND seat_number = %s
           LIMIT 1""",
        (room_id, media_id, seat_row, seat_number),
    ).fetchone()
    if occupied is not None:
        raise HTTPException(status_code=409, detail="Esta poltrona já está reservada.")

    try:
        connection.execute(
            """INSERT INTO seat_selections
               (user_id, room_id, media_id, seat_row, seat_number)
               VALUES (%s, %s, %s, %s, %s)""",
            (user_id, room_id, media_id, seat_row, seat_number),
        )
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Esta poltrona já está reservada.") from exc


def move_seat(
    connection: psycopg.Connection,
    *,
    room_id: int,
    media_id: int,
    seat_row: str,
    seat_number: int,
    user_id: int,
) -> None:
    room = connection.execute(
        "SELECT total_rows, seats_per_row FROM rooms WHERE id = %s FOR UPDATE",
        (room_id,),
    ).fetchone()
    if room is None:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    row_index = 0
    for char in seat_row:
        row_index = row_index * 26 + ord(char) - ord("A") + 1
    if row_index > min(room["total_rows"], 10) or seat_number > room["seats_per_row"]:
        raise HTTPException(status_code=422, detail="A poltrona não pertence a esta sala.")

    connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(%s), hashtext(%s))",
        (f"cine-retro-room-{room_id}", f"media-{media_id}-seat-{seat_row}-{seat_number}"),
    )
    current = connection.execute(
        """SELECT id FROM seat_selections
           WHERE user_id = %s AND room_id = %s AND media_id = %s
           ORDER BY selected_at DESC LIMIT 1 FOR UPDATE""",
        (user_id, room_id, media_id),
    ).fetchone()
    if current is None:
        raise HTTPException(status_code=404, detail="Não há poltrona ativa para trocar.")

    occupied = connection.execute(
        """SELECT id FROM seat_selections
           WHERE room_id = %s AND media_id = %s
             AND seat_row = %s AND seat_number = %s AND id <> %s
           LIMIT 1""",
        (room_id, media_id, seat_row, seat_number, current["id"]),
    ).fetchone()
    if occupied is not None:
        raise HTTPException(status_code=409, detail="Esta poltrona já está reservada.")

    try:
        connection.execute(
            """UPDATE seat_selections
               SET seat_row = %s, seat_number = %s, selected_at = NOW()
               WHERE id = %s""",
            (seat_row, seat_number, current["id"]),
        )
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Esta poltrona já está reservada.") from exc
