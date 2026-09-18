// =====================================================================
// Rotas de Salas / Poltronas: /api/rooms  (PostgreSQL remoto via pg)
// Suporta a experiencia interativa de selecao de sala e assento
// =====================================================================
const express = require('express');
const pool = require('../database/db');
const { authenticate, optionalAuthenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/rooms -> lista salas disponiveis
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rooms ORDER BY id ASC');
    res.json({ rooms: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms/:id/seats?media_id=X -> retorna o mapa de poltronas e quais ja foram escolhidas
router.get('/:id/seats', async (req, res, next) => {
  try {
    const roomRes = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
    if (roomRes.rows.length === 0) return res.status(404).json({ error: 'Sala nao encontrada.' });
    const room = roomRes.rows[0];

    const { media_id } = req.query;
    let taken = [];
    if (media_id) {
      const seatRes = await pool.query(
        'SELECT seat_row, seat_number FROM seat_selections WHERE room_id = $1 AND media_id = $2',
        [req.params.id, media_id]
      );
      taken = seatRes.rows.map(s => `${s.seat_row}${s.seat_number}`);
    }

    res.json({ room, takenSeats: taken });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:id/select-seat -> registra a escolha de poltrona do usuario
router.post('/:id/select-seat', optionalAuthenticate, async (req, res, next) => {
  try {
    const { media_id, seat_row, seat_number } = req.body;
    if (!media_id || !seat_row || !seat_number) {
      return res.status(400).json({ error: 'media_id, seat_row e seat_number sao obrigatorios.' });
    }

    await pool.query(
      'INSERT INTO seat_selections (user_id, room_id, media_id, seat_row, seat_number) VALUES ($1, $2, $3, $4, $5)',
      [req.user ? req.user.id : null, req.params.id, media_id, seat_row, seat_number]
    );

    res.status(201).json({ message: `Poltrona ${seat_row}${seat_number} reservada com sucesso!` });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms -> Admin/Super Admin cria novas salas tematicas
router.post('/', authenticate, requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { name, theme, total_rows, seats_per_row } = req.body;
    if (!name) return res.status(400).json({ error: 'O nome da sala e obrigatorio.' });

    const result = await pool.query(
      'INSERT INTO rooms (name, theme, total_rows, seats_per_row) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, theme || 'retro', total_rows || 6, seats_per_row || 8]
    );
    res.status(201).json({ message: 'Sala criada com sucesso.', roomId: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
