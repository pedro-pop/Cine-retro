# Progresso do redesign do frontend Cine Retrô

## Estado real do trabalho

### Concluído e preservado
- Reestruturação visual incremental da SPA sem trocar a arquitetura existente.
- Sistema de temas com persistência local em `localStorage` e inicialização aplicada ao carregar a página.
- Atualização do cabeçalho com switch de temas com ícones dedicados para retrô, claro e escuro.
- Hero dinâmico com destaque cinematográfico e CTAs de assistir, trailer e detalhes.
- Catálogo em rails horizontais por categoria, com cards mais informativos e ações rápidas.
- Modal de detalhes com suporte a trailer quando a mídia possui `video_url` ou `video_path`.
- Modal de sala com seleção de poltrona, confirmação de sessão, troca de assento e controles sobrepostos do player.
- Persistência local da última poltrona por mídia para melhor continuidade de fluxo.
- Perfis de usuário com identificação do papel e leitura da assinatura ativa.
- Painel administrativo para catalogação, métricas e gestão de usuários usando as rotas existentes.
- Suporte visual a três temas: retrô, claro e escuro, com contraste melhorado em cards, botões e modais.

### Correções implementadas nesta etapa
- Removeu a duplicação do botão de assistir na área do cartão, preservando um único CTA de reprodução por item.
- Ajustou o hover dos cartões para expandir somente o card diretamente apontado, sem afetar os irmãos nem a linha inteira do catálogo.
- Corrigiu a estrutura do catálogo para uma composição horizontal por seção, sem cair em grid vertical de uma coluna.
- Reforçou o fluxo de sessão de cinema para separar seleção de assento da reprodução em tela, com controles flutuantes e saída da sessão.
- Ajustou a distinção visual entre salas retrô e moderna, mantendo o mesmo contrato de dados e disponibilidade.
- Mantém a lógica segura de `localStorage` e os contratos de API sem inventar endpoints ou campos novos.

### O que continua como dependência do backend
Os itens abaixo dependem de contratos e dados reais do backend e não devem ser tratados como implementados de forma server-authoritative:
- Validação final de disponibilidade de assentos por usuário/room/media no backend.
- Persistência real de reservas e histórico de assentos em banco.
- Troca de senha e recuperação de senha específicas ao backend.
- Upload de trailers/arquivos de vídeo em produção para uso de mídia em `upload`.
- Autorização/controle de acesso para usuários admin/superadmin em operações sensíveis.
- Dados reais de assinatura e planos em rotas de produção.
- Verificação real de assentos ocupados em ambiente com banco ativo e tenant configurado.

## Dependências de API do frontend
Estas rotas são as que o frontend já usa/depende conforme a API atual existente:
- `GET /api/media`
- `GET /api/rooms`
- `GET /api/rooms/:id/seats?media_id=:id`
- `POST /api/rooms/:id/select-seat`
- `POST /api/media/:id/view`
- `GET /api/plans`
- `POST /api/plans/:id/subscribe`
- `GET /api/plans/my-subscription`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `PUT /api/users/me`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id/role`
- `PUT /api/users/:id/status`
- `PUT /api/users/:id/reset-password`
- `DELETE /api/users/:id`
- `GET /api/users/metrics`

## Validação executada
- `node --check frontend/assets/js/app.js` — passou sem erro de sintaxe.
- Servidor local do backend iniciado em `http://localhost:3000` para verificar a renderização do frontend.
- Validação manual no navegador dos fluxos de catálogo e sala: abertura do modal de seleção, criação de poltrona ativa, atualização do rótulo de assento e manutenção do modal aberto.
- Verificação de comportamento real da API: as requisições de `/api/rooms` e `/api/rooms/:id/seats` falham no ambiente local com `500` por ausência do tenant PostgreSQL configurado (`(ENOTFOUND) tenant/user postgres... not found`), então a validação end-to-end real de reservas ainda está bloqueada pelo backend.

## Observação importante
O frontend foi atualizado para seguir os contratos existentes sem inventar campos ou endpoints novos. A validação visual e funcional do fluxo principal foi realizada até onde a infraestrutura local permitiu, mas a confirmação real da disponibilidade/seleção de assentos e do progresso de reserva continua dependente de um backend com banco configurado e acessível.

## Próximo bloco de trabalho recomendado
- Validar o comportamento real em ambiente com banco funcional e API ativa.
- Confirmar, em produção, se a troca de senha, uploads de trailer e reservas persistentes devem entrar em uma fase de backend autorizada.
- Continuar refinamentos visuais finos do trio de temas e dos layouts de sala somente com backend real disponível para checagem.

---

## Etapa: integração do frontend com a API Python

### Implementado nesta etapa
- Foi adicionado um serviço FastAPI modular em `backend_python/`, sem remover nem modificar o servidor Express legado.
- A API oferece configuração via ambiente, CORS com origens explícitas, JWT, hash de senha bcrypt, validação Pydantic, tratamento central de erros e conexão PostgreSQL sem criação automática de tabelas ou seed.
- Foram implementadas rotas para saúde, autenticação/perfil, gestão administrativa de usuários, catálogo e uploads, visualizações, planos/assinaturas e salas/assentos.
- A API compartilhada do navegador está em `frontend/assets/js/api.js`; `app.js` não mantém mais um caminho de `fetch` próprio para uploads.
- Os valores e as ações de planos agora dependem da resposta de `GET /api/plans`. A página não mostra os planos fictícios anteriores se a API não estiver disponível.
- O fallback local de filmes foi removido. Sem resposta do catálogo, a home apresenta estado de indisponibilidade e não anuncia `Casablanca` como dado recebido do servidor.
- O perfil deixa o e-mail somente leitura, pois a API preexistente só permite atualizar nome/avatar. O painel envia o status booleano `active`, conforme o contrato.
- A confirmação de poltrona só inicia a sessão depois da confirmação da API. Falhas não marcam a poltrona como ocupada localmente nem exibem sucesso. A troca autenticada usa `PUT /api/rooms/{room_id}/select-seat` para alterar a reserva existente; a poltrona antiga não é liberada apenas no navegador.
- A seleção de assento exibe `mySeat` quando há JWT; o player esconde a área de seleção durante a reprodução e preserva a proporção de vídeo com `object-fit: contain`. O botão de troca volta à seleção e respeita o registro confirmado.
- Documentação atualizada: `docs/API_CONTRACT.md` contém o inventário completo de método/caminho, requisitos, exemplos, erros, entidades e atomicidade; `docs/SUPABASE_SCHEMA_PLAN.md` descreve entidades, RLS, índices e decisões pendentes. Nenhuma tabela foi criada no Supabase.
- O `README.md` agora instrui a execução Python e identifica o fluxo Node como legado. `.gitignore` exclui envs, cache Python e uploads novos.

### Endpoints implementados
A lista normativa e exemplos de payloads/respostas estão em [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). Todos os endpoints listados estão registrados na aplicação FastAPI. Ela inclui:
- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/users`, `GET /api/users/metrics`, `PUT /api/users/me`, `POST /api/users`, `PUT /api/users/{user_id}/reset-password`, `PUT /api/users/{user_id}/role`, `PUT /api/users/{user_id}/status`, `DELETE /api/users/{user_id}`
- `GET /api/media`, `GET /api/media/genres`, `GET /api/media/{media_id}`, `POST /api/media/{media_id}/view`, `POST /api/media`, `PUT /api/media/{media_id}`, `DELETE /api/media/{media_id}`
- `GET /api/plans`, `POST /api/plans/{plan_id}/subscribe`, `GET /api/plans/my-subscription`
- `GET /api/rooms`, `GET /api/rooms/{room_id}/seats`, `POST /api/rooms/{room_id}/select-seat`, `PUT /api/rooms/{room_id}/select-seat`, `POST /api/rooms`

### Verificações executadas
- `python -m pytest -q` no diretório `backend_python/`: **12 testes passaram**. Cobertura inclui validação/envelope de erro, rota administrativa sem token (401), papel comum em rota administrativa (403), hashing/JWT, lista de rotas vs contrato, conflito de reserva e atualização atômica de poltrona com double de teste.
- `node --check frontend/assets/js/api.js` e `node --check frontend/assets/js/app.js`: passaram.
- Análise de problemas do editor em `app.js` e `api.js`: sem erros.
- Smoke test HTTP no FastAPI: `/` e `/assets/css/style.css` responderam `200`; `/api/health` respondeu `200` com `{"status":"degraded","database":"not_configured"}`; `/api/media` retornou `503` com erro JSON explícito.
- Verificação no navegador confirmou que a SPA é servida pelo Python e mostra catálogo/planos indisponíveis sem inventar títulos ou preços quando o PostgreSQL não está configurado. Isso não valida o funcionamento visual completo do player nem operações com dados reais.

### Dependências e pendências reais
- Nenhuma variável `DATABASE_URL` válida nem PostgreSQL/Supabase foi configurada neste ambiente. Portanto, cadastro/login persistentes, CRUD administrativo, assinaturas, disponibilidade e reservas contra um banco real **não foram executados**.
- O teste de duplicidade/troca de assento usa um double, não duas conexões concorrentes de PostgreSQL. O schema de referência não tem índices únicos para poltrona nem para assinatura ativa. Aplicar/revisar as constraints propostas em [`docs/SUPABASE_SCHEMA_PLAN.md`](docs/SUPABASE_SCHEMA_PLAN.md) é requisito antes de alegar proteção de produção, especialmente enquanto o Express legado existir como outro escritor possível.
- A disponibilidade ainda é por `(room_id, media_id)` porque o projeto não tem entidade de sessão/horário de exibição. Reservas para sessões diferentes do mesmo título exigem decisão e possível evolução de schema/rotas.
- Uploads são armazenados localmente no serviço Python; armazenamento e políticas para produção (por exemplo, Supabase Storage) permanecem pendentes. Assinatura de plano não cobra pagamento.
- `npm start` no Express antigo executa migração e seeds de demonstração; não o use para inicializar esta etapa Python/Supabase.
- Um aviso não bloqueante do Starlette aparece nos testes sobre a integração futura do TestClient com o pacote `httpx2`.

### Arquivos criados/modificados nesta etapa
- Criados: `backend_python/` (configuração, routers, schemas, segurança, serviço de assentos e testes), `frontend/assets/js/api.js`, `docs/API_CONTRACT.md`, `docs/SUPABASE_SCHEMA_PLAN.md`.
- Modificados: `frontend/assets/js/app.js`, `frontend/assets/css/style.css`, `frontend/index.html`, `README.md`, `.gitignore`.
- As alterações anteriores dos temas retrô/claro/escuro foram preservadas; não foram redesenhadas nesta etapa.
