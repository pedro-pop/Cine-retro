-- =====================================================================
-- CINE RETRO - Schema de referencia (PostgreSQL)
-- =====================================================================
-- IMPORTANTE: este arquivo e apenas para CONSULTA/DOCUMENTACAO.
-- Você NAO precisa rodar este script manualmente. A partir da versao 2.0,
-- o backend cria e popula essas mesmas tabelas automaticamente ao rodar
-- "npm start" (veja backend/database/migrate.js), conectando-se ao seu
-- banco PostgreSQL remoto (Supabase, Railway, Neon, etc.) atraves da
-- variavel DATABASE_URL do arquivo .env.
--
-- Este arquivo existe apenas para quem quiser aplicar o schema manualmente
-- (ex: direto no SQL Editor do Supabase) ou entender a modelagem sem ler
-- o codigo Javascript.
-- =====================================================================

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

-- Dados iniciais (o backend faz isso automaticamente via migrate.js,
-- este bloco e apenas para quem quiser rodar manualmente):
-- INSERT INTO plans (...) VALUES (...);
-- INSERT INTO rooms (...) VALUES (...);
-- INSERT INTO users (...) VALUES (...);  -- super admin
-- INSERT INTO media (...) VALUES (...);  -- catalogo de exemplo
