// =====================================================================
// Rotas de Midia (Catalogo): /api/media  (PostgreSQL remoto via pg)
// Filmes, series e novelas. Admin/Super Admin gerenciam o catalogo.
// Suporta cadastro por upload de arquivo ou por link externo.
// =====================================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../database/db');
const { authenticate, optionalAuthenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------
// Configuracao de upload de arquivos (posteres e videos)
// ---------------------------------------------------------------------
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// GET /api/media -> lista publica do catalogo (com filtros de genero e busca)
router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const { genre, search, type, featured, top10 } = req.query;
    let sql = 'SELECT * FROM media WHERE 1 = 1';
    const params = [];

    if (genre && genre.toLowerCase() !== 'todos') {
      params.push(genre);
      sql += ` AND genre = $${params.length}`;
    }
    if (search) {
      const like = `%${search}%`;
      params.push(like, like, like);
      sql += ` AND (title ILIKE $${params.length - 2} OR director ILIKE $${params.length - 1} OR cast_list ILIKE $${params.length})`;
    }
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    if (featured === 'true') {
      sql += ' AND is_featured = TRUE';
    }
    if (top10 === 'true') {
      sql += ' AND is_top10 = TRUE ORDER BY top10_rank ASC';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    const { rows } = await pool.query(sql, params);
    res.json({ media: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/media/genres -> lista de generos distintos existentes no catalogo
router.get('/genres', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT genre FROM media ORDER BY genre ASC');
    res.json({ genres: rows.map(r => r.genre) });
  } catch (err) {
    next(err);
  }
});

// GET /api/media/:id -> detalhes de uma midia especifica
router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Midia nao encontrada.' });
    res.json({ media: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/media/:id/view -> registra visualizacao e incrementa contador (metricas)
router.post('/:id/view', optionalAuthenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE media SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    await pool.query('INSERT INTO view_logs (user_id, media_id) VALUES ($1, $2)', [
      req.user ? req.user.id : null,
      req.params.id
    ]);
    res.json({ message: 'Visualizacao registrada.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/media -> Admin/Super Admin cadastra midia (upload de poster/video OU link externo)
router.post(
  '/',
  authenticate,
  requireRole('admin', 'superadmin'),
  upload.fields([{ name: 'poster', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const {
        title, synopsis, type, genre, classification, min_age, director, cast_list,
        country, producer, release_year, duration_minutes, video_source_type, video_url,
        is_featured, is_top10, top10_rank
      } = req.body;

      if (!title || !genre) {
        return res.status(400).json({ error: 'Titulo e genero sao obrigatorios.' });
      }

      const posterPath = req.files && req.files.poster
        ? `uploads/${req.files.poster[0].filename}`
        : (req.body.poster_path || null);

      const isUpload = video_source_type === 'upload';
      const videoPath = isUpload && req.files && req.files.video
        ? `uploads/${req.files.video[0].filename}`
        : null;

      const result = await pool.query(
        `INSERT INTO media
          (title, synopsis, type, genre, classification, min_age, director, cast_list, country, producer,
           release_year, duration_minutes, poster_path, video_source_type, video_path, video_url,
           is_featured, is_top10, top10_rank, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          title, synopsis || null, type || 'filme', genre, classification || 'Livre', min_age || 0,
          director || null, cast_list || null, country || null, producer || null,
          release_year || null, duration_minutes || null, posterPath,
          isUpload ? 'upload' : 'link', videoPath, isUpload ? null : (video_url || null),
          !!(is_featured === '1' || is_featured === true), !!(is_top10 === '1' || is_top10 === true),
          top10_rank || null, req.user.id
        ]
      );

      res.status(201).json({ message: 'Midia cadastrada com sucesso.', mediaId: result.rows[0].id });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/media/:id -> Admin/Super Admin edita midia existente
router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'superadmin'),
  upload.fields([{ name: 'poster', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const existingRes = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
      if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Midia nao encontrada.' });
      const existing = existingRes.rows[0];

      const b = req.body;
      const posterPath = req.files && req.files.poster
        ? `uploads/${req.files.poster[0].filename}`
        : (b.poster_path || existing.poster_path);

      const isUpload = b.video_source_type === 'upload';
      const videoPath = isUpload
        ? (req.files && req.files.video ? `uploads/${req.files.video[0].filename}` : existing.video_path)
        : null;
      const videoUrl = isUpload ? null : (b.video_url || existing.video_url);

      const isFeatured = b.is_featured !== undefined ? (b.is_featured === '1' || b.is_featured === true) : existing.is_featured;
      const isTop10 = b.is_top10 !== undefined ? (b.is_top10 === '1' || b.is_top10 === true) : existing.is_top10;

      await pool.query(
        `UPDATE media SET
          title = $1, synopsis = $2, type = $3, genre = $4, classification = $5, min_age = $6, director = $7,
          cast_list = $8, country = $9, producer = $10, release_year = $11, duration_minutes = $12,
          poster_path = $13, video_source_type = $14, video_path = $15, video_url = $16,
          is_featured = $17, is_top10 = $18, top10_rank = $19, updated_at = NOW()
         WHERE id = $20`,
        [
          b.title || existing.title, b.synopsis || existing.synopsis, b.type || existing.type,
          b.genre || existing.genre, b.classification || existing.classification,
          b.min_age !== undefined ? b.min_age : existing.min_age,
          b.director || existing.director, b.cast_list || existing.cast_list,
          b.country || existing.country, b.producer || existing.producer,
          b.release_year || existing.release_year, b.duration_minutes || existing.duration_minutes,
          posterPath, isUpload ? 'upload' : 'link', videoPath, videoUrl,
          isFeatured, isTop10,
          b.top10_rank !== undefined ? b.top10_rank : existing.top10_rank,
          req.params.id
        ]
      );

      res.json({ message: 'Midia atualizada com sucesso.' });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/media/:id -> Admin/Super Admin remove midia do catalogo
router.delete('/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM media WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Midia nao encontrada.' });
    res.json({ message: 'Midia removida do catalogo com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
