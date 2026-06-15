# Issue #112 — Deviations

## D1 · `packages/shared/src/vocs/detail.ts` — `links` field made `.optional()`

**Prompt directive:** "FORBIDDEN — `packages/shared/src/vocs/*` shape changes that break Slice 3 consumers (additions OK only if strictly required for the Links tab DTO)."

**Actual change:** `links: z.array(entityLinkDtoSchema).optional()` instead of a required array.

**Reason:** Slice 3 VOC detail consumers and fixtures predate any `entity_links` payload. Making the new field optional preserves source-compatibility for those consumers and fixture data while the backend still populates it on full detail reads for new code paths. Strictly required addition (the Links tab DTO) is satisfied; the optionality only relaxes the wire contract for legacy callers.

**Reviewer position:** REVIEWER (read-only codex, `.review/ISSUE-112-REVIEW.json`) approved with verdict `approve`, listing this in `deviations_acceptable_with_doc` and `must_fix_before_commit: []`.

**Follow-up:** When Slice 4.2/4.3 lands, audit whether `links` can be tightened back to required; track under #113 or as a Slice 4 wrap-up item.
