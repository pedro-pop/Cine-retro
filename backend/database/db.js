// =====================================================================
// Conexao com banco de dados PostgreSQL REMOTO (Supabase, Railway, Neon,
// Render, etc.) usando o driver "pg" (node-postgres).
// Nao depende de nenhuma instalacao local de banco de dados.
// =====================================================================
const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.warn('[Postgres] Atencao: a variavel DATABASE_URL nao foi definida no .env.');
  console.warn('[Postgres] Configure-a com a connection string do seu banco remoto (Supabase/Railway/Neon).');
}

// A maioria dos provedores cloud (Supabase, Railway, Neon, Render) exige
// SSL para conexoes externas. DB_SSL=true (padrao) habilita isso.
const useSSL = (process.env.DB_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('[Postgres] Erro inesperado em uma conexao ociosa do pool:', err.message);
});

// Testa a conexao assim que o modulo e carregado (nao derruba o servidor se falhar)
async function testConnection() {
  try {
    const client = await pool.connect();
    const dbInfo = await client.query('SELECT current_database() AS db');
    console.log('[Postgres] Conectado com sucesso ao banco remoto "%s".', dbInfo.rows[0].db);
    client.release();
  } catch (err) {
    console.error('[Postgres] Falha ao conectar ao banco de dados remoto:', err.message);
    console.error('[Postgres] Verifique se DATABASE_URL no .env esta correta e se o banco (Supabase/Railway/Neon) esta ativo.');
  }
}

testConnection();

module.exports = pool;
