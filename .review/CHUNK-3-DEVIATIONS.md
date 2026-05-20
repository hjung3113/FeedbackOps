# Chunk 3 Deviations

## C3.2

### D-C3.2-1: Added `onError` callback to `useUndoableMutation` (C3.1 primitive)

**Trigger:** Error matrix in TriagePanel requires the actual error object (not just the `state='error'` signal) to dispatch correct error-handling side effects (re-insert VOC, toast copy, lock panel).

**Fix:** Added optional `onError?: (err: unknown) => void` to `UseUndoableMutationOptions`. Called synchronously inside the `catch` block before setting state to `'error'`. All 5 existing C3.1 tests continue to pass — the field is optional.

**Files modified:** `apps/frontend/src/features/voc/hooks/useUndoableMutation.ts`

**Status:** Additive only. No existing behavior changed.

---

### D-C3.2-2: `useVocTriageMutation` exported from its own module rather than using TQ's `useMutation` inside `TriagePanel`

**Trigger:** The original spec called for wiring `useVocTriageMutation` into `TriagePanel`. To avoid double-mutation stacking (TQ's `useMutation` + `useUndoableMutation` managing the same fetch), `TriagePanel` calls `apiClient` directly through `useUndoableMutation`'s `mutationFn`. The `useVocTriageMutation` module exports the `executeCompensatingPatch` helper and `TriageInput`/`TriageSnapshot` types.

**Status:** Both hooks are exported and usable. The architectural decision is TQ-free for the optimistic path to avoid conflicting state machines.

---

## REV-1 (codex Cycle 1) — Cluster A: undo / optimistic / compensation

### D-REV1-#1: pending-undo did not restore the optimistically removed row

**Origin:** codex REV-1 finding #1 (`TriagePanel.tsx:222`).

**Issue:** Clicking 실행 취소 while the PATCH was still in-flight invoked `undoLast()` (which aborted the controller) but never called `onOptimisticRestore` — the row stayed hidden from the queue locally even though the server never committed.

**Fix:** Added `onAbort?: (input: TInput) => void` to `useUndoableMutation`. The hook fires it from `undoLast()` on the pending-abort path, passing the original input. `TriagePanel` wires `onAbort` to `onOptimisticRestoreRef.current?.(input.vocId)`.

**Files modified:** `useUndoableMutation.ts`, `TriagePanel.tsx`.

**RED → GREEN test:** `TriagePanel.undoRestore.test.tsx`.

---

### D-REV1-#2: undoLast branched on stale React state closure

**Origin:** codex REV-1 finding #2 (`useUndoableMutation.ts:102`).

**Issue:** `undoLast` read `state` from the closure. If the request settled between the click and the callback running, the closure still saw `'pending'` and aborted the (already-resolved) controller, skipping compensation even though the server committed.

**Fix:** Added a synchronous `phaseRef` that mirrors `state` and is flipped to `'settled'` inside the `.then()` of the mutation. `undoLast` now branches on `phaseRef.current`, not on `state`.

**Files modified:** `useUndoableMutation.ts`.

**RED → GREEN test:** `useUndoableMutation.race.test.ts`.

---

### D-REV1-#3: snapshot captured staged panelState instead of prior VOC values

**Origin:** codex REV-1 finding #3 (`TriagePanel.tsx:126`).

**Issue:** The snapshot for `compensateFn` captured the staged `panelState.{severity, ownerUserId, ownerTeamId, analyticsAreaId}` — i.e., the NEW values the user picked. After undo, the compensating PATCH wrote those new values back with `triage_state:'untriaged'`, leaving severity/owner/AA permanently mutated.

**Fix:** Snapshot is now taken from `voc.severity / voc.owner_user_id / voc.owner_team_id / voc.analytics_area_id` at the moment confirm fires.

**Files modified:** `TriagePanel.tsx`.

**RED → GREEN test:** `TriagePanel.compensateSnapshot.test.tsx`.

---

### D-REV1-#4: compensating PATCH used a stale If-Match

**Origin:** codex REV-1 finding #4 (`useVocTriageMutation.ts:123`).

**Issue:** The compensating PATCH reused the original `If-Match` (voc.updated_at at confirm time). After the first PATCH committed, that ETag was stale and the compensating PATCH self-failed with `conflict.stale_write`.

**Fix:** `useUndoableMutation.compensateFn` now receives `(snapshot, output)` where `output` is the resolved mutation response. `TriagePanel` reads `output.updated_at` and overrides `snapshot.ifMatch` with that fresh value before calling `executeCompensatingPatch`. The fresh `Idempotency-Key` requirement (D-3.5 / spec §5.3) is preserved.

**Files modified:** `useUndoableMutation.ts`, `TriagePanel.tsx`. Test stubs `useUndoableMutation.test.ts` and `useUndoableMutation.race.test.ts` updated to match the new `(snapshot, output)` signature.

**RED → GREEN test:** `TriagePanel.freshIfMatch.test.tsx`.

---

### D-REV1-#5: error rollback restored the wrong VOC id after auto-advance

**Origin:** codex REV-1 finding #5 (`TriagePanel.tsx:145`).

**Issue:** The `onError` handler read `vocIdRef.current`. `VocTriageScreen` auto-advances the selected VOC after optimistic remove, so by the time the error landed `vocIdRef.current` already pointed at the NEXT row. Restoring that id put the wrong VOC back into the queue.

**Fix:** Removed `vocIdRef` entirely. `useUndoableMutation.onError` is now `(err, input) => void`; `TriagePanel.onError` closes over `input.vocId` so the restore always targets the row that actually failed.

**Files modified:** `useUndoableMutation.ts`, `TriagePanel.tsx`.

**New integration test (codex required):** `VocTriageScreen.errorRollback.test.tsx` — exercises the FULL `VocTriageScreen` (not direct `TriagePanel`), so auto-advance actually happens before the error lands. Both `conflict.stale_write` (409) and `permission.denied` (403) paths verified.

---

## REV-2 (codex Cycle 2) — Cluster A: abort/race safety

### D-REV2-G1: useUndoableMutation per-call isolation; abort-after-settle compensation; preempt-aware second mutate

**Origin:** codex REV-2 findings #1, #2, NEW-1, NEW-2 (`useUndoableMutation.ts:96-113`, `TriageActions.tsx:67,84`).

**Issue (compound):**
- #1 abort-after-settle: `undoLast()` aborted the controller, but the server had already committed. The `.then()` handler's `if (controller.signal.aborted) return` dropped the successful response — local row restored by `onAbort`, server stayed triaged → divergence.
- #2 / NEW-1 second mutate aborts first silently: `mutate()` aborted any prior in-flight call without invoking `onAbort`. The caller's optimistic row stayed removed from the queue.
- NEW-2 preempted call commits server-side: if the preempted call later resolved, no compensation ran — server got triaged, queue locally restored, divergent again.

**Fix:** Each `mutate()` call creates an isolated `Call<TInput, TOutput, TSnapshot>` closure that the `.then`/`.catch` handlers operate on:

1. `mutate()` checks for a prior pending call and, if found, marks it `'preempted'`, aborts its controller, and fires `onAbort(prevInput)` so the caller restores the prior optimistic row.
2. `undoLast()` on a pending call marks the call `'aborted-by-user'`, aborts the controller, fires `onAbort(input)`, detaches `currentCallRef`. The pending promise's `.then`/`.catch` still references the call closure.
3. When the preempted/aborted-by-user call's `.then(output)` runs, it inspects `call.status`. If aborted post-resolution, it runs `compensateFn(snapshot, output)` to reconcile the server back to the snapshot — restoring data convergence.
4. Unmount cleanup is handled separately: the catch path swallows aborts that didn't flip `call.status` (i.e., the consumer is gone, no action needed).

`TriageActions` also disables 'Finding 만들기' / '보류' while `submitting`, removing the easiest pointer path to a silent preemption.

**Files modified:** `apps/frontend/src/features/voc/hooks/useUndoableMutation.ts`, `apps/frontend/src/features/voc/components/triage/TriageActions.tsx`.

**RED → GREEN test:** `apps/frontend/src/features/voc/hooks/__tests__/useUndoableMutation.abortRace.test.ts` — 3 cases: (a) abort-after-settle runs compensateFn with the server output, (b) second mutate fires onAbort with the first input, (c) preempted call resolving later runs compensateFn against the first snapshot/output.


---

## REV-3 (codex Cycle 3) — Cluster X: undo toast token binding

### D-REV3-CX: per-call CallToken binds each UndoToast to its originating call

**Origin:** codex REV-3 P1 (`TriagePanel.tsx:267`, REV-2 #2 partial residual).

**Issue:** `UndoToast.onAction` invoked `undoLastRef.current()`, which reads the latest hook state. After call A settled and a follow-up call B started, the still-visible toast A's button now operated on call B — clicking A's stale toast aborted/undid the unrelated newer call.

**Fix:**
- `useUndoableMutation` mints a monotonic `CallToken` for every `mutate()` invocation and returns it. The token is stored on the per-call `Call` closure.
- `undoLast(callToken?)` accepts an optional token. When provided and the current call's token doesn't match, the call is a no-op (the toast is stale). Omitting the token preserves the legacy "undo the latest" semantics for callers that don't manage tokens.
- `TriagePanel` captures the token returned by `undoableMutate(input)` in both `handleConfirmOrFinding` and `handleSkip`, and the `UndoToast.onAction` closure passes that token to `undoLastRef.current(callToken)`. Stale toasts (issued before a follow-up mutation replaced the current call) now no-op.

**Files modified:** `apps/frontend/src/features/voc/hooks/useUndoableMutation.ts`, `apps/frontend/src/features/voc/components/triage/TriagePanel.tsx`.

**RED → GREEN test:** `apps/frontend/src/features/voc/components/triage/__tests__/TriagePanel.undoTokenBinding.test.tsx` — call A settles, call B starts and stays in-flight, clicking toast A asserts (a) call B's controller is not aborted and (b) `onOptimisticRestore` is not invoked.

---

### D-REV3-CY: empty-body / shape-mismatch compensate refetches the VOC envelope

**Origin:** codex REV-3 P1 (`TriagePanel.tsx:170`, REV-2 #4 still REWORK).

**Issue:** `apiClient` returns `undefined` for an empty 200 response body (`client.ts:64`). The compensate guard checked `output !== null` and then dereferenced `output.updated_at` — `undefined !== null` is true, so the path threw `TypeError: Cannot read properties of undefined`, propagating as an unhandled rejection inside `compensateFn` and leaving the queue and server divergent.

**Fix (option 2 from the directive — most defensive):**
- `compensateFn` now treats both `null` and an `output` lacking a string `updated_at` as "fresh updated_at unknown".
- When fresh `updated_at` is missing it refetches `['voc', vocId]` via `queryClient.refetchQueries({ ..., type: 'all' })` (so the refetch fires even when there's no active observer) and reads the fresh value off the cache. If the cache is empty, it falls back to `fetchQuery` against the same key with the standard `apiClient<…>('GET', /vocs/:id)` queryFn.
- Only when both paths fail does it fall back to the stale baseline; the compensating PATCH may then 409, but it will not throw inside `compensateFn`.
- `TriagePanel` now wires `useQueryClient()`. TriageRoute test files gained a `QueryClientProvider` wrapper to satisfy the new dependency in render.

**Files modified:** `apps/frontend/src/features/voc/components/triage/TriagePanel.tsx`, `apps/frontend/src/features/voc/routes/__tests__/TriageRoute.test.tsx`, `apps/frontend/src/features/voc/routes/__tests__/TriageRoute.capability.test.tsx`.

**RED → GREEN test:** `apps/frontend/src/features/voc/components/triage/__tests__/TriagePanel.emptyBodyCompensate.test.tsx` — first PATCH returns an empty 200 body; the undo path asserts (a) the VOC detail GET fires, (b) the compensating PATCH `If-Match` carries the refetched `updated_at`, (c) no unhandled rejection and `onOptimisticRestore` fires on the success path.
