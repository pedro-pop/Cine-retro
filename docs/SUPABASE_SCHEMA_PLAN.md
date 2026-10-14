# Cine Retrô — Supabase schema plan

**Planning only:** no database objects, migrations, or RLS policies are created or applied in this change. This plan describes the existing PostgreSQL contract and the constraints needed to make it safe for Supabase. Column types below use PostgreSQL terminology.

## Entities and relationships

| Table | Planned columns | Keys and relationships |
|---|---|---|
| `users` | `id bigint generated identity`, `name varchar(150)`, `email varchar(150)`, `password_hash varchar(255)`, `role varchar(20)`, `avatar_url text`, `active boolean`, `created_by bigint`, `created_at timestamptz`, `updated_at timestamptz` | PK `id`; unique normalized email; `created_by -> users.id ON DELETE SET NULL`; role check: `comum`, `admin`, `superadmin`. |
| `plans` | `id bigint generated identity`, `name varchar(80)`, `slug varchar(80)`, `price numeric(10,2)`, `max_simultaneous integer`, `quality varchar(50)`, `allows_offline boolean`, `early_access boolean`, `ad_free boolean`, `is_popular boolean`, `features jsonb`, `created_at timestamptz` | PK `id`; unique `slug`; nonnegative price and positive simultaneous-device limit. |
| `subscriptions` | `id bigint generated identity`, `user_id bigint`, `plan_id bigint`, `status varchar(20)`, `started_at timestamptz`, `expires_at timestamptz` | PK `id`; FKs to `users` (`CASCADE`) and `plans` (`RESTRICT`); status check. One active subscription per user should be enforced with a partial unique index. |
| `media` | `id bigint generated identity`, `title varchar(200)`, `synopsis text`, `type varchar(20)`, `genre varchar(60)`, `classification varchar(10)`, `min_age integer`, `director varchar(150)`, `cast_list text`, `country varchar(80)`, `producer varchar(150)`, `release_year integer`, `duration_minutes integer`, `poster_path text`, `video_source_type varchar(10)`, `video_path text`, `video_url text`, `is_featured boolean`, `is_top10 boolean`, `top10_rank integer`, `view_count integer`, `created_by bigint`, `created_at timestamptz`, `updated_at timestamptz` | PK `id`; `created_by -> users.id ON DELETE SET NULL`; type and source checks; positive/nonnegative checks for duration, age and count. |
| `view_logs` | `id bigint generated identity`, `user_id bigint`, `media_id bigint`, `viewed_at timestamptz` | PK `id`; `user_id -> users.id ON DELETE SET NULL`; `media_id -> media.id ON DELETE CASCADE`. |
| `rooms` | `id bigint generated identity`, `name varchar(100)`, `theme varchar(20)`, `total_rows integer`, `seats_per_row integer`, `created_at timestamptz` | PK `id`; theme check (`retro`, `moderna`); positive dimensions. |
| `seat_selections` | `id bigint generated identity`, `user_id bigint`, `room_id bigint`, `media_id bigint`, `seat_row varchar(5)`, `seat_number integer`, `selected_at timestamptz` | PK `id`; FKs to users (`SET NULL`), rooms (`CASCADE`), media (`CASCADE`); valid row/seat bounds enforced by API and preferably DB constraints/triggers. |

The frontend currently treats a room and a media title as a single seat-selection context. There is no scheduled screening/showtime table. Before launch, decide whether to add `screenings` (room, media, start/end time, status) and point reservations to a screening. Without that decision, two showings of one title cannot have independent seat maps.

## Integrity, uniqueness, and concurrency

1. Normalize e-mail to lowercase in application code and enforce `UNIQUE (lower(email))` (or use `citext`) to prevent case-variant accounts.
2. Add `UNIQUE (room_id, media_id, seat_row, seat_number)` to `seat_selections`. This is the authoritative last defense against simultaneous writes, including writers other than the FastAPI process.
3. If one account may hold at most one seat per room/media, add a partial unique index on `(user_id, room_id, media_id) WHERE user_id IS NOT NULL`. Confirm whether guest seats should remain supported before enabling this.
4. Seat creation must run in a transaction: lock the room or use a per-screening advisory lock, validate the room/media and seat bounds, check availability, insert, and commit. Convert unique violations to `409 Conflict`. Seat changes must lock the current reservation and target, check availability, update the existing row, and commit atomically. Do not release the old seat in local browser state.
5. Subscription change must lock the user, cancel the old active subscription, and insert the new active row in one transaction; add a partial unique index on `subscriptions(user_id) WHERE status='ativa'`.
6. View counter update and view-log insert are one transaction.
7. E-mail uniqueness, role/status checks, foreign keys, and deletion behavior must be enforced in PostgreSQL, not only in Pydantic validation.

The current reference schema does not include the seat/subscription uniqueness constraints above. The Python service serializes seat requests through its room row lock and uses advisory locks, but cannot guarantee protection against a separate legacy writer until the database constraint is reviewed and applied. The existing Node service must not be run concurrently as a production write API without that constraint.

## RLS policies to define before Supabase client access

The current frontend calls the FastAPI service; the database URL and JWT signing secret remain server-side. Do not put Supabase `service_role` credentials in the browser.

- `users`: deny anonymous table access. Authenticated users may read their own safe profile fields and update only their own permitted profile fields; passwords, roles, active state, and `created_by` are server-only. Admin/superadmin policy must validate role from a trusted server-managed claim or secure role table, not user-editable metadata.
- `plans`, `media`, `rooms`: allow public `SELECT` only for published/active records. Restrict all writes to authorized server operations/admins.
- `subscriptions`: a user may read only their own rows; writes are server-only, including cancellation and plan transitions.
- `view_logs`: allow users to see only their own logs; writes should be server-mediated so counter/log updates stay atomic. Anonymous views require an explicit policy decision.
- `seat_selections`: public reads may expose seat identifiers/availability only, never user IDs. Inserts/updates/deletes must be server-mediated (or use an audited RPC) so availability validation and seat change are atomic.

## Indexes

- `users (lower(email)) UNIQUE`.
- `subscriptions (user_id) WHERE status = 'ativa' UNIQUE`; plus `(plan_id, status)`.
- `media (genre)`, `(is_featured)`, `(is_top10, top10_rank)`, and a search index appropriate to the chosen search implementation (trigram/full-text decision pending).
- `view_logs (media_id, viewed_at DESC)` and `(user_id, viewed_at DESC)`.
- `rooms (id)` primary key is sufficient for current ordering.
- `seat_selections (room_id, media_id, seat_row, seat_number) UNIQUE`; `(user_id, room_id, media_id)` partial unique after guest semantics are decided; optional lookup index `(media_id, room_id)`.

## Decisions still needed

- Whether the application will use Supabase Auth or retain server-issued JWTs/password hashes. Do not mix Supabase Auth identity IDs with the existing integer user IDs without a migration plan.
- Whether screenings/showtimes are needed; this affects seat uniqueness and all seat API paths.
- Whether guest seat reservation is allowed and, if so, how it can be identified, changed, or expired.
- Whether subscription records represent paid entitlements; payment provider, webhook verification, cancellation, renewal, and failed payment behavior are not implemented.
- Where poster/video files will be stored in production (Supabase Storage vs another private/public object store), access policy, size limits, and cleanup of replaced/deleted uploads.
- Whether profile email changes, password recovery, and account deletion need confirmation workflows.
- Data migration from the current `SERIAL` integer IDs and legacy Node seed records, including exclusion of demonstration data.

## Current reference model compatibility

`database/schema-reference.sql` is informational and remains unchanged. The Python service issues queries against its existing `users`, `plans`, `subscriptions`, `media`, `view_logs`, `rooms`, and `seat_selections` columns. Application startup does not create tables, migrate the reference schema, seed sample catalog items, or connect directly to the Supabase REST API. Existing `seat_selections` lacks the uniqueness guarantees described above, so do not treat reservation concurrency as production-safe until those constraints and the deployment writer strategy are settled.
