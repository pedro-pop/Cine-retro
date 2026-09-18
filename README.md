# 🎬 Cine Retrô 2.0

Plataforma de streaming com tema vintage/clássico de cinema, desenvolvida com **Node.js + Express** no backend, **PostgreSQL remoto (cloud)** como banco de dados e **HTML/CSS/JavaScript puro** no frontend. Inclui autenticação com controle de acesso por papéis (RBAC), catálogo administrável, planos de assinatura e uma experiência interativa de **seleção de sala e poltrona** que ajusta a perspectiva 3D da tela de projeção.

> **Novidade da versão 2.0:** o projeto **não depende mais de MySQL/PostgreSQL instalado na máquina, nem de Docker**. O banco de dados roda em um provedor cloud gratuito (Supabase, Railway, Neon, etc.) e as tabelas + dados iniciais são criados **automaticamente** ao rodar `npm start`. Basta configurar uma variável de ambiente.

---

## 📁 Estrutura do projeto

```
cine-retro-2.0/
├── backend/
│   ├── server.js                 # Servidor Express principal (roda a migração automática ao subir)
│   ├── package.json              # Dependências (express, cors, dotenv, pg, bcryptjs, jsonwebtoken, multer)
│   ├── .env.example               # Modelo de variáveis de ambiente (banco remoto)
│   ├── api/
│   │   ├── auth.js               # Login, cadastro, dados do usuário logado
│   │   ├── users.js              # RBAC: gestão de usuários, métricas
│   │   ├── media.js              # Catálogo (filmes, séries, novelas)
│   │   ├── plans.js              # Planos e assinaturas
│   │   └── rooms.js              # Salas e seleção de poltronas
│   ├── middleware/
│   │   ├── auth.js                # JWT + controle de acesso por papel (RBAC)
│   │   └── errorHandler.js       # Tratamento central de erros
│   ├── database/
│   │   ├── db.js                  # Pool de conexão PostgreSQL remoto (pg)
│   │   └── migrate.js             # Cria as tabelas e popula dados iniciais automaticamente
│   └── uploads/                   # Criada automaticamente (posteres/vídeos enviados)
├── database/
│   └── schema-reference.sql       # Apenas para CONSULTA — não precisa ser executado manualmente
├── frontend/
│   ├── index.html                 # Página única (SPA) do Cine Retrô — sem alterações visuais
│   └── assets/
│       ├── css/style.css          # Design vintage (marrom, dourado, vermelho)
│       ├── js/app.js              # Toda a lógica do frontend (inalterada)
│       └── images/                # Placeholders SVG locais (posteres, favicon)
└── README.md
```

---

## ✅ Pré-requisitos

- **Node.js** 18 ou superior
- Uma conta gratuita em **um** provedor de PostgreSQL cloud (escolha um):
  - **[Supabase](https://supabase.com)** — recomendado, tem painel visual e SQL editor
  - **[Railway](https://railway.app)** — provisiona um Postgres em segundos
  - **[Neon](https://neon.tech)** — serverless Postgres, camada gratuita generosa
  - **[Render](https://render.com)** — também oferece Postgres gerenciado gratuito

**Não é necessário instalar MySQL, PostgreSQL local ou Docker em nenhuma máquina** — inclusive em computadores corporativos com restrição de instalação de software, já que tudo roda via `npm` e uma conexão de rede com o banco remoto.

---

## 🚀 Como executar localmente (apontando para o banco remoto)

### 1. Criar o banco de dados remoto (gratuito) — exemplo com Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New Project**, escolha um nome, senha do banco e região.
3. Aguarde o projeto ser provisionado (leva cerca de 1–2 minutos).
4. No painel, vá em **Project Settings → Database → Connection string** e copie a opção **URI** (modo "Session" ou "Transaction pooler" funcionam).
   - Ela terá o formato:
     `postgresql://postgres:[SUA-SENHA]@db.xxxxxxxxxxxx.supabase.co:5432/postgres`

> **Railway:** crie um projeto → "New" → "Database" → "PostgreSQL" → aba **Connect** → copie a `DATABASE_URL`.
> **Neon:** crie um projeto → a `Connection string` já aparece na tela inicial do dashboard.

Qualquer um desses provedores gera uma URI no mesmo formato `postgresql://usuario:senha@host:porta/banco`, compatível com este projeto sem nenhuma alteração de código.

### 2. Configurar as variáveis de ambiente

Dentro da pasta `backend/`, copie `.env.example` para `.env`:

```bash
cd backend
cp .env.example .env
```

Edite o `.env` e cole a connection string do provedor escolhido:

```
PORT=3000
DATABASE_URL=postgresql://postgres:sua_senha@db.xxxxxxxxxxxx.supabase.co:5432/postgres
DB_SSL=true
JWT_SECRET=troque_por_um_segredo_forte
JWT_EXPIRES_IN=8h
```

> `DB_SSL=true` é o padrão exigido por Supabase, Railway, Neon e Render. Só mude para `false` se o seu provedor remoto explicitamente não usar SSL.

### 3. Instalar dependências e iniciar — é só isso!

```bash
npm install
npm start
```

Não existe mais um passo separado de "rodar o schema.sql". Ao iniciar, o `server.js` chama automaticamente `database/migrate.js`, que:

1. Cria as tabelas `users`, `plans`, `subscriptions`, `media`, `view_logs`, `rooms` e `seat_selections` no banco remoto, caso ainda não existam (`CREATE TABLE IF NOT EXISTS` — seguro para rodar toda vez que o servidor sobe);
2. Insere os planos **Básico (R$ 40/mês)** e **Premium (R$ 60/mês)**, caso a tabela `plans` esteja vazia;
3. Cria a sala padrão **"Sala Retrô 1"**, caso não exista nenhuma sala;
4. Cria o usuário **Super Admin** de teste, caso ainda não exista;
5. Popula 7 filmes clássicos de exemplo (Casablanca, Psicose, Metropolis, etc.), caso o catálogo esteja vazio.

Você verá no terminal:

```
[Migrate] Verificando/criando tabelas no banco remoto...
[Migrate] Tabelas prontas.
[Migrate] Banco de dados pronto para uso.
=================================================
   CINE RETRO - Servidor iniciado com sucesso
=================================================
   Local:        http://localhost:3000
   API Health:   http://localhost:3000/api/health
=================================================
```

### 4. Acessar o site

Abra o navegador em **http://localhost:3000** — o Express serve o frontend (pasta `frontend/`) e a API (`/api/...`) juntos, na mesma porta.

> Se quiser apenas reaplicar a migração/seed manualmente (sem subir o servidor), rode `npm run migrate` a qualquer momento — é idempotente, ou seja, pode ser executado quantas vezes quiser sem duplicar dados.

---

## 🔑 Login de teste (Super Admin)

| Papel        | E-mail                        | Senha            |
|--------------|--------------------------------|-------------------|
| Super Admin  | `superadmin@cineretro.com`    | `SuperAdmin123`   |

A partir dessa conta você pode criar novos **Admins**, **Super Admins** e **Usuários Comuns** pelo próprio painel administrativo do site (ícone do usuário no cabeçalho → Painel Administrativo → aba "Usuários").

---

## 👤 Papéis de usuário (RBAC) — sem alterações em relação à v1

| Papel          | Permissões |
|----------------|------------|
| **Usuário Comum** | Assina planos, navega no catálogo, assiste a filmes/séries/novelas, escolhe sala e poltrona. |
| **Admin**         | Tudo do Usuário Comum, mais: adiciona/edita/remove mídias (filme, série, novela) com faixa etária, diretor, elenco, classificação, país, produtora, duração, define destaques e Top 10, cadastra por upload de arquivo **ou** link externo, acompanha métricas de visualização. |
| **Super Admin**   | Tudo do Admin, mais: cria outros Admins, Super Admins e Usuários Comuns, redefine senhas de qualquer conta, altera papéis, ativa/desativa contas, acompanha métricas de assinantes por plano. |

O controle é feito via **JWT** (token assinado no login/cadastro) combinado com o middleware `requireRole(...)` em `backend/middleware/auth.js`, aplicado rota a rota — exatamente como antes, apenas com o banco de dados por trás trocado.

---

## 🎟️ Experiência de Sala e Poltrona (inalterada)

Ao clicar em **"Assistir"** em qualquer card ou no banner principal:

1. O frontend busca a sala disponível (`GET /api/rooms`) e o mapa de poltronas já ocupadas para aquele título (`GET /api/rooms/:id/seats`).
2. O usuário escolhe uma poltrona no mapa de assentos renderizado dinamicamente.
3. A posição escolhida (fileira × coluna) é usada para calcular, em tempo real, uma transformação **CSS 3D** (`rotateX`, `rotateY`, `translateZ`, `scale`) aplicada à tela de projeção (`#cinemaScreen`), simulando o ângulo de visão de quem senta naquele lugar específico da sala.
4. Ao confirmar, a poltrona é registrada (`POST /api/rooms/:id/select-seat`), a visualização é contabilizada (`POST /api/media/:id/view`) e o vídeo começa a ser exibido dentro da "tela" com a perspectiva já ajustada.

---

## 📡 Documentação da API

Base URL local: `http://localhost:3000/api` — **todas as rotas e contratos JSON permanecem idênticos à versão 1**, apenas o banco de dados por trás mudou.

### Autenticação — `/api/auth`

| Método | Rota              | Descrição                                   | Autenticação |
|--------|-------------------|------------------------------------------------|--------------|
| POST   | `/auth/register`  | Cadastro de novo usuário comum                 | Não          |
| POST   | `/auth/login`     | Login (retorna token JWT + dados do usuário)   | Não          |
| GET    | `/auth/me`        | Retorna os dados do usuário autenticado        | Sim          |

### Usuários — `/api/users`

| Método | Rota                        | Descrição                                       | Autenticação           |
|--------|-----------------------------|---------------------------------------------------|--------------------------|
| GET    | `/users`                    | Lista todos os usuários                           | Admin / Super Admin      |
| GET    | `/users/metrics`            | Métricas de assinantes e mídias mais vistas       | Admin / Super Admin      |
| PUT    | `/users/me`                 | Atualiza o próprio perfil                          | Qualquer usuário logado  |
| POST   | `/users`                    | Cria usuário comum, admin ou super admin           | Super Admin              |
| PUT    | `/users/:id/reset-password` | Redefine a senha de qualquer usuário               | Super Admin              |
| PUT    | `/users/:id/role`           | Altera o papel (role) de um usuário                | Super Admin              |
| PUT    | `/users/:id/status`         | Ativa ou desativa uma conta                        | Super Admin              |
| DELETE | `/users/:id`                | Remove um usuário                                  | Super Admin              |

### Mídias / Catálogo — `/api/media`

| Método | Rota                | Descrição                                                                 | Autenticação          |
|--------|---------------------|-----------------------------------------------------------------------------|-------------------------|
| GET    | `/media`             | Lista o catálogo. Filtros via query string: `?genre=`, `?search=`, `?type=`, `?featured=true`, `?top10=true` | Não |
| GET    | `/media/genres`      | Lista os gêneros distintos cadastrados                                     | Não                     |
| GET    | `/media/:id`         | Detalhes de uma mídia específica                                            | Não                     |
| POST   | `/media/:id/view`    | Registra uma visualização (métrica)                                        | Não (opcional)          |
| POST   | `/media`             | Cadastra mídia nova — aceita `multipart/form-data` com upload de `poster`/`video`, ou campos `video_url` para link externo | Admin / Super Admin |
| PUT    | `/media/:id`         | Edita uma mídia existente                                                   | Admin / Super Admin     |
| DELETE | `/media/:id`         | Remove uma mídia do catálogo                                                | Admin / Super Admin     |

Campos suportados em `POST`/`PUT` de mídia: `title`, `synopsis`, `type` (`filme`/`serie`/`novela`), `genre`, `classification`, `min_age`, `director`, `cast_list`, `country`, `producer`, `release_year`, `duration_minutes`, `video_source_type` (`link`/`upload`), `video_url`, `is_featured`, `is_top10`, `top10_rank`.

### Planos — `/api/plans`

| Método | Rota                      | Descrição                                    | Autenticação |
|--------|---------------------------|---------------------------------------------------|--------------|
| GET    | `/plans`                  | Lista os planos disponíveis (Básico/Premium)       | Não          |
| POST   | `/plans/:id/subscribe`    | Assina um plano                                    | Sim          |
| GET    | `/plans/my-subscription`  | Retorna a assinatura ativa do usuário logado       | Sim          |

### Salas e Poltronas — `/api/rooms`

| Método | Rota                       | Descrição                                             | Autenticação        |
|--------|----------------------------|-----------------------------------------------------------|------------------------|
| GET    | `/rooms`                   | Lista as salas de cinema disponíveis                      | Não                    |
| GET    | `/rooms/:id/seats`         | Mapa de poltronas e quais já estão ocupadas para uma mídia (`?media_id=`) | Não |
| POST   | `/rooms/:id/select-seat`   | Registra a escolha de poltrona                             | Não (opcional)         |
| POST   | `/rooms`                   | Cria uma nova sala temática                                | Admin / Super Admin    |

### Utilitária

| Método | Rota           | Descrição                         |
|--------|----------------|--------------------------------------|
| GET    | `/api/health`  | Verifica se a API está no ar          |

---

## 🎨 Identidade visual (sem alterações)

- **Fundo:** marrom-escuro (`#120c08` / `#1a100a`)
- **Bordas e detalhes:** dourado envelhecido (`#cfa856` / `#d4af37`)
- **Destaques e botões:** vermelho-escuro clássico (`#8b0000` / `#a91d22`)
- **Tipografia:** `Cinzel` (títulos, estilo marquise de cinema) + `Cormorant Garamond` (texto corrido, elegante e clássico)

O frontend (`index.html`, `style.css`, `app.js`) **não sofreu nenhuma alteração de código ou de visual** nesta refatoração — apenas o backend e o banco de dados foram trocados. Como os contratos JSON da API continuam exatamente os mesmos, o frontend funciona sem ajustes.

---

## 🔄 O que mudou da v1 para a v2.0 (resumo técnico)

| Item                     | v1 (local)                         | v2.0 (remoto)                                  |
|---------------------------|-------------------------------------|--------------------------------------------------|
| Banco de dados             | MySQL instalado na máquina         | PostgreSQL remoto (Supabase/Railway/Neon/Render) |
| Driver Node.js              | `mysql2`                            | `pg`                                              |
| Setup do schema             | `mysql -u root -p < schema.sql` (manual) | Automático, ao rodar `npm start`             |
| Variáveis de ambiente       | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `DATABASE_URL`, `DB_SSL`                |
| Placeholders SQL            | `?`                                  | `$1, $2, $3...`                                   |
| IDs de inserção              | `result.insertId`                   | `RETURNING id` + `result.rows[0].id`             |
| Linhas afetadas              | `result.affectedRows`               | `result.rowCount`                                 |
| Busca textual                | `LIKE` (case-insensitive por padrão no MySQL) | `ILIKE` (explicitamente case-insensitive) |
| Booleanos                    | `TINYINT(1)` (0/1)                  | `BOOLEAN` (`true`/`false`)                        |
| Necessário instalar localmente | MySQL Server                     | Nada — só uma conta gratuita no provedor cloud    |
| Necessário Docker             | Não                                  | Não                                               |

---

## 🛠️ Solução de problemas comuns

- **`getaddrinfo ENOTFOUND` ou erro de conexão ao iniciar:** confira se `DATABASE_URL` no `.env` foi colada corretamente (sem espaços extras) e se o projeto no Supabase/Railway/Neon está ativo (alguns provedores gratuitos "hibernam" bancos ociosos — acesse o painel deles para reativar).
- **`self-signed certificate` ou erro de SSL:** mantenha `DB_SSL=true`, que já configura `rejectUnauthorized: false`, compatível com o certificado desses provedores.
- **Porta 3000 já em uso:** altere `PORT` no arquivo `.env`.
- **Quero recriar os dados de exemplo do zero:** apague as linhas das tabelas manualmente no painel do provedor (ex: SQL Editor do Supabase) e rode `npm run migrate` novamente — as rotinas de seed detectam tabelas vazias e as populam de novo.
- **Upload de vídeo/poster não aparece:** os arquivos enviados ficam em `backend/uploads/` (armazenamento local do servidor), servidos publicamente em `http://localhost:3000/uploads/arquivo.ext`. Isso não muda com o banco remoto — apenas os dados estruturados (catálogo, usuários, planos) ficam no Postgres na nuvem.
- **Rodando em rede corporativa:** se a rede bloquear a porta 5432 (padrão do Postgres) para saída, peça à sua equipe de TI para liberar tráfego de saída para o host do seu provedor cloud, ou use o "connection pooler" (porta 6543) que o Supabase disponibiliza como alternativa.

---

Feito com carinho para os amantes do cinema clássico. 🎞️
