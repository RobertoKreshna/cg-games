-- Memory Ayat: per-room configuration.
alter table rooms
  add column memory_cards int not null default 20 check (memory_cards in (12, 20, 30, 40)),
  add column memory_delay_ms int not null default 1000 check (memory_delay_ms in (500, 1000, 2000, 3000));

-- Boards are generated per game and stored as questions rows; created_at lets cleanup remove old ones.
alter table questions
  add column created_at timestamptz not null default now();

-- Same job as before (delete old rooms, cascading), plus the generated boards of that age.
create or replace function cleanup_old_rooms(max_age interval default interval '7 days')
returns integer
language sql
as $$
  with boards as (
    delete from questions where game_type = 'memory_match' and created_at < now() - max_age returning 1
  ), deleted as (
    delete from rooms where created_at < now() - max_age returning 1
  )
  select count(*)::int from deleted;
$$;
