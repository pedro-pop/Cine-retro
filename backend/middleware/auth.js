// =====================================================================
// Middleware de autenticacao (JWT) e controle de acesso por papeis (RBAC)
// =====================================================================
const jwt = require('jsonwebtoken');

// Verifica se o token JWT enviado no header Authorization e valido
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticacao nao fornecido.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, name, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
}

// Middleware opcional: segue mesmo sem token, mas popula req.user se houver um valido
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // token invalido, apenas ignora
  }
  next();
}

// Gera um middleware que so permite acesso a papeis especificos
// Uso: requireRole('admin', 'superadmin')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario nao autenticado.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Voce nao tem permissao para acessar este recurso.' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRole };
