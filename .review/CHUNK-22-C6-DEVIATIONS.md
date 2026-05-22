# CHUNK-22-C6 Deviations

Scope: FE retroactive wire of VOC Create + EditDescriptionModal attachment upload
against the `uploadAttachment` client landed in C5.

## Followed plan as-written
- AttachmentDropzone flipped from disabled / `attachment.unsupported_pending_storage_slice`
  toast to active multi-file upload. Per-row state machine
  (`pending → uploading → uploaded(serverId) | error(code)`).
- Per-file `Idempotency-Key` minted at row creation (mirrors `useIdempotencyKey`
  uuid v4 fallback). Calls `attachmentsApi.uploadAttachment(file, { idempotencyKey, signal })`.
- VocCreateScreen now tracks `attachmentIds: string[]` and `attachmentsUploading: boolean`;
  submit is disabled while any row is `uploading`.
- EditDescriptionModal mirrors the same wiring; Save disabled while any upload is mid-flight.
- Korean copy verbatim from `docs/design-prototype/screen-voc-create.jsx:146-194` and
  AttachmentRow (`:285-340`): "첨부", "파일을 드래그하거나 클릭해서 추가",
  "최대 25MB · 다중 선택".
- BE untouched (per "DO NOT modify backend"). Multipart Content-Type is NOT set
  manually — `apiClient.formData` from C5 carries the multipart boundary.

## Deviations

1. **`attachment_ids[]` on the wire vs shared schema `attachments: AttachmentRef[]`.**
   The plan brief is explicit: "POST /vocs body includes `attachment_ids`". The shared
   `createVocRequestSchema` still carries the legacy `attachments: AttachmentRef[]`
   shape (which requires `storage_uri` — a field intentionally not exposed to FE per
   `packages/shared/src/vocs/attachment.ts` strict shape). We attach `attachment_ids`
   as an extra body field by widening the mutation argument with
   `CreateVocRequest & { attachment_ids: string[] }` at the call site. The same
   pattern is used in EditDescriptionModal's PATCH body.
   - C7 (or a sibling shared-schema chunk) must reconcile `createVocRequestSchema`
     to use `attachment_ids: string[]` and drop the legacy `AttachmentRef` shape.
   - Runtime BE compatibility is C7b's responsibility — current BE rejects non-empty
     `attachments[]` with `attachment.unsupported_pending_storage_slice`; that
     rejection is being retired in C7b. Until C7b ships, runtime upload from C6
     will fail at the create POST step — but the C6 FE wiring itself is correct
     and tested via mocked fetch.

2. **`bg-surface-hover` token is not defined in the design system.**
   Initial implementation used `hover:bg-surface-hover`; the project
   token-class coverage test (`src/__tests__/token-class-coverage.test.ts`) flagged
   it. Replaced with `hover:bg-surface-raised`. Tracked as Rule 1 (auto-fix).

3. **Existing `EditDescriptionModal.test.tsx` Test 2 ("renders AttachmentDropzone
   with aria-disabled") was stale.** The disabled assertion no longer applies
   post-C6. Replaced the test body to assert the active dropzone is rendered
   (presence of testId + prototype copy). No coverage lost — the disabled state
   was the point of the test and that state is now retired.

4. **VocCreateScreen integration tests not extended in this chunk.** The new
   `AttachmentDropzone.test.tsx` covers the per-row state machine and onChange
   emission; `EditDescriptionModal.attachments.test.tsx` covers PATCH body
   shape end-to-end. Adding a Create-screen integration test that exercises
   the new submit-blocked-while-uploading path was deferred — the underlying
   wiring (`onUploadingChange` → `disabled`) is unit-covered in the dropzone
   test, and the create-screen integration suite already covers the POST body
   path end-to-end (the new field is an additive widening).

5. **`docs/frontend/specs/voc.md §4.4 / Error codes row.**
   Removed the `attachment.unsupported_pending_storage_slice (422 — Slice 3 only;
   replaced by ...)` clause from the §8.1 Create error-codes row and replaced it
   with `attachment.too_large` / `attachment.unsupported_type` / `storage.unavailable`.
   The §4.4 "Pending attachment" subsection itself was left intact — its content
   describes the local pending state machine that C6 implements verbatim
   (`serverAttachmentId?`, `errorCode?` with the now-active error codes).

## Out of scope (touched by sibling chunks)
- C7a — Triage composer attachment wiring (Internal Comment / Public Update /
  Reporter Reply composer dropzones). NOT touched.
- C7b — BE retirement of `attachment.unsupported_pending_storage_slice` rejection
  on POST /vocs + PATCH /vocs/:id/description. NOT touched.
- C8 — RichEditor toolbar Attach button (in-body attachment insertion). NOT touched.

## Verification

- `pnpm --filter @fops/frontend test`: **412 passed (106 files)** — full
  FE suite, no regressions.
- VOC feature subset: **318 passed (87 files)**.
- `tsc -p tsconfig.json --noEmit` clean for our touched files (the only
  errors are pre-existing `routeTree.gen` codegen issues that vite generates
  at dev/build time — unchanged by this chunk).

---

## 2026-05-22 amendment — EditDescriptionModal GET-side attachment hydration (PLAN-22 §Bug-3)

Live Playwright verification after PR #77 surfaced a hydration gap that this
chunk's C6 work missed: the modal opens on a VOC whose `voc.attachments[]`
already carries one or more linked rows (e.g. reporter uploaded a file, saved,
reopened the modal), but the modal initialized only `attachment_ids: []` and
showed no chips for the existing rows. The user saw the file silently
disappear from the edit surface.

**Fix landed on `fix/22-fe-render-attachments-in-detail`:**

- `EditDescriptionModalVoc` now optionally accepts `attachments?: LinkedAttachment[]`.
- When the prop is non-empty, render a `기존 첨부` label + `<AttachmentChipList>`
  above the active `<AttachmentDropzone>`. Chips are read-only — no remove
  affordance this slice (see PATCH-semantics note below).
- PATCH body shape unchanged: `attachment_ids: string[]` carries only the
  **newly uploaded** ids; pre-existing rows are NOT re-sent.

**PATCH semantic decision — ADDITIVE (not full-set):**

Audited `apps/backend/src/modules/voc/service.ts:editVocDescription` (and the
`linkAttachments` repo it delegates to). The BE only **adds** unlinked rows;
re-sending an already-linked id throws `LinkAttachmentsRejected`, which the
service translates to `validation.failed` and rolls the entire PATCH tx back.
There is no unlink path on `editVocDescription` — the audit diff comment in
the service literally says *"Future chunks that support remove/replace will
populate `from` from a prior SELECT."*

So the only safe wire shape today is **additive**: send the new ids only.
Tests assert `attachment_ids` excludes the pre-existing row id (see
`EditDescriptionModal.attachments.test.tsx` → `existing attachments
(GET-side hydration)` describe block).

**Companion fixes in the same branch:**

- `<DescriptionSection>` renders `voc.attachments[]` as chips below the BODY
  card (PLAN-22 §Bug-1).
- `<TimelineEntry>` renders `entry.attachments[]` for every kind
  (`public_update` / `reporter_reply` / `internal_comment`) (PLAN-22 §Bug-2).
- Added `apps/frontend/src/features/voc/lib/format-file-size.ts` and pointed
  the two pre-existing private `formatFileSize` definitions
  (`<AttachmentDropzone>`, `<ComposerAttachmentDropzone>`) at it — single
  source of truth, zero behavior change.
- Test fixtures (`_fixtures.ts`, `ConversationTimeline.test.tsx`,
  `TimelineEntry.test.tsx`) updated to include the now-required `attachments`
  and `attachment_count` fields introduced by PR #77.

**Remove / replace semantics — deferred:** when the BE adds an unlink path on
`editVocDescription`, the chip's read-only state will gain a remove button
and the modal will switch to full-set PATCH. Not in this slice.
