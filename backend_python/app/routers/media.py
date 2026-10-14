from pathlib import Path
from uuid import uuid4

import psycopg
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.db import get_db
from app.dependencies import optional_current_user, require_roles

router = APIRouter(prefix="/api/media", tags=["Catálogo e mídia"])
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}


async def save_upload(upload: UploadFile | None, kind: str) -> str | None:
    if upload is None or not upload.filename:
        return None
    suffix = Path(upload.filename).suffix.lower()
    allowed = IMAGE_EXTENSIONS if kind == "poster" else VIDEO_EXTENSIONS
    if suffix not in allowed:
        raise HTTPException(status_code=422, detail=f"Formato de arquivo {kind} não permitido.")
    if kind == "poster" and not (upload.content_type or "").startswith("image/"):
        raise HTTPException(status_code=422, detail="O arquivo de capa precisa ser uma imagem.")
    if kind == "video" and not (upload.content_type or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="O arquivo enviado precisa ser um vídeo.")

    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}{suffix}"
    destination = settings.upload_dir / stored_name
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="O arquivo excede o limite permitido.")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
    return f"/uploads/{stored_name}"


def parse_form_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@router.get("")
def list_media(
    search: str | None = None,
    genre: str | None = None,
    type: str | None = None,
    featured: bool | None = None,
    top10: bool | None = None,
    connection: psycopg.Connection = Depends(get_db),
):
    clauses: list[str] = []
    values: list[object] = []
    if search:
        clauses.append("(title ILIKE %s OR synopsis ILIKE %s)")
        values.extend((f"%{search.strip()}%", f"%{search.strip()}%"))
    if genre:
        clauses.append("genre = %s")
        values.append(genre)
    if type:
        clauses.append("type = %s")
        values.append(type)
    if featured is not None:
        clauses.append("is_featured = %s")
        values.append(featured)
    if top10 is not None:
        clauses.append("is_top10 = %s")
        values.append(top10)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = connection.execute(
        f"SELECT * FROM media{where} ORDER BY is_featured DESC, top10_rank NULLS LAST, created_at DESC",
        tuple(values),
    ).fetchall()
    return {"media": [dict(row) for row in rows]}


@router.get("/genres")
def list_genres(connection: psycopg.Connection = Depends(get_db)):
    rows = connection.execute(
        "SELECT DISTINCT genre FROM media WHERE genre IS NOT NULL ORDER BY genre"
    ).fetchall()
    return {"genres": [row["genre"] for row in rows]}


@router.get("/{media_id}")
def get_media(media_id: int, connection: psycopg.Connection = Depends(get_db)):
    row = connection.execute("SELECT * FROM media WHERE id = %s", (media_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Mídia não encontrada.")
    return {"media": dict(row)}


@router.post("/{media_id}/view", status_code=201)
def record_view(
    media_id: int,
    user: dict | None = Depends(optional_current_user),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute(
        "UPDATE media SET view_count = view_count + 1 WHERE id = %s RETURNING id",
        (media_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Mídia não encontrada.")
    connection.execute(
        "INSERT INTO view_logs (user_id, media_id) VALUES (%s, %s)",
        (user["id"] if user else None, media_id),
    )
    connection.commit()
    return {"message": "Visualização registrada."}


@router.post("", status_code=201)
async def create_media(
    title: str = Form(min_length=1, max_length=200),
    synopsis: str = Form(default=""),
    type: str = Form(default="filme"),
    genre: str = Form(min_length=1, max_length=60),
    classification: str = Form(default="Livre"),
    min_age: int = Form(default=0, ge=0, le=21),
    director: str = Form(default=""),
    cast_list: str = Form(default=""),
    country: str = Form(default=""),
    producer: str = Form(default=""),
    release_year: int | None = Form(default=None, ge=1888, le=2200),
    duration_minutes: int | None = Form(default=None, gt=0, le=10000),
    video_source_type: str = Form(default="link"),
    video_url: str = Form(default=""),
    is_featured: str = Form(default="0"),
    is_top10: str = Form(default="0"),
    video: UploadFile | None = File(default=None),
    poster: UploadFile | None = File(default=None),
    actor: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    if type not in {"filme", "serie", "novela"}:
        raise HTTPException(status_code=422, detail="Tipo de mídia inválido.")
    if video_source_type not in {"upload", "link"}:
        raise HTTPException(status_code=422, detail="Origem do vídeo inválida.")
    if video_source_type == "link" and not video_url.strip():
        raise HTTPException(status_code=422, detail="Informe a URL do vídeo.")
    if video_source_type == "upload" and video is None:
        raise HTTPException(status_code=422, detail="Envie um arquivo de vídeo.")

    poster_path = await save_upload(poster, "poster")
    video_path = await save_upload(video, "video") if video_source_type == "upload" else None
    try:
        row = connection.execute(
            """INSERT INTO media
               (title, synopsis, type, genre, classification, min_age, director,
                cast_list, country, producer, release_year, duration_minutes,
                poster_path, video_source_type, video_path, video_url,
                is_featured, is_top10, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                       %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                title.strip(), synopsis, type, genre.strip(), classification, min_age,
                director, cast_list, country, producer, release_year, duration_minutes,
                poster_path, video_source_type, video_path, video_url or None,
                parse_form_bool(is_featured), parse_form_bool(is_top10), actor["id"],
            ),
        ).fetchone()
        connection.commit()
    except Exception:
        for path in (poster_path, video_path):
            if path:
                (get_settings().upload_dir / Path(path).name).unlink(missing_ok=True)
        raise
    return {"message": "Mídia adicionada com sucesso.", "mediaId": row["id"]}


@router.put("/{media_id}")
async def update_media(
    media_id: int,
    title: str = Form(min_length=1, max_length=200),
    synopsis: str = Form(default=""),
    type: str = Form(default="filme"),
    genre: str = Form(min_length=1, max_length=60),
    classification: str = Form(default="Livre"),
    min_age: int = Form(default=0, ge=0, le=21),
    director: str = Form(default=""),
    cast_list: str = Form(default=""),
    country: str = Form(default=""),
    producer: str = Form(default=""),
    release_year: int | None = Form(default=None, ge=1888, le=2200),
    duration_minutes: int | None = Form(default=None, gt=0, le=10000),
    video_source_type: str = Form(default="link"),
    video_url: str = Form(default=""),
    is_featured: str = Form(default="0"),
    is_top10: str = Form(default="0"),
    video: UploadFile | None = File(default=None),
    poster: UploadFile | None = File(default=None),
    _actor: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    if type not in {"filme", "serie", "novela"} or video_source_type not in {"upload", "link"}:
        raise HTTPException(status_code=422, detail="Tipo de mídia ou origem do vídeo inválidos.")
    existing = connection.execute(
        "SELECT poster_path, video_path FROM media WHERE id = %s",
        (media_id,),
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="Mídia não encontrada.")
    poster_path = await save_upload(poster, "poster") or existing["poster_path"]
    video_path = await save_upload(video, "video") or existing["video_path"]
    if video_source_type == "link":
        video_path = None
        if not video_url.strip():
            raise HTTPException(status_code=422, detail="Informe a URL do vídeo.")
    elif video is None and not existing["video_path"]:
        raise HTTPException(status_code=422, detail="Envie um arquivo de vídeo.")

    connection.execute(
        """UPDATE media SET title = %s, synopsis = %s, type = %s, genre = %s,
           classification = %s, min_age = %s, director = %s, cast_list = %s,
           country = %s, producer = %s, release_year = %s, duration_minutes = %s,
           poster_path = %s, video_source_type = %s, video_path = %s, video_url = %s,
           is_featured = %s, is_top10 = %s, updated_at = NOW()
           WHERE id = %s""",
        (
            title.strip(), synopsis, type, genre.strip(), classification, min_age,
            director, cast_list, country, producer, release_year, duration_minutes,
            poster_path, video_source_type, video_path, video_url or None,
            parse_form_bool(is_featured), parse_form_bool(is_top10), media_id,
        ),
    )
    connection.commit()
    return {"message": "Mídia atualizada com sucesso."}


@router.delete("/{media_id}")
def delete_media(
    media_id: int,
    _actor: dict = Depends(require_roles("admin", "superadmin")),
    connection: psycopg.Connection = Depends(get_db),
):
    row = connection.execute("DELETE FROM media WHERE id = %s RETURNING id", (media_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Mídia não encontrada.")
    connection.commit()
    return {"message": "Mídia removida com sucesso."}
