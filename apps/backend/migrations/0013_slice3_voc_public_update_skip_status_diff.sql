-- Migration 0013: tighten voc_public_updates_skip_invariants to also enforce
-- the status-diff invariant on skip rows (codex cycle-2 fix for Slice 3 #16).
--
-- skip=true  ⇒ body NULL, skip_reason IS NOT NULL AND length(trim) >= 8,
--             AND reporter_facing_status_before <> reporter_facing_status_after
-- skip=false ⇒ body NOT NULL AND skip_reason IS NULL
--
-- Same-status skip rows are nonsensical (skip is by definition a status change)
-- and were previously only rejected by the app layer.

ALTER TABLE "voc"."voc_public_updates"
  DROP CONSTRAINT "voc_public_updates_skip_invariants";
--> statement-breakpoint

ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_skip_invariants"
  CHECK (
    ("skip_public_update" = true
      AND "body_rich_content" IS NULL
      AND "skip_reason" IS NOT NULL
      AND length(trim("skip_reason")) >= 8
      AND "reporter_facing_status_before" <> "reporter_facing_status_after")
    OR
    ("skip_public_update" = false
      AND "body_rich_content" IS NOT NULL
      AND "skip_reason" IS NULL)
  );
