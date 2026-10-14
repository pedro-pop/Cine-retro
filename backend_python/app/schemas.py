from typing import Literal

from pydantic import BaseModel, Field, field_validator

Role = Literal["comum", "admin", "superadmin"]


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=6, max_length=72)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        result = value.strip()
        if not result:
            raise ValueError("O nome é obrigatório.")
        return result

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        result = value.strip().lower()
        if "@" not in result or "." not in result.rsplit("@", 1)[-1]:
            raise ValueError("Informe um e-mail válido.")
        return result

    @field_validator("password")
    @classmethod
    def bcrypt_password_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("A senha não pode exceder 72 bytes.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        result = value.strip().lower()
        if "@" not in result or "." not in result.rsplit("@", 1)[-1]:
            raise ValueError("Informe um e-mail válido.")
        return result

    @field_validator("password")
    @classmethod
    def bcrypt_password_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("A senha não pode exceder 72 bytes.")
        return value


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    avatar_url: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        result = value.strip()
        if not result:
            raise ValueError("O nome não pode ficar vazio.")
        return result


class UserCreate(RegisterRequest):
    role: Role


class PasswordReset(BaseModel):
    newPassword: str = Field(min_length=6, max_length=72)

    @field_validator("newPassword")
    @classmethod
    def bcrypt_password_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("A senha não pode exceder 72 bytes.")
        return value


class RoleUpdate(BaseModel):
    role: Role


class StatusUpdate(BaseModel):
    active: bool


class SeatReservation(BaseModel):
    media_id: int = Field(gt=0)
    seat_row: str = Field(min_length=1, max_length=5, pattern=r"^[A-Z]+$")
    seat_number: int = Field(gt=0)


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    theme: Literal["retro", "moderna"] = "retro"
    total_rows: int = Field(default=6, ge=1, le=10)
    seats_per_row: int = Field(default=8, ge=1, le=40)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        result = value.strip()
        if not result:
            raise ValueError("O nome é obrigatório.")
        return result

