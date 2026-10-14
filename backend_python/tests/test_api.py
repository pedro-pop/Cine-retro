from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.dependencies import current_user
from app.main import app, health, settings
from app.security import create_access_token, decode_access_token, hash_password, verify_password
from app.services.seats import reserve_seat
from fastapi import HTTPException


class Result:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self):
        self.reservations = []
        self.committed = False

    def execute(self, sql, params=()):
        if "SELECT total_rows, seats_per_row FROM rooms" in sql:
            return Result({"total_rows": 6, "seats_per_row": 8})
        if "SELECT id FROM media" in sql:
            return Result({"id": params[0]})
        if "pg_advisory_xact_lock" in sql:
            return Result({})
        if "SELECT id FROM seat_selections" in sql and "user_id" in sql:
            user_id, room_id, media_id = params
            match = next(
                (
                    row for row in reversed(self.reservations)
                    if (row["user_id"], row["room_id"], row["media_id"])
                    == (user_id, room_id, media_id)
                ),
                None,
            )
            return Result(match)
        if "SELECT id FROM seat_selections" in sql and "seat_row" in sql:
            room_id, media_id, seat_row, seat_number = params[:4]
            match = next(
                (
                    row for row in self.reservations
                    if (row["room_id"], row["media_id"], row["seat_row"], row["seat_number"])
                    == (room_id, media_id, seat_row, seat_number)
                ),
                None,
            )
            return Result(match)
        if "INSERT INTO seat_selections" in sql:
            user_id, room_id, media_id, seat_row, seat_number = params
            self.reservations.append({
                "id": len(self.reservations) + 1,
                "user_id": user_id,
                "room_id": room_id,
                "media_id": media_id,
                "seat_row": seat_row,
                "seat_number": seat_number,
            })
            return Result({})
        if "UPDATE seat_selections" in sql:
            seat_row, seat_number, row_id = params
            row = next(row for row in self.reservations if row["id"] == row_id)
            row["seat_row"] = seat_row
            row["seat_number"] = seat_number
            return Result(row)
        raise AssertionError(f"Unexpected SQL in test: {sql}")

    def commit(self):
        self.committed = True


@pytest.fixture
def fake_connection():
    connection = FakeConnection()

    def override_get_db():
        yield connection

    app.dependency_overrides[get_db] = override_get_db
    yield connection
    app.dependency_overrides.clear()


def test_health_reports_unconfigured_database(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    assert health() == {"status": "degraded", "database": "not_configured"}


def test_validation_uses_error_envelope(fake_connection):
    response = TestClient(app).post(
        "/api/auth/login",
        json={"email": "not-an-email", "password": ""},
    )
    assert response.status_code == 422
    assert response.json()["error"] == "Dados da requisição inválidos."
    assert response.json()["detail"]


def test_admin_route_requires_authentication(fake_connection):
    response = TestClient(app).get("/api/users")
    assert response.status_code == 401
    assert response.json()["error"] == "Autenticação necessária."


def test_missing_token_is_rejected_before_database_access(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    response = TestClient(app).get("/api/users")
    assert response.status_code == 401
    assert response.json()["error"] == "Autenticação necessária."


def test_common_user_is_forbidden_from_admin_route(fake_connection):
    app.dependency_overrides[current_user] = lambda: {
        "id": 12,
        "role": "comum",
        "active": True,
    }
    response = TestClient(app).get("/api/users")
    assert response.status_code == 403
    assert response.json()["error"] == "Permissão insuficiente."



def test_duplicate_seat_is_rejected_by_service():
    connection = FakeConnection()
    values = {
        "room_id": 1,
        "media_id": 7,
        "seat_row": "C",
        "seat_number": 2,
        "user_id": None,
    }
    reserve_seat(connection, **values)
    with pytest.raises(HTTPException) as raised:
        reserve_seat(connection, **values)
    assert raised.value.status_code == 409


def test_seat_change_updates_existing_reservation_only_after_availability_check():
    from app.services.seats import move_seat

    connection = FakeConnection()
    reserve_seat(connection, room_id=1, media_id=7, seat_row="C", seat_number=2, user_id=12)
    reserve_seat(connection, room_id=1, media_id=7, seat_row="C", seat_number=3, user_id=13)

    with pytest.raises(HTTPException) as raised:
        move_seat(
            connection,
            room_id=1,
            media_id=7,
            seat_row="C",
            seat_number=3,
            user_id=12,
        )
    assert raised.value.status_code == 409
    assert connection.reservations[0]["seat_number"] == 2

    move_seat(
        connection,
        room_id=1,
        media_id=7,
        seat_row="D",
        seat_number=2,
        user_id=12,
    )
    assert connection.reservations[0]["seat_row"] == "D"
    assert connection.reservations[0]["seat_number"] == 2
    assert len(connection.reservations) == 2


def test_seat_endpoint_returns_conflict_and_commits_only_first_reservation(fake_connection):
    client = TestClient(app)
    payload = {"media_id": 7, "seat_row": "C", "seat_number": 2}
    first = client.post("/api/rooms/1/select-seat", json=payload)
    duplicate = client.post("/api/rooms/1/select-seat", json=payload)

    assert first.status_code == 201
    assert first.json()["message"] == "Poltrona C2 reservada com sucesso!"
    assert duplicate.status_code == 409
    assert duplicate.json()["error"] == "Esta poltrona já está reservada."
    assert fake_connection.committed is True
    assert len(fake_connection.reservations) == 1


def test_seat_validation_and_out_of_bounds(fake_connection):
    client = TestClient(app)
    response = client.post(
        "/api/rooms/1/select-seat",
        json={"media_id": 7, "seat_row": "z", "seat_number": 0},
    )
    assert response.status_code == 422


def test_password_hashing_does_not_store_plaintext():
    encoded = hash_password("correct horse")
    assert encoded != "correct horse"
    assert verify_password("correct horse", encoded)
    assert not verify_password("wrong", encoded)


def test_jwt_uses_configured_secret_and_encodes_user_id(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "unit-test-secret-with-more-than-32-bytes")
    token = create_access_token({"id": 12, "role": "comum"})
    payload = decode_access_token(token)
    assert payload["sub"] == "12"
    assert payload["role"] == "comum"


def test_registered_route_inventory_matches_contract():
    expected = {
        ("GET", "/api/health"),
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/login"),
        ("GET", "/api/auth/me"),
        ("GET", "/api/users"),
        ("GET", "/api/users/metrics"),
        ("PUT", "/api/users/me"),
        ("POST", "/api/users"),
        ("PUT", "/api/users/{user_id}/reset-password"),
        ("PUT", "/api/users/{user_id}/role"),
        ("PUT", "/api/users/{user_id}/status"),
        ("DELETE", "/api/users/{user_id}"),
        ("GET", "/api/media"),
        ("GET", "/api/media/genres"),
        ("GET", "/api/media/{media_id}"),
        ("POST", "/api/media/{media_id}/view"),
        ("POST", "/api/media"),
        ("PUT", "/api/media/{media_id}"),
        ("DELETE", "/api/media/{media_id}"),
        ("GET", "/api/plans"),
        ("POST", "/api/plans/{plan_id}/subscribe"),
        ("GET", "/api/plans/my-subscription"),
        ("GET", "/api/rooms"),
        ("GET", "/api/rooms/{room_id}/seats"),
        ("POST", "/api/rooms/{room_id}/select-seat"),
        ("PUT", "/api/rooms/{room_id}/select-seat"),
        ("POST", "/api/rooms"),
    }
    actual = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/")
        for method in operations
    }
    assert actual == expected

    contract = Path(__file__).resolve().parents[2] / "docs" / "API_CONTRACT.md"
    documented = contract.read_text(encoding="utf-8")
    assert all(path in documented for _method, path in expected)

    frontend = contract.parents[1] / "frontend" / "assets" / "js" / "app.js"
    frontend_source = frontend.read_text(encoding="utf-8")
    assert all(
        endpoint in frontend_source
        for endpoint in (
            "'/auth/login'",
            "'/auth/register'",
            "'/auth/me'",
            "'/media'",
            "'/plans'",
            "'/plans/my-subscription'",
            "'/rooms'",
            "'/users'",
            "'/users/metrics'",
        )
    )
    assert "`/rooms/${room.id}/select-seat`" in frontend_source
