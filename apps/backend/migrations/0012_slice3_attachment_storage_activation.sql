-- Slice 3 #22 / Chunk C2: activate the voc_attachments storage surface.
--
-- This migration prepares voc.voc_attachments for the storage endpoint
-- landing in C3 (POST /attachments) and the purge job in C4. It is a
-- pure DB-shape change; no service code is introduced here.
--
-- Changes (per #22 spec + PLAN-22 §C2):
--   1. RENAME storage_uri → storage_key.
--      The old name implied a URI; the new value is an opaque object key
--      (`{workspace_id}/{uuidv7}/{sanitized_filename}` per D-03). RENAME
--      cannot be expressed idempotently in standard SQL; this migration
--      is one-shot. fops_migrate runs it once at deploy.
--
--   2. ADD UNIQUE (storage_key).
--      Two rows must never point at the same object: the purge job (C4)
--      keys deletions by storage_key and a collision would orphan one row
--      or double-delete an object.
--
--   3. DROP voc_attachments_subject_xor; replace with subject_not_both.
--      0010's XOR required exactly one of {voc_id, comment_id} to be set.
--      C3 uploads land BEFORE the row is linked to any parent — at INSERT
--      time both columns must be NULL. The new CHECK forbids only the
--      "both populated" case; (NULL, NULL) and either-one-set remain
--      legal. (The polymorphic comment_id trigger from 0011 is unchanged
--      and still enforces existence when comment_id IS NOT NULL.)
--
--   4. ADD COLUMN linked_at timestamptz NULL.
--      C3's link step (called from voc create / patch-description / each
--      composer) will UPDATE this column to now() when an attachment is
--      attached to a parent. The purge job uses linked_at IS NULL AND
--      created_at < now() - interval '24 hours' as the reclaim predicate.
--      This migration does NOT install triggers — population is service-
--      layer responsibility per #22.
--
-- No-op assertions (regression intent, not executed here):
--   * uploaded_by_actor_id remains uuid NOT NULL (from 0010:298).
--   * archived_at / archived_by_actor_id columns from 0011 are untouched.
--   * fops_app DELETE remains revoked (0011 archive-over-delete).

-- ─── 1. RENAME storage_uri → storage_key ─────────────────────────────────
ALTER TABLE "voc"."voc_attachments"
  RENAME COLUMN "storage_uri" TO "storage_key";
--> statement-breakpoint

-- ─── 2. UNIQUE constraint on storage_key ────────────────────────────────
ALTER TABLE "voc"."voc_attachments"
  ADD CONSTRAINT "voc_attachments_storage_key_unique" UNIQUE ("storage_key");
--> statement-breakpoint

-- ─── 3. Relax subject XOR: forbid only "both populated" ─────────────────
ALTER TABLE "voc"."voc_attachments"
  DROP CONSTRAINT "voc_attachments_subject_xor";
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments"
  ADD CONSTRAINT "voc_attachments_subject_not_both"
  CHECK (NOT ("voc_id" IS NOT NULL AND "comment_id" IS NOT NULL));
--> statement-breakpoint

-- ─── 4. linked_at column (nullable, populated by C3 service layer) ─────
ALTER TABLE "voc"."voc_attachments"
  ADD COLUMN IF NOT EXISTS "linked_at" timestamp with time zone;
