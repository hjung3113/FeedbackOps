-- Issue #182: make the reporter-safe VOC -> Task conversion evidence link reachable.
--
-- Traceability predicate: only an active (voc, task, evidence_of) link is
-- backfilled when its Task was created from a Task Request whose recorded
-- source is that exact VOC. The task.source_task_request_id ->
-- task_request.task_requests(source_type = 'voc', source_id) join proves the
-- link came from task-request conversion; all untraceable links stay unchanged.
-- The visibility predicate makes this safe to re-run.
UPDATE core.entity_links AS link
   SET visibility = 'summary_visible'
  FROM task.tasks AS task
  JOIN task_request.task_requests AS request
    ON request.id = task.source_task_request_id
   AND request.workspace_id = task.workspace_id
 WHERE link.workspace_id = task.workspace_id
   AND link.source_type = 'voc'
   AND link.target_type = 'task'
   AND link.relation_type = 'evidence_of'
   AND link.status = 'active'
   AND link.visibility = 'internal_only'
   AND link.target_id = task.id
   AND request.source_type = 'voc'
   AND link.source_id = request.source_id;
