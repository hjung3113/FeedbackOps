-- Issue #136: Slice 6 VOC and VOC Cluster Task Request sources.
-- Widens core.entity_links only so VOC and VOC Cluster can preserve
-- requested_task provenance to task_request.task_requests.

ALTER TABLE "core"."entity_links"
  DROP CONSTRAINT IF EXISTS "entity_links_tuple_check";
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  ADD CONSTRAINT "entity_links_tuple_check"
  CHECK (("source_type", "target_type", "relation_type") IN (
    ('voc','voc','related_to'),
    ('voc','finding','created_finding'),
    ('voc','finding','evidence_of'),
    ('voc_cluster','finding','created_finding'),
    ('finding','task_request','requested_task'),
    ('task_request','task','converted_to'),
    ('finding','task','requested_task'),
    ('voc','task','evidence_of'),
    ('voc','task_request','requested_task'),
    ('voc_cluster','task_request','requested_task')
  ));
