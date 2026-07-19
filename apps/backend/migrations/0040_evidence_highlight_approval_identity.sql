-- Issue #187 C4 r6: survey-response highlights are bound to the exact
-- approval that authorized their safe excerpt. Revoking that approval hides
-- the excerpt everywhere, even if an identical later approval remains active.
ALTER TABLE "finding"."evidence_highlights"
  ADD COLUMN "approved_excerpt_id" uuid
  REFERENCES "survey"."survey_response_excerpt_approvals"("id");
