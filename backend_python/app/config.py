from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / "backend_python" / ".env")


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8000"))
        self.database_url = os.getenv("DATABASE_URL", "").strip()
        self.database_sslmode = os.getenv("DATABASE_SSLMODE", "require")
        self.jwt_secret = os.getenv("JWT_SECRET", "")
        self.jwt_expires_minutes = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,"
                "http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500",
            ).split(",")
            if origin.strip()
        ]
        upload_dir = os.getenv("UPLOAD_DIR", "").strip()
        self.upload_dir = Path(upload_dir) if upload_dir else PROJECT_ROOT / "backend_python" / "uploads"
        self.max_upload_bytes = int(os.getenv("MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))


@lru_cache
def get_settings() -> Settings:
    return Settings()
