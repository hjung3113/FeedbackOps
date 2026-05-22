# CHUNK-22-C8 — Deviations

Branch: `feature/22-c8-richeditor-attach`
Base: `develop @ 1a5776a` (PR #68).
LOC delta (impl + test): ~430 (slightly above the ~410 target; one extra integration
test case for the not-configured-onAttach path).

## Deviations from PLAN-22 §C8

### 1. Render-prop signature changed (additive; back-compat shim kept)

`RichEditor`'s `toolbar` render-prop changed from `(editor) => ReactNode` to
`(editor, toolbarApi) => ReactNode`, where `toolbarApi.attach(file)` uploads
via the injected `onAttach` and inserts an `attachmentRef` node at the
selection on success. The legacy named export `VocDescriptionToolbar(editor)`
remains callable with one arg (the unused `api` defaults to a rejecting stub)
so `EditDescriptionModal` keeps compiling without touching it. New call sites
use `vocDescriptionToolbar({ onAttachError })`.

### 2. `attachmentRef` extension extended with three optional attrs

The existing TipTap extension only stored `id`. Plan acceptance requires
inserted nodes to carry `{attachment_id, name, size_bytes, mime_type}`. I
added `name`, `size_bytes`, and `mime_type` to `addAttributes` (all default
`null`) and stamped them onto `renderHTML` as `data-attachment-*`. This is
backward-compatible — pre-existing docs that store only `id` still parse,
they just render with the id-only fallback label.

### 3. PublicUpdate now allows Attach (OQ-3 override)

Previous slice-3 #21 doc comment for `PublicUpdateToolbar` said "Attach is
NOT included on this surface (clean public copy policy)". PLAN-22 OQ-3
default is "Attach visible on all four surfaces" and the prompt explicitly
required it. I updated the toolbar to render `AttachButton` when `onAttach`
is wired, and updated its test. The earlier policy is recorded in the file
comment as superseded by PLAN-22 C8.

### 4. Attach hidden (not just disabled) when `onAttach` is omitted

The three detail toolbars accept an optional `onAttach` prop and render the
button only when it is provided (Rule 2: avoid a non-functional control
visible to users). `editor === null` still disables it. Composers in this
PR wire `onAttach` for all three surfaces.

### 5. Existing toolbar tests updated, not duplicated

The slice-3 tests asserted "Attach is disabled" (legacy deferral). Those
assertions are now wrong by construction, so I rewrote each affected case
to assert the new behavior (Rule 1: existing assertion now incorrect for
the new feature). Net test count: `+3` in `InternalCommentToolbar.test.tsx`,
`+1` in `ReporterReplyToolbar.test.tsx`, `+2` in `PublicUpdateToolbar.test.tsx`.

### 6. Idempotency-Key sourcing

The prompt suggested `generateIdempotencyKey()`. The repo's primitive is
`useIdempotencyKey()` (hook) and `uploadAttachment` auto-mints a UUID when
none is passed. Each composer call site lets `uploadAttachment` auto-mint
per-call — uploads are one-shot, not bound to a parent mutation; the
attachment_id later flows into the parent VOC/comment mutation which uses
its own scoped Idempotency-Key. No correctness regression vs the prompt
sketch.

## Out of scope (not touched)

- `RichContentRenderer` and `sanitizeClient` (C9 — landed in PR #68).
- Composer dropzones (C6/C7).
- Backend attachment endpoints (C3/C4 — already shipped).
- The `accept` MIME hint string is left undefined for the AttachButton
  instances — server is authoritative (`attachment.unsupported_type`).

## Verification

- `pnpm --filter @fops/ui test`: 455 passed (40 files).
- `pnpm --filter @fops/frontend test`: 412 passed (105 files).
- `pnpm --filter @fops/ui typecheck`: clean.
- `pnpm --filter @fops/frontend typecheck`: clean.
