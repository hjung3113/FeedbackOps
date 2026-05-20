# Chunk 2 Deviations

## Auto-fixed issues (Rule 1)

### [Rule 1 - Bug] TriageRoute.test.tsx broken when TriagePanel gained useWorkspaceActors hook

- **Found during:** Task "implement TriagePanel Chunk 2 with pickers"
- **Issue:** Existing `TriageRoute.test.tsx` (Chunk 1) rendered `<TriagePanel>` without a `QueryClientProvider`, which caused a React crash once `TriagePanel` started calling `useWorkspaceActors` (a tanstack-query hook).
- **Fix:** Added `vi.mock('../../hooks/useWorkspaceActors', ...)` stub to the existing test file, matching the pattern used by other hook mocks in that test.
- **Files modified:** `apps/frontend/src/features/voc/routes/__tests__/TriageRoute.test.tsx`
- **Commit:** cf1aae9

## Intentional stubs (in-scope per PLAN-21)

### AnalyticsAreaPicker options empty (aaOptions: [])

- **Reason:** `useAnalyticsAreas` hook is not in Chunk 2's file list. The `AnalyticsAreaPicker` component is wired (PLAN-21 scope: "AnalyticsAreaPicker (reuse Slice 2 export)") but the AA option list requires a data-fetch hook that will be added in a future chunk or a modification to `useVocDetail`. For now, the picker renders with no options — dirty state will track AA changes if options are provided.
- **Resolution path:** Chunk N wires `useAnalyticsAreas` and passes options through `VocTriageScreen` → `TriagePanel`.

### TriageActions.onConfirm no-op (Chunk 3 scope)

- **Reason:** Explicitly deferred in PLAN-21 Chunk 2 scope: "TriageActions footer — three buttons ... No mutation logic — emits intent callback only."
- **Resolution path:** Chunk 3 wires `useVocTriageMutation` and passes it through `onAct('confirm')`.

## Test count delta

- FE before Chunk 2: 244
- FE after Chunk 2: 263
- Delta: +19 (plan estimated +13 ±5; actual is within ±6 extended tolerance; extra 6 tests cover behavior-driven edge cases: OwnerPicker+5 candidates threshold, disabled buttons, aria-pressed attributes)
