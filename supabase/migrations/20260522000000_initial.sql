create extension if not exists "pgcrypto";

create type game_type as enum ('bible_quiz', 'verse_scramble', 'emoji_story');
create type room_mode as enum ('individual', 'team');
create type room_status as enum ('lobby', 'playing', 'finished');
create type session_status as enum ('waiting', 'question', 'reveal', 'finished');

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(6) not null unique,
  game_type game_type not null,
  mode room_mode not null default 'individual',
  status room_status not null default 'lobby',
  host_token varchar(64) not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name varchar(50) not null,
  color varchar(20) not null
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name varchar(50) not null,
  team_id uuid references teams(id) on delete set null,
  session_token varchar(64) not null,
  joined_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  game_type game_type not null,
  order_index int not null,
  content jsonb not null
);

create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  current_question_index int not null default 0,
  status session_status not null default 'waiting',
  started_at timestamptz
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  session_id uuid not null references game_sessions(id) on delete cascade,
  submitted_answer text not null,
  is_correct boolean not null,
  points int not null default 0,
  time_taken_ms int not null,
  created_at timestamptz not null default now(),
  unique(player_id, question_id, session_id)
);
