create table if not exists core.app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
