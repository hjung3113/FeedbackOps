# SLICE-3 #19 — REV cycle 1

**Reviewer:** main orchestrator (Opus self-adversarial)
**Date:** 2026-05-20
**Scope:** C0-C9 deliverables + vite proxy edits

## Methodology

Read end-to-end every new/modified file. Trace runtime sequences for each AC. Look for: race conditions, accessibility regressions, error-path leaks, type-system escape hatches, prop-drilling bugs, dead code, contract drift.

## Findings

### HIGH — H1: Dirty-confirmation modal flash on successful submit

**Location:** `apps/frontend/src/features/voc/routes/CreateRoute.tsx:17-27`, `apps/frontend/src/features/voc/components/create/VocCreateScreen.tsx:60-74`

**Trace:**
1. User submits form. mutation.onSuccess runs synchronously:
2. `form.reset(form.getValues())` — RHF internal isDirty = false (sync).
3. `void navigate({ to: '/vocs', ... })` — TanStack Router queries useBlocker.shouldBlockFn.
4. shouldBlockFn reads `formIsDirty` React state — still **true** (useEffect that syncs from `form.formState.isDirty` runs AFTER render).
5. Blocker fires → DirtyConfirmation modal opens despite successful submit.
6. Subsequent render → useEffect → `setFormIsDirty(false)` (too late).

**Severity:** UX bug. User sees the dirty-confirmation modal flash on a clean submit.

**Fix:** Switched CreateRoute to a ref-based dirty signal. `formIsDirtyRef` is updated synchronously by the screen via the `onDirtyChange` callback. `shouldBlockFn` reads the ref. VocCreateScreen.onSuccess additionally calls `onDirtyChange(false)` BEFORE the navigate intent to ensure the ref is fresh.

### MEDIUM — M1: AttachmentDropzone keyboard a11y semantics

**Location:** `apps/frontend/src/features/voc/components/create/AttachmentDropzone.tsx:55-63`

`role="button"` + `aria-disabled="true"` + `tabIndex={0}` is the WAI-ARIA "focusable but inactive" pattern. Spec mandates "visible but disabled" with a toast as the fallback when users push through. Behavior is intentional and consistent with the spec — left as-is.

### LOW — accepted as-is

- L1: `VocDescriptionToolbar` link button uses native `window.prompt`. Acceptable for Slice 3; modal upgrade tracked elsewhere.
- L2: Inline type assertion `field.value as import('@fops/ui').TipTapDoc`. Cosmetic; left.
- L3: AttachmentDropzone hidden input has a `onChange` handler that no-ops. Dead path; left to avoid future breakage if input is ever surfaced.
- L4: CreateRoute imports `useNavigate` only for handleCancel — no dead import.
- L5: SourceContextSegmented `disabled` prop is never passed from the form yet — kept as forward-compatible surface.

## Outcome

- 1 HIGH fixed inline (see commit below)
- 0 outstanding blockers
- Proceed to REV-2.
