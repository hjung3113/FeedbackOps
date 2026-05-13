create schema if not exists core;
create schema if not exists permission;
create schema if not exists voc;
create schema if not exists finding;
create schema if not exists task;

create table if not exists core.actors (
  id text primary key,
  workspace_id text not null,
  name text not null,
  role_level text not null check (role_level in ('Admin', 'Developer', 'User')),
  created_at timestamptz not null default now()
);

create table if not exists core.managed_systems (
  id text primary key,
  workspace_id text not null,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists core.analytics_areas (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists permission.permission_grants (
  id text primary key,
  workspace_id text not null,
  actor_id text not null references core.actors(id),
  managed_system_id text not null references core.managed_systems(id),
  capability text,
  created_at timestamptz not null default now()
);

create table if not exists permission.permission_denies (
  id text primary key,
  workspace_id text not null,
  actor_id text not null references core.actors(id),
  managed_system_id text not null references core.managed_systems(id),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists permission.permission_requests (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  requester_id text not null references core.actors(id),
  reason text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists core.audit_logs (
  id text primary key,
  workspace_id text not null,
  actor_id text references core.actors(id),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists core.app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists voc.vocs (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  analytics_area_id text references core.analytics_areas(id),
  reporter_id text not null references core.actors(id),
  title text not null,
  description text not null,
  source_context text,
  severity text,
  triage_state text not null,
  reporter_facing_status text not null,
  owner_id text references core.actors(id),
  created_at timestamptz not null default now()
);

create table if not exists voc.voc_conversation_entries (
  id text primary key,
  workspace_id text not null,
  voc_id text not null references voc.vocs(id),
  author_id text not null references core.actors(id),
  entry_type text not null check (entry_type in ('public_update', 'reporter_reply', 'internal_comment')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists finding.findings (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  title text not null,
  summary text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists task.task_requests (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  title text not null,
  status text not null,
  source_type text not null,
  source_id text not null,
  requested_by_id text not null references core.actors(id),
  created_at timestamptz not null default now()
);

create table if not exists task.tasks (
  id text primary key,
  workspace_id text not null,
  managed_system_id text not null references core.managed_systems(id),
  title text not null,
  status text not null,
  assignee_id text references core.actors(id),
  priority text,
  created_at timestamptz not null default now()
);

create table if not exists core.entity_links (
  id text primary key,
  workspace_id text not null,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relation_type text not null check (relation_type <> 'generated_voc'),
  visibility text not null,
  created_at timestamptz not null default now()
);

create index if not exists vocs_workspace_status_idx on voc.vocs (workspace_id, triage_state);
create index if not exists task_requests_workspace_status_idx on task.task_requests (workspace_id, status);
create index if not exists entity_links_source_idx on core.entity_links (workspace_id, source_type, source_id);
create index if not exists entity_links_target_idx on core.entity_links (workspace_id, target_type, target_id);
create index if not exists entity_links_relation_idx on core.entity_links (workspace_id, relation_type);
create index if not exists audit_logs_workspace_event_idx on core.audit_logs (workspace_id, actor_id, event_type, created_at);
