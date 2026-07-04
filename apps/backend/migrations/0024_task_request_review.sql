-- Issue #133: Slice 6 Task Request review decisions.
-- Adds nullable review metadata to the existing Task Request buffer. Approval
-- remains separate from Task conversion; this migration creates no Task table.

ALTER TABLE "task_request"."task_requests"
  ADD COLUMN "reviewer_actor_id" uuid NULL REFERENCES "core"."actors"("id"),
  ADD COLUMN "decision_reason" text NULL,
  ADD COLUMN "decided_at" timestamptz NULL;
