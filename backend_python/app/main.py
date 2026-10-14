import logging

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import PROJECT_ROOT, get_settings
from app.routers import auth, media, plans, rooms, users

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()
app = FastAPI(
    title="Cine Retrô API",
    version="1.0.0",
    description="API REST do Cine Retrô. Requer PostgreSQL configurado para dados persistentes.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(media.router)
app.include_router(plans.router)
app.include_router(rooms.router)

frontend_dir = PROJECT_ROOT / "frontend"
settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=frontend_dir / "assets"), name="assets")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Requisição inválida."
    body = {"error": message}
    if not isinstance(exc.detail, str):
        body["detail"] = exc.detail
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "Dados da requisição inválidos.",
            "detail": [
                {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                for error in exc.errors()
            ],
        },
    )


@app.exception_handler(psycopg.Error)
async def database_error_handler(_request: Request, exc: psycopg.Error):
    logger.exception("Erro não tratado durante uma operação do banco PostgreSQL", exc_info=exc)
    return JSONResponse(status_code=503, content={"error": "Banco de dados indisponível."})


@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, exc: Exception):
    logger.exception("Erro interno não tratado", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": "Erro interno do servidor."})


@app.get("/api/health", tags=["Infraestrutura"])
def health():
    if not settings.database_url:
        return {"status": "degraded", "database": "not_configured"}
    try:
        with psycopg.connect(
            settings.database_url,
            sslmode=settings.database_sslmode,
            connect_timeout=3,
        ) as connection:
            connection.execute("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except psycopg.Error:
        logger.warning("Health check: banco de dados indisponível")
        return {"status": "degraded", "database": "unavailable"}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(frontend_dir / "index.html")
