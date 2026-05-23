alter table rooms
  add column question_count int not null default 10;

alter table game_sessions
  add column question_ids jsonb;
