insert into core.actors (id, workspace_id, name, role_level) values
  ('admin', 'ws-main', 'Admin', 'Admin'),
  ('admin-denied-looker', 'ws-main', 'Denied Admin', 'Admin'),
  ('dev-tableau', 'ws-main', 'Tableau Developer', 'Developer'),
  ('user-tableau', 'ws-main', 'Reporter', 'User')
on conflict (id) do update set name = excluded.name, role_level = excluded.role_level;

insert into core.managed_systems (id, workspace_id, name) values
  ('ms-tableau', 'ws-main', 'Tableau'),
  ('ms-powerbi', 'ws-main', 'Power BI'),
  ('ms-looker', 'ws-main', 'Looker')
on conflict (id) do update set name = excluded.name;

insert into core.analytics_areas (id, workspace_id, managed_system_id, name) values
  ('aa-tableau-exec', 'ws-main', 'ms-tableau', 'Executive Reporting'),
  ('aa-powerbi-ops', 'ws-main', 'ms-powerbi', 'Operations Analytics'),
  ('aa-looker-revenue', 'ws-main', 'ms-looker', 'Revenue Analytics')
on conflict (id) do update set name = excluded.name, managed_system_id = excluded.managed_system_id;

insert into permission.permission_grants (id, workspace_id, actor_id, managed_system_id, capability) values
  ('grant-dev-tableau', 'ws-main', 'dev-tableau', 'ms-tableau', null),
  ('grant-user-tableau', 'ws-main', 'user-tableau', 'ms-tableau', null)
on conflict (id) do update set capability = excluded.capability;

insert into permission.permission_denies (id, workspace_id, actor_id, managed_system_id, reason) values
  ('deny-admin-looker', 'ws-main', 'admin-denied-looker', 'ms-looker', 'Explicit deny precedence fixture')
on conflict (id) do update set reason = excluded.reason;

insert into voc.vocs (
  id, workspace_id, managed_system_id, analytics_area_id, reporter_id, title, description,
  severity, triage_state, reporter_facing_status, owner_id
) values
  ('voc-seeded-tableau', 'ws-main', 'ms-tableau', 'aa-tableau-exec', 'user-tableau', 'Seeded Tableau VOC', 'Dashboard is intermittently slow.', 'medium', 'triaging', '검토 중', 'dev-tableau'),
  ('voc-high-unlinked', 'ws-main', 'ms-tableau', null, 'user-tableau', 'High severity unlinked VOC', 'Month-end finance dashboard is down.', 'high', 'triaged', '검토 중', 'dev-tableau')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  severity = excluded.severity,
  triage_state = excluded.triage_state,
  reporter_facing_status = excluded.reporter_facing_status,
  owner_id = excluded.owner_id;

insert into finding.findings (id, workspace_id, managed_system_id, title, summary, status) values
  ('finding-seeded-tableau', 'ws-main', 'ms-tableau', 'Seeded Tableau performance finding', 'Repeated VOCs indicate cache misses.', 'active')
on conflict (id) do update set title = excluded.title, summary = excluded.summary, status = excluded.status;

insert into task.task_requests (id, workspace_id, managed_system_id, title, status, source_type, source_id, requested_by_id) values
  ('task-request-seeded', 'ws-main', 'ms-tableau', 'Investigate Tableau cache regression', 'pending_review', 'finding', 'finding-seeded-tableau', 'admin')
on conflict (id) do update set title = excluded.title, status = excluded.status;

insert into core.entity_links (id, workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility) values
  ('link-finding-task-request-seeded', 'ws-main', 'finding', 'finding-seeded-tableau', 'task_request', 'task-request-seeded', 'requested_task', 'summary_visible')
on conflict (id) do update set visibility = excluded.visibility;
