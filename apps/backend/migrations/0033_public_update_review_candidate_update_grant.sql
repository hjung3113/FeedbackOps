-- Issue #180: reviewers resolve durable released-Task review candidates.
-- Keep this deliberately column-scoped: terminal immutability remains enforced
-- by voc.prevent_public_update_review_candidate_terminal_mutation (0032).
GRANT UPDATE (
  status,
  resolved_by_actor_id,
  resolved_at,
  dismissal_reason,
  actioned_public_update_id
) ON voc.public_update_review_candidates TO fops_app;
