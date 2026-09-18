// =====================================================================
// Rotas de Usuarios: /api/users  (PostgreSQL remoto via pg)
// Gestao de usuarios, papeis (RBAC) e metricas de assinantes.
// Regras:
//  - Um usuario comum so consegue ver/editar o proprio perfil.
//  - Admin pode listar usuarios (para suporte), mas NAO cria admins.
//  - Somente Super Admin pode criar Admins, Super Admins, redefinir senhas
//    de qualquer usuario e remover contas.
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users -> lista usuarios (admin e superadmin)
router.get('/', authenticate, requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/metrics -> metricas de assinantes (admin e superadmin)
router.get('/metrics', authenticate, requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const totalUsersRes = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'comum'");
    const totalAdminsRes = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'");

    const subscribersByPlanRes = await pool.query(`
      SELECT p.name AS plan, COUNT(s.id)::int AS total
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.status = 'ativa'
      GROUP BY p.name
    `);

    const mostWatchedRes = await pool.query(`
      SELECT id, title, view_count FROM media ORDER BY view_count DESC LIMIT 10
    `);

    res.json({
      totalUsers: totalUsersRes.rows[0].total,
      totalAdmins: totalAdminsRes.rows[0].total,
      subscribersByPlan: subscribersByPlanRes.rows,
      mostWatched: mostWatchedRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me -> usuario comum atualiza o proprio perfil
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { name, avatar_url } = req.body;
    await pool.query(
      'UPDATE users SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url), updated_at = NOW() WHERE id = $3',
      [name || null, avatar_url || null, req.user.id]
    );
    res.json({ message: 'Perfil atualizado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/users -> Super Admin cria Usuario Comum, Admin ou outro Super Admin
router.post('/', authenticate, requireRole('superadmin'), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const validRoles = ['comum', 'admin', 'superadmin'];

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Nome, e-mail, senha e papel (role) sao obrigatorios.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Papel invalido. Use comum, admin ou superadmin.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, email, passwordHash, role, req.user.id]
    );

    res.status(201).json({ message: `Usuario "${name}" criado com papel "${role}".`, userId: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/reset-password -> Super Admin redefine senha de qualquer usuario
router.put('/:id/reset-password', authenticate, requireRole('superadmin'), async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      req.params.id
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json({ message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/role -> Super Admin altera o papel de um usuario
router.put('/:id/role', authenticate, requireRole('superadmin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['comum', 'admin', 'superadmin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Papel invalido.' });
    }
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, req.params.id]);
    res.json({ message: 'Papel do usuario atualizado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/status -> Super Admin ativa/desativa uma conta
router.put('/:id/status', authenticate, requireRole('superadmin'), async (req, res, next) => {
  try {
    const { active } = req.body;
    await pool.query('UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2', [!!active, req.params.id]);
    res.json({ message: `Usuario ${active ? 'ativado' : 'desativado'} com sucesso.` });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id -> Super Admin remove um usuario
router.delete('/:id', authenticate, requireRole('superadmin'), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Voce nao pode remover a propria conta.' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json({ message: 'Usuario removido com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
