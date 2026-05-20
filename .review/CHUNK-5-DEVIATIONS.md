# Chunk 5 Deviations Log

## C5.1 — Composer orchestrator + tabs + draft hook + visibility

### Pre-existing issues (out-of-scope, logged per deviation Rule 3 / deferred-items)

1. **Pre-existing typecheck failure in `TriageActions.mutation.test.tsx`**
   - **Found during:** C5.1 implementation (typecheck check)
   - **Description:** `TriageActions.mutation.test.tsx` references `onOptimisticRemove` prop on `<TriagePanel>` that doesn't exist in `TriagePanelProps`. This is from partial C3.2 workspace work.
   - **Impact:** Typecheck fails at `@fops/frontend` level. NOT caused by C5.1 changes.
   - **Action:** Logged. Will be resolved when C3.2 is committed and `TriagePanel` props are finalized.

2. **Pre-existing test failures in `VocDetailPanel.test.tsx`**
   - **Found during:** C5.1 verification
   - **Description:** 3 VocDetailPanel tests fail because `DescriptionSection` (modified by C6.2 workspace work) imports `EditDescriptionModal` which calls `useQueryClient()` without a QueryClientProvider in the test setup.
   - **Impact:** 3 tests fail (`happy path`, `renders all 7 section titles`, `renders me.display_name`). These failed BEFORE and AFTER my C5.1 changes (identical failure count).
   - **Action:** Logged. Will be resolved when C6.2 is fully committed or when the VocDetailPanel test file is updated to mock `DescriptionSection`.

### C5.1-specific deviations

1. **`_draft` variable named with underscore prefix to suppress unused-variable warnings**
   - **Found during:** Implementation
   - **Description:** `useComposerDraft` is wired in `ComposerSection` but placeholder bodies don't consume it yet. Named `_draft` to make intent clear.
   - **Impact:** None — intentional C5.1 placeholder pattern per plan spec.

2. **`getDraft` implemented as direct state property access (no `useCallback` closure)**
   - **Found during:** Implementation
   - **Description:** Initial `useCallback` approach for `getDraft` had a stale closure risk. Resolved by returning a direct function reference `(surface) => state[surface]` with `[state]` dependency, which is equivalent and cleaner.
   - **Impact:** None.
