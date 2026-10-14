# Cine Retrô API contract

**Base URL (local):** `http://127.0.0.1:8000`  
**Prefix:** `/api`  
**Status:** the routes below are implemented by `backend_python/app`; every data route requires a configured PostgreSQL database. No Supabase tables are created by application startup. A successful health response with `"degraded"` does not mean data operations are available.

## Conventions

- JSON errors use `{"error":"human-readable message"}`; validation errors additionally include `detail` with field-level errors.
- Authentication is a JWT in `Authorization: Bearer <token>`, signed with `JWT_SECRET` of at least 32 bytes. Public reads do not require a token. Role requirements are stated per route.
- IDs are positive integers. Times are UTC database timestamps. Passwords are never returned.
- A missing/unavailable database returns `503`; malformed input `422`; missing resources `404`; duplicate e-mail/seat conflicts `409`; unauthenticated requests `401`; insufficient role `403`.
- The schema currently has no showtime entity. Seat availability is therefore keyed by `(room_id, media_id)`, not by a scheduled screening.
- Supabase RLS and database constraints are planned in [SUPABASE_SCHEMA_PLAN.md](./SUPABASE_SCHEMA_PLAN.md), not applied here.

## Health

### `GET /api/health`
Checks API process and database connectivity. No auth, parameters, or body. Entity: infrastructure only. Read-only; no transaction.

```http
GET /api/health
```
```json
{"status":"degraded","database":"not_configured"}
```
Returns `200` with `status: "ok"` and `database: "connected"` when PostgreSQL responds, or `"degraded"` with `"unavailable"`/`"not_configured"` when it does not.

## Authentication and profile

### `POST /api/auth/register`
Public user registration; new accounts always have role `comum`. No query/path parameters.

```json
{"name":"Ana Silva","email":"ana@example.com","password":"senha123"}
```
`201`: `{"message":"Cadastro realizado com sucesso!","token":"<JWT>","user":{"id":12,"name":"Ana Silva","email":"ana@example.com","role":"comum","avatar_url":null}}`

Entities: `users`. Atomic insert; unique e-mail constraint required. Errors: `409` existing e-mail, `422` invalid fields, `503` database/JWT configuration.

### `POST /api/auth/login`
Public sign-in. No query/path parameters.

```json
{"email":"ana@example.com","password":"senha123"}
```
`200`: same token/user shape as registration. Entities: `users`. Read-only. Errors: `401` invalid credentials, `403` disabled account, `422` invalid fields, `503` unavailable service.

### `GET /api/auth/me`
Returns current account. Requires any active authenticated user. No body/parameters.

```http
GET /api/auth/me
Authorization: Bearer <token>
```
`200`: `{"user":{"id":12,"name":"Ana Silva","email":"ana@example.com","role":"comum","avatar_url":null}}`. Entity: `users`. Read-only. Errors: `401`, `403`, `404`, `503`.

### `PUT /api/users/me`
Updates only the authenticated user's name and/or avatar URL. E-mail changes are not supported by the existing model.

```json
{"name":"Ana S.","avatar_url":null}
```
`200`: `{"message":"Perfil atualizado com sucesso."}`. Entity: `users`. One-row update. Errors: `401`, `422` (including empty update), `503`.

## Catalog and viewing history

### `GET /api/media`
Lists catalog media. Public. Optional query parameters: `search` (title/synopsis substring), `genre`, `type`, `featured` (boolean), `top10` (boolean).

```http
GET /api/media?genre=Drama&featured=true
```
`200`: `{"media":[{"id":3,"title":"Título cadastrado","genre":"Drama","type":"filme","poster_path":"/uploads/abc.jpg","video_source_type":"link","video_url":"https://media.example/video.mp4","is_featured":true}]}`

Entity: `media`. Read-only. Errors: `422` invalid query, `503`.

### `GET /api/media/genres`
Lists distinct catalog genres. Public; no parameters/body. `200`: `{"genres":["Drama","Suspense"]}`. Entity: `media`. Read-only. Errors: `503`.

### `GET /api/media/{media_id}`
Returns one catalog item. Public. Path parameter: `media_id`.

```http
GET /api/media/3
```
`200`: `{"media":{"id":3,"title":"Título cadastrado","genre":"Drama"}}`. Entity: `media`. Read-only. Errors: `404`, `422`, `503`.

### `POST /api/media/{media_id}/view`
Records a view and increments the media counter. Public; bearer token optional and used to associate the view with a user. Path parameter: `media_id`; no request body.

```http
POST /api/media/3/view
```
`201`: `{"message":"Visualização registrada."}`. Entities: `media`, `view_logs`. Both writes must commit atomically. Errors: `404`, `422`, `503`.

### `POST /api/media`
Creates catalog media. `admin` or `superadmin` bearer token required. Multipart form fields: required `title`, `genre`; optional `synopsis`, `type` (`filme|serie|novela`), `classification`, `min_age`, `director`, `cast_list`, `country`, `producer`, `release_year`, `duration_minutes`, `video_source_type` (`link|upload`), `video_url`, `is_featured`, `is_top10`; optional files `poster` (image) and `video` (video). A link source requires `video_url`; an upload source requires `video`. Uploads are limited by `MAX_UPLOAD_BYTES`.

```http
POST /api/media
Content-Type: multipart/form-data
```
`201`: `{"message":"Mídia adicionada com sucesso.","mediaId":3}`. Entities: `media`, upload storage. Database insert is atomic; file and DB storage are not a distributed transaction, and the implementation removes newly stored files if the insert fails. Errors: `401`, `403`, `413`, `422`, `503`.

### `PUT /api/media/{media_id}`
Replaces the editable catalog fields using the same multipart fields as create. `admin` or `superadmin` required; path parameter `media_id`.

`200`: `{"message":"Mídia atualizada com sucesso."}`. Entity: `media` plus optional upload storage. One-row update. Errors: `401`, `403`, `404`, `413`, `422`, `503`.

### `DELETE /api/media/{media_id}`
Deletes a catalog item. `admin` or `superadmin` required. No body.

`200`: `{"message":"Mídia removida com sucesso."}`. Entity: `media` (foreign-key cascades may affect `view_logs` and seat rows). Database delete is atomic. Errors: `401`, `403`, `404`, `503`.

## Plans and subscriptions

### `GET /api/plans`
Lists configured plans. Public; no parameters/body. `200`: `{"plans":[{"id":1,"name":"Plano cadastrado","slug":"plano","price":"40.00","quality":"HD","max_simultaneous":2,"features":[]}]}`. Entity: `plans`. Read-only. Errors: `503`.

### `POST /api/plans/{plan_id}/subscribe`
Activates a plan for the authenticated user. Path parameter `plan_id`; no body.

```http
POST /api/plans/1/subscribe
Authorization: Bearer <token>
```
`201`: `{"message":"Assinatura do plano \"Plano cadastrado\" realizada com sucesso!"}`. Entities: `users`, `plans`, `subscriptions`. One transaction locks the user row, cancels their previous active subscription, then inserts the new one; it does not process payment. Errors: `401`, `404`, `503`.

### `GET /api/plans/my-subscription`
Returns the authenticated user's active subscription, or `null`. No query/body.

`200`: `{"subscription":{"id":9,"user_id":12,"plan_id":1,"status":"ativa","plan_name":"Plano cadastrado","price":"40.00","quality":"HD"}}`. Entities: `subscriptions`, `plans`. Read-only. Errors: `401`, `503`.

## Rooms and seats

### `GET /api/rooms`
Lists rooms. Public; no parameters/body. `200`: `{"rooms":[{"id":1,"name":"Sala Retrô 1","theme":"retro","total_rows":6,"seats_per_row":8}]}`. Entity: `rooms`. Read-only. Errors: `503`.

### `GET /api/rooms/{room_id}/seats`
Returns seat occupancy for a room and optionally a media title. Query parameter: `media_id` (positive integer, optional). Bearer token optional; when provided, returns the caller's `mySeat`.

```http
GET /api/rooms/1/seats?media_id=3
```
`200`: `{"room":{"id":1,"name":"Sala Retrô 1","total_rows":6,"seats_per_row":8},"takenSeats":["A1"],"mySeat":null}`. Entities: `rooms`, `seat_selections`. Read-only. Errors: `404`, `422`, `503`.

### `POST /api/rooms/{room_id}/select-seat`
Creates a reservation for an available seat. Bearer token optional to retain existing guest selection behavior. Path parameter: `room_id`. Required JSON body:

```json
{"media_id":3,"seat_row":"B","seat_number":4}
```
`201`: `{"message":"Poltrona B4 reservada com sucesso!"}`. Entities: `rooms`, `media`, `seat_selections`, optionally `users`. The server validates the room/media/seat and serializes room reservations in one PostgreSQL transaction. A unique seat constraint is also required for protection against writers that bypass this API; see the schema plan. Errors: `404`, `409` occupied seat, `422` invalid/out-of-room seat, `503`.

### `PUT /api/rooms/{room_id}/select-seat`
Atomically moves the authenticated user's existing reservation for the given media to another available seat. Same path parameter and JSON shape as `POST`. An account is required so the old reservation can be identified.

```json
{"media_id":3,"seat_row":"B","seat_number":5}
```
`200`: `{"message":"Poltrona alterada para B5."}`. Entity: `seat_selections` (updates the reservation row rather than leaving the previous seat reserved). One transaction locks the room and reservation and checks target availability before updating. Errors: `401`, `404` no room/current reservation, `409` occupied seat, `422`, `503`.

### `POST /api/rooms`
Creates a room. `admin` or `superadmin` required.

```json
{"name":"Sala Moderna 2","theme":"moderna","total_rows":6,"seats_per_row":8}
```
`201`: `{"message":"Sala criada com sucesso.","roomId":2}`. Entity: `rooms`. One-row insert. Errors: `401`, `403`, `422`, `503`.

## Implemented route inventory

| Method | Full path | Auth / permission | State |
|---|---|---|---|
| GET | `/api/health` | Public | Implemented |
| POST | `/api/auth/register` | Public | Implemented |
| POST | `/api/auth/login` | Public | Implemented |
| GET | `/api/auth/me` | Bearer | Implemented |
| GET | `/api/users` | admin, superadmin | Implemented |
| GET | `/api/users/metrics` | admin, superadmin | Implemented |
| PUT | `/api/users/me` | Bearer | Implemented |
| POST | `/api/users` | superadmin | Implemented |
| PUT | `/api/users/{user_id}/reset-password` | superadmin | Implemented |
| PUT | `/api/users/{user_id}/role` | superadmin | Implemented |
| PUT | `/api/users/{user_id}/status` | superadmin | Implemented |
| DELETE | `/api/users/{user_id}` | superadmin | Implemented |
| GET | `/api/media` | Public | Implemented |
| GET | `/api/media/genres` | Public | Implemented |
| GET | `/api/media/{media_id}` | Public | Implemented |
| POST | `/api/media/{media_id}/view` | Optional bearer | Implemented |
| POST | `/api/media` | admin, superadmin | Implemented |
| PUT | `/api/media/{media_id}` | admin, superadmin | Implemented |
| DELETE | `/api/media/{media_id}` | admin, superadmin | Implemented |
| GET | `/api/plans` | Public | Implemented |
| POST | `/api/plans/{plan_id}/subscribe` | Bearer | Implemented |
| GET | `/api/plans/my-subscription` | Bearer | Implemented |
| GET | `/api/rooms` | Public | Implemented |
| GET | `/api/rooms/{room_id}/seats` | Optional bearer | Implemented |
| POST | `/api/rooms/{room_id}/select-seat` | Optional bearer | Implemented |
| PUT | `/api/rooms/{room_id}/select-seat` | Bearer | Implemented |
| POST | `/api/rooms` | admin, superadmin | Implemented |

### Not implemented / explicitly out of scope

There is no route for payment collection/refunds, subscription cancellation, user self-service password reset/recovery, email changes, session/showtime scheduling, seat cancellation, or trailer-specific CRUD. The current media create/update routes already accept video URL or upload fields; they remain the administration path for trailers/media. No payment or e-mail service is configured, and the plan subscription endpoint only changes database state.
