# Chunk 6 Deviations

## C6.1

### D-C6.1-1: Test body omits `description_rich_content: null`

**Found during:** GREEN phase typecheck.

**Issue:** `EditDescriptionRequest` (`editDescriptionRequestSchema`) marks `description_rich_content` as `tipTapDocSchema.optional()` — `null` is not a valid value. The initial test fixture used `null` which caused `TS2322`.

**Fix:** Removed the field from the test fixture entirely (using `undefined` via omission). The test still exercises the PATCH path via `title` alone, which is a valid `EditDescriptionRequest`.

**Files modified:** `apps/frontend/src/features/voc/hooks/__tests__/useVocEditDescriptionMutation.test.ts`

**Commit:** c3b521f (folded into GREEN commit)

---

## C6.2

### D-C6.2-1: react-hook-form isDirty requires render-scope destructuring

**Found during:** GREEN phase test implementation.

**Issue:** Accessing `form.formState.isDirty` only inside `handleCancel` (a callback) creates a stale closure — react-hook-form's proxy-based `formState` only subscribes the component to re-renders when the property is accessed in the render path.

**Fix:** Destructured `const { isDirty } = form.formState` at component render scope so RHF subscribes. `handleCancel` then reads the closure-captured `isDirty` which is always fresh after re-render.

**Files modified:** `EditDescriptionModal.tsx`

**Commit:** 2858ca1

---

### D-C6.2-2: Added @testing-library/user-event to frontend devDependencies

**Found during:** GREEN phase — `fireEvent.change` does not produce reliable isDirty detection in react-hook-form. `userEvent.clear + userEvent.type` fire realistic keyboard events that properly trigger RHF change tracking.

**Fix:** Added `@testing-library/user-event ^14.6.1` to `apps/frontend/package.json` devDependencies.

**Files modified:** `apps/frontend/package.json`, `pnpm-lock.yaml`

**Commit:** 2858ca1

---

### D-C6.2-3: Pre-existing lint error in AttachmentDropzone (role="button" on div)

**Found during:** biome check after GREEN.

**Issue:** `AttachmentDropzone.tsx` already had `lint/a11y/useSemanticElements` error for `role="button"` on a `Card` (div). This was present before C6.2.

**Fix:** Not fixed — out of scope per SCOPE BOUNDARY rule. Logged here for tracking.

**Files affected (not C6.2 introduced):** `apps/frontend/src/features/voc/components/create/AttachmentDropzone.tsx`

---

### D-C6.2-4: DirtyConfirmation uses @radix-ui/react-dialog role="dialog" (not alertdialog)

**Found during:** Test debugging — `screen.getByRole('alertdialog')` failed because `@fops/ui`'s `AlertDialog` is built on `@radix-ui/react-dialog` which renders `role="dialog"`. Tests updated to query by title text instead.

**Files modified:** `EditDescriptionModal.test.tsx`

**Commit:** 2858ca1

---

---

## C6.3

### D-C6.3-1: stale_write/permission.denied integration tests use TriagePanel directly (not VocTriageScreen)

**Found during:** GREEN phase — integration tests for stale_write and permission.denied re-insert path.

**Issue:** `VocTriageScreen` auto-advances the selected VOC after optimistic remove. By the time the 409 error fires, `vocIdRef.current` in `TriagePanel` has advanced to the new auto-selected VOC's ID. The `onError` callback then calls `onOptimisticRestore(newVocId)` instead of the original ID — a no-op that does not re-insert the VOC that was removed.

**Fix:** Tests 2 and 3 in `voc-triage-flow.integration.test.tsx` render `TriagePanel` directly (bypassing `VocTriageScreen`'s auto-advance) to verify the restore callback fires correctly at the component level.

**Deferred:** The vocIdRef drift in `VocTriageScreen` flow is a correctness gap tracked as **C6.4** follow-up. The restore path works correctly when `TriagePanel` renders with a stable `voc` prop (as in the unit tests in `TriageActions.mutation.test.tsx`).

**Files modified:** `apps/frontend/src/features/voc/__tests__/integration/voc-triage-flow.integration.test.tsx`

---

### D-C6.3-2: Pixel-diff baselines deferred to running-environment capture

**Found during:** C6.3 execution — no PostgreSQL/backend running in this agent environment.

**Issue:** CP2 pixel-diff baselines (`voc-triage-console.png`, `voc-detail-composer.png`) require a full-stack running environment (frontend dev server + seeded DB + mock auth).

**Fix:** Capture instructions committed to `.review/baselines/CAPTURE-INSTRUCTIONS.md`. PNG files to be captured manually by the user before PR merge.

**Files created:** `.review/baselines/CAPTURE-INSTRUCTIONS.md`

---

---

## REV-1 Cluster B Fixes (#6, #7, #8, #9)

### D-REV1-6: VocDetailPanel close intercepted via FullDetailView extraction

**Origin:** Codex REV-1 finding #6.

**Found during:** REV-1 Cluster B execution.

**Issue:** DetailHeader `onClose` in `VocDetailPanel` bypassed `DirtyConfirmation` entirely — `ComposerSection` had no mechanism to report dirty state to the panel's close handler.

**Fix:** Extracted `FullDetailView` from `VocDetailPanel` to own dirty state. Added `onDirtyChange` prop to `ComposerSection`; when any composer becomes dirty, the panel intercepts close and shows `DirtyConfirmation` before calling `onClose`. The existing `ComposerSection.onCloseRequest` path is preserved for the section's own close button.

**Files modified:** `VocDetailPanel.tsx`, `ComposerSection.tsx`

**Commits:** 5ab38f0

---

### D-REV1-7: Composer drafts now survive tab switches via keep-mounted pattern

**Origin:** Codex REV-1 finding #7.

**Found during:** REV-1 Cluster B execution.

**Issue:** All three composers unmounted on tab switch — `useComposerDraft` was created but unused; draft content was lost on every tab change.

**Fix:** All three composer bodies are kept mounted (CSS `display: none` for inactive ones). `useComposerDraft` upgraded from `string` to `TipTapDoc | null`. Each composer accepts `draftDoc` + `onDraftChange` as controlled props; when provided by `ComposerSection`, local state is bypassed. On VOC switch `clearAll()` is called by the draft hook's built-in ref check.

**Files modified:** `useComposerDraft.ts`, `ComposerSection.tsx`, `PublicUpdateComposer.tsx`, `ReporterReplyComposer.tsx`, `InternalCommentComposer.tsx`

**Commits:** 5ab38f0

---

### D-REV1-8: EditDescriptionModal stale_write now invalidates query

**Origin:** Codex REV-1 finding #8.

**Found during:** REV-1 Cluster B execution.

**Issue:** `conflict.stale_write` only toasted; the modal's `voc.updated_at` (If-Match baseline) stayed stale, causing retry loops.

**Fix:** On `conflict.stale_write`, call `queryClient.invalidateQueries({ queryKey: ['voc', voc.id] })`. The existing `useEffect` keyed on `[voc.id, voc.updated_at]` then re-populates form defaults from the refreshed VOC envelope on the next render. Toast message changed to "VOC가 변경되었습니다. 새로 불러왔습니다. 다시 시도해 주세요." to communicate the refresh to the user. Modal stays open with user's edits preserved.

**Files modified:** `EditDescriptionModal.tsx`

**Commits:** 83eb220

---

### D-REV1-9: TriageRoute capability gate via role_level check

**Origin:** Codex REV-1 finding #9.

**Found during:** REV-1 Cluster B execution.

**Issue:** TriageRoute rendered the queue for all actors including `user` (Reporter) role who never have `voc.triage` capability.

**Fix:** Added `useMe()` call in `TriageRoute`. Actors with `role_level === 'user'` receive `<PermissionBlockedPanel state="blocked_not_requestable">` instead of the queue. Admin and Developer roles pass through. The check is a UX gate — backend remains authoritative per AGENTS.md rule.

**Files modified:** `TriageRoute.tsx`

**Commits:** b8a0e8e

---

### D-C6.1-2: Pre-existing typecheck errors from C4.1 RED tests

**Found during:** `pnpm typecheck` after GREEN.

**Issue:** Two files from the C4.1 parallel wave (`ReporterStatusChangeBlock.test.tsx` line 67/68/178, `useReporterStatusTransitions.test.ts` line 58`) have TypeScript errors because those files are C4.1 RED tests — their implementation files do not exist yet. These errors were present before C6.1 started.

**Fix:** Out of scope for C6.1. No C6.1 files have typecheck errors. The errors will be resolved when C4.1 ships its GREEN commit.

**Files affected (not C6.1 scope):**
- `apps/frontend/src/features/voc/components/detail/__tests__/ReporterStatusChangeBlock.test.tsx`
- `apps/frontend/src/features/voc/hooks/__tests__/useReporterStatusTransitions.test.ts`

---

## REV-1 (codex Cycle 1) — C6.3 follow-up: VocTriageScreen integration test

**Origin:** codex REV-1 finding #5 explicitly asked for a real `VocTriageScreen` integration test, not a `TriagePanel`-direct one (the original C6.3 stale_write/permission tests bypassed `VocTriageScreen`, exactly where the restore-id bug lived).

**Added:** `apps/frontend/src/features/voc/components/triage/__tests__/VocTriageScreen.errorRollback.test.tsx`.

Both tests render the full `VocTriageScreen`, click confirm on VOC_A, wait for the auto-advance to VOC_B, then release a deferred PATCH error (409 stale_write / 403 permission.denied). They assert that VOC_A reappears in the queue and VOC_B remains — the failure mode that the prior C6.3 tests could not catch.

For the production-code fix detail (closure over `input.vocId` instead of `vocIdRef.current`), see `.review/CHUNK-3-DEVIATIONS.md` → `D-REV1-#5`.
