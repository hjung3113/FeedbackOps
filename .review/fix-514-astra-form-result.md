# fix-514-astra-form — results

Bounded TDD repairs for the final PR526 Astra review findings 2, 3, 4
(`.review/final-review-514-astra.md`). Finding 1 (TaskDetailPanel.tsx) is
owned by another worker — untouched. Branch: `feature/514-milestone-domain`.

## Verification against live contract

Every finding was confirmed in source before fixing:

- **F2** — `MilestoneDetailPanel.tsx` `titleMutation` read
  `milestone.updated_at` at mutate time while `startTitleEdit` saved only the
  draft, so a background refetch rebased the unsaved title onto the newer
  version and Save could silently overwrite a concurrent change.
  Contract: PATCH If-Match is "the last seen updated_at"; on mismatch the API
  returns 409 `conflict.stale_write` and does not apply
  (`docs/implementation/api/milestones.md`).
- **F3** — `MilestoneCreatePanel.createMutation` generated
  `crypto.randomUUID()` inside every `mutationFn` invocation, so retrying an
  uncertain create sent a fresh key for the same logical payload: the server
  would create a second row + display id. Contract: same key + same body
  replays the stored response; same key + different body is 409
  `conflict.idempotency_key_reuse` (api/milestones.md).
- **F4** — `MilestonesRoute.tsx` fed the create panel from the
  `includeArchived: true` lookups with `{ id, name }` only, offering archived
  Managed Systems (409 `conflict.parent_archived`), archived areas (409
  `parent_archived`), and areas of another system (422 `out_of_scope`); the
  panel also kept a selected area when the system changed. Directly same bug
  confirmed for the managed-systems create list (archived systems were
  offered). Contract: api/milestones.md Milestone Create validation order.

No contradictions with ADR-0050, the Revision spec (§7), or the B2c/B2e plan
notes found. No copy, layout, or domain-policy changes.

## Fixes

- **F2** (`MilestoneDetailPanel.tsx`) — `startTitleEdit` captures
  `milestone.updated_at` into `titleEditVersion`; the title PATCH submits that
  captured token (mutation variables), never a refetched one. A concurrent
  change now surfaces as 409 `conflict.stale_write`, which keeps the existing
  draft-clearing + refetch reconciliation (title-409 and status-409 branches
  both clear the captured version). The null guard never falls back to the
  latest token.
- **F3** (`MilestoneDetailPanel.tsx`) — the create panel keeps
  `attemptRef { key, payload }`. Resubmitting an identical payload reuses the
  key (server replays the stored response); any field change or a completed
  creation rotates it (success clears the ref; the form unmounts on success).
  Payload equality compares the same deterministically-ordered literal.
- **F4** (`MilestonesRoute.tsx` + `MilestoneDetailPanel.tsx`) — create
  options: systems filtered to `archived_at === null`; areas passed with
  `managed_system_id` + `archived` metadata; the panel offers only active
  areas of the selected system (none before a system is chosen) and clears an
  incompatible area selection when the system changes. Display lookups
  (`analyticsAreaNamesById`, `managedSystemNamesById`) keep the archived
  entries so archived-referenced rows still resolve names.

## RED → GREEN (real failures, not re-runs)

| Fix | RED failure (pre-fix run) | GREEN |
|---|---|---|
| F2 | `expected '2026-07-21T09:45:00.000Z' to be '2026-07-21T08:30:00.000Z'` — Save sent the refetched V2 token | `submits the version captured at edit start, not a newer refetched one` passes |
| F3 | `expected '3727528a-…' to be '73bf0587-…'` — same-payload retry rotated the key | `retries a lost-response create under the same idempotency key and body` passes; `rotates the idempotency key when the resubmitted payload changes` pins rotation |
| F4 | system options `['Select…','Power BI','ERP', …(1)]` — archived 4th offered; area filtering assertions failed | `offers only active systems and only active areas of the selected system` and `clears the area selection when the system changes…` pass. Note: the second RED test failed on its first options assertion before reaching the clear assertion; the clear behavior is exercised by the GREEN run |

New/changed tests:
- `MilestoneDetailPanel.test.tsx` — `MilestoneDetailPanel title edit concurrency (Astra finding 2)` (1 test).
- `MilestonesRoute.edit.test.tsx` — `MilestonesRoute create retry (Astra finding 3)` (2 tests), `MilestonesRoute create options (Astra finding 4)` (2 tests) + F4 fixtures.

## Test/gate runs

- Full frontend unit suite: **176 files / 1104 tests passed** (re-run after the biome format fix).
- `pnpm --filter frontend typecheck`: exit 0.
- `pnpm gate:fe-typecheck`: 0 errors.
- `pnpm gate:fe-lint`: clean (only pre-existing allowlisted `_authed.tsx` notes).

## Limitations

- Lost create response is simulated as a rejected promise from the mocked
  client; no real network severance was exercised (unit harness scope).
- The F4 "clear on system change" RED failure surfaced via the preceding
  options assertion (assertion order), not the clear assertion itself.
- No visual/pixel-diff or backend run: no layout/copy/backend surface touched
  (out of this fix's scope per assignment).
- `useTaskRequestConversion`'s own retry behavior was left as-is; only the
  Milestone create panel changed.
