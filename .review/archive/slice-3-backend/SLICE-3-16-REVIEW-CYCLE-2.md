# Slice 3 #16 — Adversarial Review Cycle 2 (Opus subagent)

**Diff:** `develop..HEAD` at commit bca46df (post cycle-1).
**Reviewer:** general-purpose subagent, Opus 4.7, deeper architectural focus.
**Date:** 2026-05-19.

Cycle 1 (codex CLI) items not re-flagged.

## Findings

### Resolved in commit 8b7bf38

| # | Severity | Summary | Resolution |
|---|---|---|---|
| B1 | BLOCKER | Idempotency key replay across different conversation endpoints — hash didn't carry route | `hashRequestBody({...rawBody, vocId, route: 'voc.<endpoint>'})` per route; same key+body across routes now produces distinct hashes → second call hits `lookup` as `mismatch` → 409 `conflict.idempotency_key_reuse` instead of replaying first envelope. Regression test added. |
| B2 | BLOCKER | `updateVocReporterStatus` UPDATE filtered only on `id`, no workspace filter | Function now takes `workspaceId`; UPDATE filters on `id AND workspace_id`. Caller passes `actor.workspace_id`. Defense-in-depth against future regressions that skip the `selectVocForUpdate` pre-lock. |
| M1 | MAJOR | `evaluateReporterStatusGate` invoked on every request including body-only path (no transition) | Gate invocation now guarded by `if (statusWillChange)`. Body-only path no longer triggers gate evaluation. JSDoc clarifies the contract. |
| M3 | MAJOR | `findNodesOfType` unbounded recursion — V8 stack-overflow on deeply nested 50KB TipTap doc | Rewritten as iterative pop-stack walk. No recursion. |
| m1 | MINOR | `publicUpdateCreatedDetailSchema` `.refine` checked raw `skip_reason.length`, drifting from DB CHECK `length(trim(...))` and wire-schema `s.trim().length` | Refine now uses `.trim().length >= 8`. All three layers now agree. |

### Deferred (filed as follow-ups)

| # | Severity | Finding | Why deferred |
|---|---|---|---|
| M2 | MAJOR | Body-only path emits no `reporter_facing_status_changed` audit; envelope carries `before===after` indistinguishable from a no-op without joining `audit_log` | Audit consumers can already distinguish by joining; adding `paired_with: 'none'` requires extending the closed audit schema enum + a fresh migration for any historical interpretation. Filed as **F25**. |
| M4 | MAJOR | Reporter-reply trigger error detected via brittle string-match against the `RAISE EXCEPTION` message; pg `routine` is `exec_stmt_raise`, not the user trigger name | Current matching works for the existing trigger message; fix requires re-issuing the trigger with `USING CONSTRAINT = '...'` (new migration) and matching on `err.constraint` in JS. Filed as **F26**. |
| M5 | MAJOR | Body-only path bypasses transition-table lookup; if seed grows a `received → received forbidden` row, code drifts | Same-state is not a "transition" per the seed-table model. Spec §5 explicitly enumerates body-only as valid. Documented; no change. |
| M6 | MAJOR | Reporter-reply / internal-comment do NOT bump `vocs.updated_at`; envelope ETag stale relative to conversation list. Subsequent `GET` with `If-None-Match` → 304 even though conversation changed | #15 read-service already has TODO for composite ETag once #16 lands. Filed as **F19** (already on backlog); will be addressed when frontend conversation refresh is wired. |
| m2 | MINOR | Mention validation doesn't filter archived/deactivated actors | Filed as **F27** (actor archival semantics not yet specified in this slice). |
| m3 | MINOR | Reporter-reply surface allows `attachmentRef` node but value layer rejects it — dead allowance | Documented in surface-allowlists.ts; spec §5.7 explicitly puts the rule in the value layer until storage slice ships. No change. |
| m5 | MINOR | No test asserts `reporter_facing_status.gate_blocked` → 422 mapping | Slice 6 will exercise this when it wires real gate logic. Filed as **F28**. |
| m6 | MINOR | `setsEqual` over-allocates Sets on hot path | Micro; skip. |

## Verify

- `pnpm -w typecheck` — 6/6.
- `pnpm --filter @fops/backend test` — **448/448 passed** (1 new regression test for B1).
- `pnpm --filter @fops/backend db:migrate` — clean.

## Follow-ups filed

- **F25** — Add `paired_with: 'none'` to `reporterFacingStatusChangedDetailSchema` for body-only audit symmetry.
- **F26** — Replace reporter-reply trigger string-match with constraint-name match (requires `RAISE … USING CONSTRAINT` migration).
- **F27** — Mention validation: filter out archived/deactivated actors.
- **F28** — Test gate_blocked → 422 once Slice 6 wires real gate semantics.
- **F19** — (already filed) composite detail ETag covering conversation rows.

## Net total

Cycle 2 surfaced 14 findings (2 BLOCKER, 6 MAJOR, 6 MINOR); 5 resolved in-issue, 9 deferred with explicit rationale + tracking.
