// =====================================================================
// Rotas de Planos: /api/plans  (PostgreSQL remoto via pg)
// =====================================================================
const express = require('express');
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/plans -> lista publica de planos (Basico / Premium)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY price ASC');
    res.json({ plans: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/plans/:id/subscribe -> usuario logado assina um plano
router.post('/:id/subscribe', authenticate, async (req, res, next) => {
  try {
    const planRes = await pool.query('SELECT * FROM plans WHERE id = $1', [req.params.id]);
    if (planRes.rows.length === 0) return res.status(404).json({ error: 'Plano nao encontrado.' });

    // Cancela qualquer assinatura ativa anterior
    await pool.query("UPDATE subscriptions SET status = 'cancelada' WHERE user_id = $1 AND status = 'ativa'", [
      req.user.id
    ]);

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await pool.query(
      "INSERT INTO subscriptions (user_id, plan_id, status, expires_at) VALUES ($1, $2, 'ativa', $3)",
      [req.user.id, req.params.id, expiresAt]
    );

    res.status(201).json({ message: `Assinatura do plano "${planRes.rows[0].name}" realizada com sucesso!` });
  } catch (err) {
    next(err);
  }
});

// GET /api/plans/my-subscription -> assinatura ativa do usuario logado
router.get('/my-subscription', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.name AS plan_name, p.price, p.quality
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = $1 AND s.status = 'ativa'
       ORDER BY s.started_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ subscription: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
