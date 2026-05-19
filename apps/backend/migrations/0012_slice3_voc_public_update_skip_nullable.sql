-- Migration 0012: relax body_rich_content to nullable + replace skip-reason
-- CHECK with full skip-row invariants (C1 of Slice 3 #16).
--
-- skip=true  ⇒ body NULL,    skip_reason IS NOT NULL AND length(trim) >= 8
-- skip=false ⇒ body NOT NULL, skip_reason IS NULL

ALTER TABLE "voc"."voc_public_updates"
  ALTER COLUMN "body_rich_content" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "voc"."voc_public_updates"
  DROP CONSTRAINT "voc_public_updates_skip_reason_min_length";
--> statement-breakpoint

ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_skip_invariants"
  CHECK (
    ("skip_public_update" = true
      AND "body_rich_content" IS NULL
      AND "skip_reason" IS NOT NULL
      AND length(trim("skip_reason")) >= 8)
    OR
    ("skip_public_update" = false
      AND "body_rich_content" IS NOT NULL
      AND "skip_reason" IS NULL)
  );
