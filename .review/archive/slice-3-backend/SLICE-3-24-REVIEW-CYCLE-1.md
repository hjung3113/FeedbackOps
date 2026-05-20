# Slice 3 #24 — Adversarial Review Cycle 1 (codex CLI)

**Diff:** working tree vs `develop` (330 lines, `/tmp/slice3-24-diff.txt`).
**Reviewer:** codex CLI 0.130.0.
**Date:** 2026-05-19.

**0 BLOCKER · 0 MAJOR.** Plan-review BLOCKER (maxMarks bypass) already absorbed pre-impl.

## Findings

| # | Sev | Summary | Disposition |
|---|---|---|---|
| C1-1 | MINOR | `wideDoc(2499)` labeled boundary but only hits 4999 nodes, not exact 5000 inclusive boundary | **Accepted.** Added exact-5000 (ok) + exact-5001 (422) tests. |
| C1-2 | MINOR | Sanitizer caps run post-`JSON.parse`; body-limit is the only pre-parse guard | **Documented as residual risk** in surface-allowlists.ts header. Fastify body limit is the upstream guard; revisit if endpoint volume grows. |
| C1-3 | MINOR | Depth semantics (root=0, leaf≤32 inclusive, reject at 33) — keep comment explicit | **Already present in surface-allowlists.ts header.** No change. |

## Clean on challenged points

- Counters scope per `sanitizeTipTap()` call; no cross-request bleed.
- `markCount` is monotonic across sibling traversal.
- Depth semantics match tests (nestedListDoc N=15 ok, N=16 fail).

## Verify

- 519/519 backend tests live Postgres (+14 from #23 baseline).
- typecheck clean.
