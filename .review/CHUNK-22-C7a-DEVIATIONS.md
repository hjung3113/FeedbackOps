# PLAN-22 C7a — Deviations

Worktree: `.claude/worktrees/agent-a0a1b7adb9504eb05`
Branch: `feature/22-c7a-fe-triage-composers-attachments`
Base: `origin/develop @ a57eb22`

## Plan vs Implementation

| Plan call-out | Outcome |
| --- | --- |
| Extract `ComposerAttachmentDropzone.tsx` (~80 LOC) | Done as standalone file under `apps/frontend/src/features/voc/components/detail/`. Final size ~290 LOC (mirrors the C6 AttachmentDropzone state machine verbatim — extraction did not actually reduce LOC because the row state machine, upload kickoff, error mapping, and idempotency-key minting are inherent to the contract). Compact variant strips the `Card` chrome + FieldLabel and uses tighter row padding per prototype anchor. |
| Wire 3 composers | Done. Each composer now renders the dropzone directly below the RichEditor body (Public/Reporter) or below the MentionPickerButton (Internal), tracks `attachmentIds` + `attachmentsUploading`, gates Submit on uploading, and ships `attachment_ids: string[]` in the POST body. |
| Hook body type extension | Added `attachment_ids?: string[]` to `PublicUpdateBody` / `InternalCommentBody` / `ReporterReplyBody`. Kept optional so existing call sites (none outside the composers) don't break. |

## D1 — body shape

Per plan: composers send the widened `attachment_ids: string[]` field alongside the legacy `attachments` array (still `[]`). BE schema reconciliation (deprecate `attachments`, validate `attachment_ids`) is C7b's responsibility — not touched here.

## Out-of-scope items (deferred-items, scope boundary)

1. **`tsc -p tsconfig.json` fails on `routeTree.gen` + TanStack Router route-id type errors.** Pre-existing on `develop @ a57eb22` (verified by `git stash && pnpm typecheck`). Not caused by this chunk. The `routeTree.gen` file is generated at dev/build time and absent in a clean install. Tracked for a separate cleanup.
2. **C8 RichEditor `onAttach`** stays untouched. Confirmed in code review: the toolbar Attach button (C8) inserts an inline `attachmentRef` node into the doc; the composer-level dropzone (C7a) collects `attachment_ids` for the POST body. The two are intentionally separate per plan.
3. **`packages/shared/src/vocs/*-request.ts`** schemas not modified (C7b territory). `reporterReplyRequestSchema` still has the legacy `attachments: AttachmentRef[]` field; `internalCommentRequestSchema` has no attachments at all. Wire-shape mismatch will be resolved by C7b.

## Verification run

- `cd apps/frontend && pnpm test -- --run src/features/voc/components/detail/__tests__/{PublicUpdate,InternalComment,ReporterReply}Composer.attachments.test.tsx` → 9/9 pass
- `cd apps/frontend && pnpm test -- --run` → 427/427 pass, 109 test files
- `pnpm typecheck` → fails identically to develop baseline (route-tree generation, pre-existing).

## Commits

1. `9babb56` — `test(slice3 #22 C7a): RED — composer attachment dropzone wiring tests`
2. `694ce31` — `feat(slice3 #22 C7a): GREEN — wire attachment dropzone into 3 Triage composers`
3. (this file) — devnote
