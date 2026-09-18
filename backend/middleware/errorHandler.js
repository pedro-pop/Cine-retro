// =====================================================================
// Middleware central de tratamento de erros
// =====================================================================
function notFoundHandler(req, res, next) {
  res.status(404).json({ error: `Rota nao encontrada: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error('[ERRO]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Erro interno do servidor.'
  });
}

module.exports = { notFoundHandler, errorHandler };
