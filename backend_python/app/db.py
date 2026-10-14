import logging
from collections.abc import Generator

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from app.config import get_settings

logger = logging.getLogger(__name__)


def get_db() -> Generator[psycopg.Connection, None, None]:
    settings = get_settings()
    if not settings.database_url:
        raise HTTPException(status_code=503, detail="Banco de dados não configurado.")

    try:
        with psycopg.connect(
            settings.database_url,
            sslmode=settings.database_sslmode,
            connect_timeout=5,
            row_factory=dict_row,
        ) as connection:
            yield connection
    except psycopg.Error as exc:
        logger.exception("Falha na conexão ou operação PostgreSQL")
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.") from exc
