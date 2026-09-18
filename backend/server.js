// =====================================================================
// CINE RETRO - Servidor principal (Node.js + Express + PostgreSQL remoto)
// =====================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { runMigrations } = require('./database/migrate');
const authRoutes = require('./api/auth');
const usersRoutes = require('./api/users');
const mediaRoutes = require('./api/media');
const plansRoutes = require('./api/plans');
const roomsRoutes = require('./api/rooms');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// Middlewares globais
// ---------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Pasta de uploads (posteres/videos enviados pelo Admin)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ---------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/rooms', roomsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Cine Retro API rodando normalmente.', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------
// Servir o frontend estatico (permite acessar tudo em http://localhost:3000)
// ---------------------------------------------------------------------
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------------------------------------------------------------------
// Tratamento de erros
// ---------------------------------------------------------------------
app.use('/api', notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------
// Inicializacao: migra/popula o banco remoto automaticamente e SO ENTAO
// sobe o servidor HTTP. Isso elimina a necessidade de rodar schema.sql
// manualmente - basta "npm install" + "npm start".
// ---------------------------------------------------------------------
async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('=================================================');
    console.error('   [Migrate] Nao foi possivel preparar o banco remoto automaticamente.');
    console.error('   Motivo:', err.message);
    console.error('   Verifique a variavel DATABASE_URL no arquivo .env (backend/.env).');
    console.error('   O servidor vai subir mesmo assim, mas rotas que dependem do');
    console.error('   banco de dados retornarao erro ate a conexao ser corrigida.');
    console.error('=================================================');
  }

  app.listen(PORT, () => {
    console.log('=================================================');
    console.log('   CINE RETRO - Servidor iniciado com sucesso');
    console.log('=================================================');
    console.log(`   Local:        http://localhost:${PORT}`);
    console.log(`   API Health:   http://localhost:${PORT}/api/health`);
    console.log('=================================================');
  });
}

start();
