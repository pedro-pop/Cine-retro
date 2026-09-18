// =====================================================================
// CINE RETRO - Migração e seed automáticos (PostgreSQL remoto)
// =====================================================================
// Substitui a necessidade de rodar um schema.sql manualmente. Este
// módulo cria as tabelas (CREATE TABLE IF NOT EXISTS) e popula dados
// iniciais (planos, sala padrão, super admin e catálogo de exemplo)
// automaticamente sempre que o servidor sobe.
//
// Pode também ser executado isoladamente com:  npm run migrate
// =====================================================================
const bcrypt = require('bcryptjs');
const pool = require('./db');

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'comum' CHECK (role IN ('comum', 'admin', 'superadmin')),
  avatar_url      VARCHAR(255),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(80) NOT NULL,
  slug                VARCHAR(80) NOT NULL UNIQUE,
  price               NUMERIC(10,2) NOT NULL,
  max_simultaneous    INTEGER NOT NULL DEFAULT 1,
  quality             VARCHAR(50) NOT NULL,
  allows_offline      BOOLEAN NOT NULL DEFAULT FALSE,
  early_access        BOOLEAN NOT NULL DEFAULT FALSE,
  ad_free             BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular          BOOLEAN NOT NULL DEFAULT FALSE,
  features            JSONB,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status        VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada', 'expirada')),
  started_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
  id                  SERIAL PRIMARY KEY,
  title               VARCHAR(200) NOT NULL,
  synopsis            TEXT,
  type                VARCHAR(20) NOT NULL DEFAULT 'filme' CHECK (type IN ('filme', 'serie', 'novela')),
  genre               VARCHAR(60) NOT NULL,
  classification      VARCHAR(10) NOT NULL DEFAULT 'Livre',
  min_age             INTEGER NOT NULL DEFAULT 0,
  director            VARCHAR(150),
  cast_list           TEXT,
  country             VARCHAR(80),
  producer            VARCHAR(150),
  release_year        INTEGER,
  duration_minutes    INTEGER,
  poster_path         VARCHAR(255),
  video_source_type   VARCHAR(10) NOT NULL DEFAULT 'link' CHECK (video_source_type IN ('upload', 'link')),
  video_path          VARCHAR(255),
  video_url           VARCHAR(500),
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  is_top10            BOOLEAN NOT NULL DEFAULT FALSE,
  top10_rank          INTEGER,
  view_count          INTEGER NOT NULL DEFAULT 0,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_genre ON media (genre);
CREATE INDEX IF NOT EXISTS idx_media_featured ON media (is_featured);
CREATE INDEX IF NOT EXISTS idx_media_top10 ON media (is_top10);

CREATE TABLE IF NOT EXISTS view_logs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  media_id      INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  viewed_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  theme           VARCHAR(20) NOT NULL DEFAULT 'retro' CHECK (theme IN ('retro', 'moderna')),
  total_rows      INTEGER NOT NULL DEFAULT 6,
  seats_per_row   INTEGER NOT NULL DEFAULT 8,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seat_selections (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  room_id       INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  media_id      INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  seat_row      VARCHAR(5) NOT NULL,
  seat_number   INTEGER NOT NULL,
  selected_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const SAMPLE_MOVIES = [
  {
    title: 'Casablanca', genre: 'Drama', classification: '12', min_age: 12,
    director: 'Michael Curtiz', cast_list: 'Humphrey Bogart, Ingrid Bergman',
    country: 'Estados Unidos', producer: 'Warner Bros.', release_year: 1942, duration_minutes: 102,
    poster_path: 'assets/images/poster-casablanca.svg', video_url: 'https://example.com/videos/casablanca.mp4',
    is_featured: true, is_top10: true, top10_rank: 1, view_count: 15420,
    synopsis: 'Em meio a Segunda Guerra Mundial, um dono de bar em Casablanca deve escolher entre seu grande amor e ajudar um heroi da resistencia a escapar.'
  },
  {
    title: 'A Regra do Jogo', genre: 'Comedia', classification: '14', min_age: 14,
    director: 'Jean Renoir', cast_list: 'Nora Gregor, Paulette Dubost',
    country: 'Franca', producer: 'Nouvelle Edition Francaise', release_year: 1939, duration_minutes: 110,
    poster_path: 'assets/images/poster-generic-1.svg', video_url: 'https://example.com/videos/regra-do-jogo.mp4',
    is_featured: true, is_top10: true, top10_rank: 2, view_count: 8790,
    synopsis: 'Um retrato satirico da aristocracia francesa reunida em um chateu de campo, revelando amores e mentiras.'
  },
  {
    title: 'Psicose', genre: 'Suspense', classification: '16', min_age: 16,
    director: 'Alfred Hitchcock', cast_list: 'Anthony Perkins, Janet Leigh',
    country: 'Estados Unidos', producer: 'Shamley Productions', release_year: 1960, duration_minutes: 109,
    poster_path: 'assets/images/poster-generic-2.svg', video_url: 'https://example.com/videos/psicose.mp4',
    is_featured: true, is_top10: true, top10_rank: 3, view_count: 12300,
    synopsis: 'Uma secretaria foge com dinheiro roubado e para em um motel isolado administrado por um jovem perturbado.'
  },
  {
    title: 'Cantando na Chuva', genre: 'Musical', classification: 'Livre', min_age: 0,
    director: 'Gene Kelly, Stanley Donen', cast_list: 'Gene Kelly, Debbie Reynolds',
    country: 'Estados Unidos', producer: 'Metro-Goldwyn-Mayer', release_year: 1952, duration_minutes: 103,
    poster_path: 'assets/images/poster-generic-3.svg', video_url: 'https://example.com/videos/cantando-na-chuva.mp4',
    is_featured: false, is_top10: false, top10_rank: null, view_count: 6100,
    synopsis: 'Um astro do cinema mudo enfrenta a chegada do som no cinema enquanto vive um romance com uma jovem atriz.'
  },
  {
    title: 'A Bela e a Fera', genre: 'Romance', classification: 'Livre', min_age: 0,
    director: 'Jean Cocteau', cast_list: 'Jean Marais, Josette Day',
    country: 'Franca', producer: 'DisCina', release_year: 1946, duration_minutes: 96,
    poster_path: 'assets/images/poster-generic-4.svg', video_url: 'https://example.com/videos/bela-e-a-fera.mp4',
    is_featured: false, is_top10: false, top10_rank: null, view_count: 4300,
    synopsis: 'Uma adaptacao poetica do conto classico, onde amor e transformacao caminham lado a lado.'
  },
  {
    title: 'Metropolis', genre: 'Ficcao Cientifica', classification: '12', min_age: 12,
    director: 'Fritz Lang', cast_list: 'Brigitte Helm, Gustav Frohlich',
    country: 'Alemanha', producer: 'UFA', release_year: 1927, duration_minutes: 153,
    poster_path: 'assets/images/poster-generic-5.svg', video_url: 'https://example.com/videos/metropolis.mp4',
    is_featured: false, is_top10: false, top10_rank: null, view_count: 9800,
    synopsis: 'Em uma cidade futurista dividida entre elite e trabalhadores, um jovem se apaixona por uma lider revolucionaria.'
  },
  {
    title: 'Nosferatu', genre: 'Terror', classification: '16', min_age: 16,
    director: 'F. W. Murnau', cast_list: 'Max Schreck',
    country: 'Alemanha', producer: 'Prana Film', release_year: 1922, duration_minutes: 94,
    poster_path: 'assets/images/poster-generic-6.svg', video_url: 'https://example.com/videos/nosferatu.mp4',
    is_featured: false, is_top10: false, top10_rank: null, view_count: 7200,
    synopsis: 'Um agente imobiliario viaja ate a Transilvania e desperta o interesse de um misterioso e sinistro conde.'
  }
];

async function seedPlans() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM plans');
  if (rows[0].total > 0) return;

  console.log('[Migrate] Inserindo planos padrao (Basico / Premium)...');
  await pool.query(
    `INSERT INTO plans (name, slug, price, max_simultaneous, quality, allows_offline, early_access, ad_free, is_popular, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    ['Basico', 'basico', 40.00, 3, 'HD', false, false, true, false,
      JSON.stringify(['Catalogo completo ilimitado', 'Qualidade HD', 'Ate 3 contas simultaneas', 'Acesso em qualquer dispositivo'])]
  );
  await pool.query(
    `INSERT INTO plans (name, slug, price, max_simultaneous, quality, allows_offline, early_access, ad_free, is_popular, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    ['Premium', 'premium', 60.00, 5, 'Full HD + 4K', true, true, true, true,
      JSON.stringify(['Tudo do plano Basico', 'Qualidade Full HD + 4K', 'Ate 5 contas simultaneas', 'Download para assistir offline', 'Acesso antecipado a novidades', 'Sem anuncios'])]
  );
}

async function seedRoom() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM rooms');
  if (rows[0].total > 0) return;

  console.log('[Migrate] Criando sala padrao "Sala Retro 1"...');
  await pool.query(
    `INSERT INTO rooms (name, theme, total_rows, seats_per_row) VALUES ($1,$2,$3,$4)`,
    ['Sala Retro 1', 'retro', 6, 8]
  );
}

async function seedSuperAdmin() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE email = 'superadmin@cineretro.com'");
  if (rows[0].total > 0) return;

  console.log('[Migrate] Criando usuario Super Admin padrao (superadmin@cineretro.com)...');
  const passwordHash = await bcrypt.hash('SuperAdmin123', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`,
    ['Super Admin', 'superadmin@cineretro.com', passwordHash, 'superadmin']
  );
}

async function seedMedia() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM media');
  if (rows[0].total > 0) return;

  console.log('[Migrate] Inserindo catalogo de filmes classicos de exemplo...');
  for (const m of SAMPLE_MOVIES) {
    await pool.query(
      `INSERT INTO media
        (title, synopsis, type, genre, classification, min_age, director, cast_list, country, producer,
         release_year, duration_minutes, poster_path, video_source_type, video_url,
         is_featured, is_top10, top10_rank, view_count)
       VALUES ($1,$2,'filme',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'link',$13,$14,$15,$16,$17)`,
      [
        m.title, m.synopsis, m.genre, m.classification, m.min_age, m.director, m.cast_list,
        m.country, m.producer, m.release_year, m.duration_minutes, m.poster_path, m.video_url,
        m.is_featured, m.is_top10, m.top10_rank, m.view_count
      ]
    );
  }
}

// Ponto de entrada: cria as tabelas (se nao existirem) e popula dados iniciais.
async function runMigrations() {
  console.log('[Migrate] Verificando/criando tabelas no banco remoto...');
  await pool.query(CREATE_TABLES_SQL);
  console.log('[Migrate] Tabelas prontas.');

  await seedPlans();
  await seedRoom();
  await seedSuperAdmin();
  await seedMedia();

  console.log('[Migrate] Banco de dados pronto para uso.');
}

// Permite rodar `npm run migrate` isoladamente, alem de ser chamado pelo server.js
if (require.main === module) {
  runMigrations()
    .then(() => { console.log('[Migrate] Concluido com sucesso.'); process.exit(0); })
    .catch((err) => { console.error('[Migrate] Falhou:', err.message); process.exit(1); });
}

module.exports = { runMigrations };
