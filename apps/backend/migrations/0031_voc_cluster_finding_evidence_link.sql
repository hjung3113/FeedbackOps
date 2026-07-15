-- Issue #127: link an existing Finding to a VOC Cluster as evidence, without
-- asserting the cluster created it.

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
    ('voc_cluster','finding','evidence_of'),
    ('finding','task_request','requested_task'),
    ('task_request','task','converted_to'),
    ('finding','task','requested_task'),
    ('voc','task','evidence_of'),
    ('voc','task_request','requested_task'),
    ('voc_cluster','task_request','requested_task')
  ));
