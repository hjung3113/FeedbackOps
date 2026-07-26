-- #168 step 4: persisted recommendation decisions (ADR-0034 D3/D6).
--
-- What is NOT here is the point. ADR-0034 D6 computes recommendations on read
-- against current vectors, so the `suggested` state is never a row: it is the
-- absence of a decision for a pair that clears the pinned similarity cut. Only
-- the two terminal states of the D3 machine are durable, because only they
-- carry a human judgement that recomputation must not undo.
--
-- Suppression scope is encoded in the unique key, not in application code:
--
--   * `embedding_version` is part of the key, so a version bump produces a
--     different key for the same pair. The old suppression rows stay (they are
--     the audit trail of what was decided under the ranking that existed then)
--     but they can no longer match a query at the new active version. That is
--     ADR-0034 D3's "a new embedding version clears that suppression",
--     expressed as a constraint rather than a convention.
--
--   * `scope_key` is the ADR-0031 visibility arm the decider used, rendered as
--     text: `ms:<uuid>` when the candidate's Managed System was in their
--     voc.read scope, `actor:<uuid>` when they could only see the candidate
--     because they reported it. The MS arm is a shared triage judgement — every
--     actor scoped to that Managed System sees the same suppression. The
--     reporter arm is personal by construction: it must not let a reporter
--     suppress a pair for the triagers who own the system.
CREATE TABLE "voc"."voc_recommendation_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "source_voc_id" uuid NOT NULL REFERENCES "voc"."vocs"("id") ON DELETE CASCADE,
  "candidate_voc_id" uuid NOT NULL REFERENCES "voc"."vocs"("id") ON DELETE CASCADE,
  "embedding_version" integer NOT NULL,
  "state" text NOT NULL,
  "scope_key" text NOT NULL,
  "cluster_id" uuid REFERENCES "voc_cluster"."voc_clusters"("id"),
  "decided_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "decided_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "voc_recommendation_decisions_state_check"
    CHECK ("state" IN ('dismissed','confirmed')),
  CONSTRAINT "voc_recommendation_decisions_version_positive"
    CHECK ("embedding_version" > 0),
  -- A VOC is never its own candidate; the read model excludes the source, and
  -- the constraint stops a hand-written decision from contradicting it.
  CONSTRAINT "voc_recommendation_decisions_distinct_pair"
    CHECK ("source_voc_id" <> "candidate_voc_id"),
  -- Confirmation is the only path that creates or joins a cluster (ADR-0034
  -- D3), so a confirmed row without a cluster — or a dismissal with one — is a
  -- broken state machine, not a tolerable NULL.
  CONSTRAINT "voc_recommendation_decisions_cluster_matches_state"
    CHECK (("state" = 'confirmed') = ("cluster_id" IS NOT NULL)),
  CONSTRAINT "voc_recommendation_decisions_pair_scope_version_uq"
    UNIQUE ("source_voc_id", "candidate_voc_id", "embedding_version", "scope_key")
);
--> statement-breakpoint
-- The read model's suppression lookup: given a source VOC at the active
-- version, which candidates are already decided.
CREATE INDEX "voc_recommendation_decisions_source_version_idx"
  ON "voc"."voc_recommendation_decisions"
  USING btree ("source_voc_id", "embedding_version");
--> statement-breakpoint
GRANT ALL ON "voc"."voc_recommendation_decisions" TO fops_migrate;
--> statement-breakpoint
-- No DELETE for fops_app: a dismissal that the application can erase is not a
-- dismissal that survives recomputation. UPDATE is granted only so a
-- previously dismissed pair can be promoted to `confirmed` in place — the one
-- legal transition out of a terminal state, and the reason the unique key
-- cannot simply be insert-only.
GRANT SELECT, INSERT, UPDATE ON "voc"."voc_recommendation_decisions" TO fops_app;
