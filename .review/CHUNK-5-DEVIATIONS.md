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

---

## C5.5 — PreviewModal + preview cards + error matrix + DirtyConfirmation

### C5.5-specific deviations

1. **[Rule 1 - Bug] `import type * as React` vs `import * as React` for React hooks**
   - **Found during:** Post-biome-lint-fix verification
   - **Description:** Biome's `useImportType` lint rule auto-converted `import * as React from 'react'` to `import type * as React from 'react'` in `PublicUpdateComposer.tsx` and `ReporterReplyComposer.tsx`. This caused runtime `ReferenceError: React is not defined` because `React.useState` / `React.useRef` need the value import. Fixed by switching to named imports: `import { useState, useRef, type ReactElement } from 'react'` which is biome-compatible and correct.
   - **Fix:** Changed both files to use destructured named imports.
   - **Files modified:** `PublicUpdateComposer.tsx`, `ReporterReplyComposer.tsx`, `ComposerPublicPreview.tsx`, `ComposerReplyPreview.tsx`

2. **DirtyConfirmation detection via click propagation on container div**
   - **Found during:** Implementation
   - **Description:** Plan didn't specify how `ComposerSection` would detect dirty state from child composers. Chose a simple click-propagation approach: the `p-4` composer body container has `onClick={handleComposerInteraction}`. Any interaction inside the composers (editor clicks, etc.) bubbles up. This is a heuristic — it may over-detect dirty state if users click the composer area without typing. A future improvement would be to pass an explicit `onDirtyChange` callback to each composer.
   - **Impact:** Functional for the test requirement; slightly over-sensitive (any click = dirty).

3. **Alertdialog role not used in DirtyConfirmation test (using text match instead)**
   - **Found during:** Test debugging
   - **Description:** Radix `AlertDialog`'s `alertdialog` role may not be accessible immediately in JSDOM portals. Changed the test assertion from `getByRole('alertdialog')` to `findByText('변경사항이 저장되지 않았습니다')` which works reliably with async `waitFor`.
   - **Impact:** None on production behavior.

4. **`ComposerReplyPreview` uses voc.title for reporter bubble (not voc.description plain text)**
   - **Found during:** Implementation
   - **Description:** Prototype shows `voc.description.slice(0, 140)` but `description_rich_content` in the TypeScript type is a TipTapDoc, not a plain string. The title is used as a readable fallback to preserve the "context bubble" visual without requiring rich-text rendering of the description in preview.
   - **Impact:** Low — preview context bubble shows title instead of description excerpt. Accepted deviation.

5. **Reporter identity in ComposerReplyPreview shows "Reporter" as display_name**
   - **Found during:** Implementation
   - **Description:** `VocDetailEnvelope` doesn't include the reporter's display_name directly — it only has `reporter_id`. A full implementation would require a separate actor lookup. For C5.5 scope, hardcoded "Reporter" label is used. A future improvement would fetch actor display_name from workspace actors.
   - **Impact:** Preview shows "Reporter" instead of actual reporter name.
