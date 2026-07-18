-- Issue #182: make the reporter-safe VOC -> Task conversion evidence link reachable.
--
-- Traceability predicate: only an active (voc, task, evidence_of) link whose
-- exact ID is recorded in the Task conversion audit is backfilled. This covers
-- both direct-VOC and Finding-propagated conversion evidence without inferring
-- provenance from link shape, source Task Request, or matching endpoints.
--
-- Coverage boundary: older task_created_from_request audit payloads without
-- detail.preserved_links are intentionally not backfilled. Only audit rows
-- carrying link IDs prove conversion provenance; untraceable links stay
-- internal_only. The visibility predicate makes this safe to re-run.
UPDATE core.entity_links AS link
   SET visibility = 'summary_visible'
  FROM core.audit_log AS audit
 CROSS JOIN LATERAL jsonb_array_elements_text(
   CASE
     WHEN jsonb_typeof(audit.detail -> 'preserved_links') = 'array'
       THEN audit.detail -> 'preserved_links'
     ELSE '[]'::jsonb
   END
 ) AS preserved(link_id)
 WHERE audit.workspace_id = link.workspace_id
   AND audit.event_type = 'task_created_from_request'
   AND audit.subject_type = 'task'
   AND audit.subject_id = link.target_id
   AND preserved.link_id = link.id::text
   AND link.source_type = 'voc'
   AND link.target_type = 'task'
   AND link.relation_type = 'evidence_of'
   AND link.status = 'active'
   AND link.visibility = 'internal_only';
