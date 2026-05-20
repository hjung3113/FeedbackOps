# Slice 3 #24 — Adversarial Review Cycle 2 (Opus subagent)

**Diff:** `/tmp/slice3-24-diff.txt` (353 lines).
**Reviewer:** general-purpose subagent, Opus 4.7, cross-file invariant focus.
**Date:** 2026-05-19.

**Verdict: 0 BLOCKER · 0 MAJOR · 0 MINOR. Cycle-2 clean.**

## Clean on all challenged points

- **Counter scope:** closure-locals per `sanitizeTipTap()` call. Each request triggers exactly one call (voc-description in `service.ts`; one of public-update / reporter-reply / internal-comment in `conversation-service.ts`). No multi-call flow today → no bleed.
- **Test boundary math:** verified.
  - `nestedListDoc(N)` puts text at depth `2N+2`. N=15 → 32 ok, N=16 → paragraph at depth 33 fails.
  - `wideDoc(W)` = `1 + 2W` nodes. 2499 → 4999 ok; 2500 → 5001 fail.
  - Exact-5000 / 5001 builders correct (`doc + 4999/5000 empty paragraphs`).
  - Mark counter-placement (6×200) triggers at 1001st mark on 6th paragraph; reason `/max mark/`, not `/max node/`.
- **Error contract:** cap errors emit `rich_content.disallowed_node` with no `fields_code` → wrappers fall through `?? 'disallowed_node'`. ADR-0012 enum honored.
- **Perf assertion realism:** 10k-depth aborts after ~33 frames; dominant cost is builder allocation (~30k tiny objects); 500ms cap is wide.
- **Service-layer impact:** sanitizer return shape unchanged; 422 path identical to pre-#24.
- **All 4 surfaces** have caps populated; `Readonly<Record<Surface, ...>>` typecheck guarantees no omission.
- **Read-side / audit / idempotency:** no consumers of sanitizer error shape changed.

No follow-ups needed beyond cycle-1.

## Ready for merge.
