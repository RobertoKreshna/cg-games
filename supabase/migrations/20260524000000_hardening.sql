-- Server-side question clock, so answer timing no longer depends on the client.
alter table game_sessions
  add column question_started_at timestamptz;

-- Speeds up the reveal check and leaderboard queries.
create index answers_session_question_idx on answers (session_id, question_id);
create index players_room_idx on players (room_id);

-- The app only reaches these tables through edge functions, which connect as the postgres role
-- (bypasses RLS). Enabling RLS with no policies blocks direct access with the public anon key.
alter table rooms enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table answers enable row level security;

-- Rooms are never deleted by the app. Schedule this (e.g. pg_cron, daily) to remove old games;
-- everything attached to a room cascades.
create or replace function cleanup_old_rooms(max_age interval default interval '7 days')
returns integer
language sql
as $$
  with deleted as (
    delete from rooms where created_at < now() - max_age returning 1
  )
  select count(*)::int from deleted;
$$;

-- Supabase exposes public functions over its REST API; keep this one internal.
revoke execute on function cleanup_old_rooms(interval) from public, anon, authenticated;
