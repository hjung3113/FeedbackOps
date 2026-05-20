# Implementation Review — Slice 3 #18 FE Prologue (Opus cycle 2)

Reviewed at HEAD `4012132` vs base `develop@e6577eb`. Cycle 1 (codex) findings are all addressed in code; verification below + 6 new findings cycle 1 missed.

## Cycle 1 reinforcement audit

| ID | Status | Note |
|---|---|---|
| P1-1 | CONFIRM | `tokens.css:9-58` declares all color tokens as R G B triples. `tailwind.preset.ts:16-91` maps every color key to `rgb(var(--X) / <alpha-value>)`, so `bg-severity-high/15` now composes alpha correctly. `--surface-sidebar`/`--surface-row-hover`/`--surface-row-selected`/`--severity-high` are own tokens, not aliases. |
| P1-2 | CONFIRM | `token-fidelity.fixture.ts:53,55,56,60,61,94` now classify those colors as `{ hex, rgb }` (not raw). `token-fidelity.test.ts:45-57` adds the explicit invariant: no color-valued token may be stored as raw `#RRGGBB`. |
| P1-3 | PARTIAL | `combobox.tsx` adds `aria-controls`, `aria-activedescendant`, Arrow/Enter/Escape/Home/End on the search input. ARIA shape is acceptable. But: no `disabled` prop (consumers can't disable), no `onKeyDown` on the trigger (Arrow keys on trigger don't open popover — only Enter/Space do), and `biome.json:31-44` blanket-disables 5 a11y rules for this file rather than tightening the impl. See new finding C2-N1. |
| P2-1 | CONFIRM | `useIdempotencyKey.ts:28-36` holds `{ etag, key }` in a single ref and re-derives synchronously during render when `ifMatchEtag` changes. Returned `ref.current.key` is fresh on the same render the new etag lands. |
| P2-2 | CONFIRM | `client.ts:21` `MUTATION_METHODS = {POST, PATCH, DELETE}` — PUT removed. Comment at `:19` documents the contract. |
| P2-3 | PARTIAL | `dev-rich-editor.tsx:101-125` adds two buttons that feed fake `rich_content.disallowed_node` and `conflict.stale_write` envelopes through `errorMapper` → `toast`. The editor's actual `doc` state is NOT consumed by the demo — buttons fire fixed envelopes. The end-to-end editor→sanitizer→toast loop still cannot be exercised here; only the toast-mapping segment can. Acceptable as a smoke harness; real wiring lands in #19. |
| P3-1 | PARTIAL | `biome.json:28-44` adds a per-file override that disables 5 a11y rules for `combobox.tsx` (`useSemanticElements`, `noAutofocus`, `useFocusableInteractive`, `noNoninteractiveElementToInteractiveRole`, `useKeyWithClickEvents`). This silences the lint output but does not fix the underlying patterns. Other diagnostics on `RichContentRenderer.tsx:55` (dangerouslySetInnerHTML) and various non-null assertions/unused imports were either resolved or remain — branch-level lint is now reported "clean on #18 files" per the prompt; spot-check confirms no new errors in #18 files outside this override. |

## New findings (cycle 2)

### Severity summary
P0: 0 · P1: 1 · P2: 3 · P3: 2

### Findings

#### P1-A — Combobox has no `disabled` prop, and the trigger is keyboard-incomplete
**File:line:** `packages/ui/src/components/shadcn/combobox.tsx:32-39` (`ComboboxProps`), `packages/ui/src/components/shadcn/combobox.tsx:126-142` (trigger).
**Issue:**
1. `ComboboxProps` exposes no `disabled` prop. The trigger button accepts no extra props either, so consumers cannot mark an `OwnerPicker` / `AnalyticsAreaPicker` as read-only or disabled in #19/#20.
2. The trigger button has no `onKeyDown`. Per WAI-ARIA combobox pattern, ArrowDown on a closed combobox trigger should open the popover and focus the first option. Today, the trigger only opens on click/Enter/Space (Radix default); Arrow keys on the trigger are dead.
3. There is no test for two `<Combobox/>` on the same page — `React.useId()` for `listboxId` + `optionIdPrefix` should make IDs unique, but no test guards against future refactors that could collide them.
**Why it matters:** This is the foundation primitive for every picker in #19/#20. Missing `disabled` is a copy-paste hazard the moment any picker needs a read-only state (e.g. ManagedSystem locked post-triage). The trigger keyboard gap will show up as a screen-reader bug report when a real user reaches it.
**Suggested fix:** Add `disabled?: boolean` to `ComboboxProps`, propagate to the trigger button's `disabled` attribute; add `onKeyDown` to the trigger that opens the popover on ArrowDown/ArrowUp; add a two-instance test for ID uniqueness.

#### P2-A — `biome.json` per-file a11y override masks rules instead of satisfying them
**File:line:** `biome.json:28-44`.
**Issue:** The override disables `useSemanticElements`, `noAutofocus`, `useFocusableInteractive`, `noNoninteractiveElementToInteractiveRole`, `useKeyWithClickEvents` globally for `combobox.tsx`. Most of these are now actually satisfied by the impl (the listbox is a real listbox, options have `role="option"` with click + keyboard, keyboard handler exists on the search input). The only genuinely justified suppression is `noAutofocus` (search input autofocus is the documented UX). Blanket-disabling 5 rules normalises a "just turn it off" pattern for every future primitive that touches a11y rules.
**Why it matters:** This is the prologue. Every shadcn primitive added in later slices will copy the pattern and degrade lint hygiene irreversibly.
**Suggested fix:** Remove the override; add inline `biome-ignore` comments only on the specific lines that need them (search-input autofocus + the listbox `<ul role="listbox">` if `useSemanticElements` fires there), each with a justifying reason.

#### P2-B — `/vocs` search schema uses `.passthrough()` — unknown query keys leak through into `<Link search={...}>`
**File:line:** `apps/frontend/src/routes/_authed/vocs.tsx:11-22`.
**Issue:** `vocSearchSchema.passthrough()` accepts arbitrary unknown query keys (e.g. `?foo=bar&filter.severity=high`). The validator's intent (comment line 20) is to allow `filter.*` keys for #20, but `.passthrough()` is the loosest possible escape hatch — anything unknown is preserved. When `<Link to="/vocs" search={{ view: 'inbox' }}>` is built, TanStack Router merges current search by default — passing on whatever junk a previous link carried.
**Why it matters:** Real risk in two directions. (1) Open-redirect / link-poisoning surface: any future param the app starts trusting (e.g. `onload`, `redirectTo`) is silently accepted from an inbound link. (2) Bookmark/share-URL stability: deep links accumulate noise, complicating cache keys and tests in #20.
**Suggested fix:** Replace `.passthrough()` with `.catchall(z.string()).and(z.object({...}))` keyed to a `filter.*` prefix, OR widen the explicit schema with each `filter.*` key as it lands in #20 (strict by default). Add a test that a non-allowlisted key like `?onload=x` is rejected/stripped.

#### P2-C — `RichEditor.surface` is `string`, not a literal union — typos compile silently
**File:line:** `packages/ui/src/rich-content/RichEditor.tsx:16-17`.
**Issue:** `surface: string`. ADR-0011 + plan §C-3 say `surface` is opaque pass-through, but the realistic call-site set is the same 4 values used in `dev-rich-editor.tsx:8` (`voc-description | reporter-reply | public-update | internal-comment`). A typo like `surface="voc_description"` (underscore) compiles and reaches `data-surface` on the host div, where #19's toolbar key-on will not match any branch.
**Why it matters:** A silent "no toolbar" failure in #19/#20 will be diagnosed as a bug in the toolbar wiring instead of a typo at the call site, wasting cycles.
**Suggested fix:** Either narrow the type to a literal union (`'voc-description' | 'reporter-reply' | 'public-update' | 'internal-comment'`) and re-export the union from `@fops/ui`, or add a runtime warning in dev for unknown surfaces. The union-as-type choice is consistent with `RichContentMode` already being a literal type.

#### P3-A — `RichContentRenderer.tsx` stripMentions defeats `useMemo`
**File:line:** `packages/ui/src/rich-content/RichContentRenderer.tsx:32-46`.
**Issue:** `stripMentions(doc)` runs on every render before the `useMemo`. Because `stripMentions` returns a new object each call, the `safe` reference always changes, and the `useMemo([safe])` cache never hits. `generateHTML` (the expensive call) therefore re-runs every render of the renderer. Cycle 1 missed this entirely.
**Why it matters:** For long VOC threads in #20 each conversation message renders a `RichContentRenderer`. Re-running TipTap's `generateHTML` per render will scale poorly. Not a blocker, but the memo is doing nothing.
**Suggested fix:** Move `stripMentions` *inside* `useMemo`, keyed on `[doc, mode]`: `const html = useMemo(() => generateHTML(mode === 'reporter_visible' ? stripMentions(doc) : doc, [...]), [doc, mode])`.

#### P3-B — Test gaps on critical surfaces
**File:line:** `packages/ui/src/rich-content/RichEditor.tsx` (no test); `apps/frontend/src/routes/_authed.tsx` (no test for the non-`UnauthenticatedError` re-throw branch); `apps/frontend/src/lib/layout/AppFrame.tsx:28-42` (slot lifecycle covered by `AppFrame.test.tsx`, but no test for the override-warn path — register A, then B, then unmount B → expect A re-visible).
**Why it matters:** RichEditor is the foundation for every conversation surface in #19/#20; tests today only cover the renderer. The `_authed` non-auth-error branch (network failure during `fetchMe`) re-throws into the router error boundary — but there is no error boundary configured in `__root.tsx`, so a network outage at session probe time renders a blank screen. Worth either testing or documenting the residual behaviour.
**Suggested fix:** Add a smoke test for RichEditor (mount + type + assert `onChange` fired with `{type:'doc'...}`). Add an error boundary to `__root.tsx` or document explicitly that fetchMe network errors show TanStack's default error UI. Add a slot-lifecycle override-and-restore test on `AppFrame`.

## Quality call

Ship after fixes — specifically P1-A (Combobox `disabled` + trigger keyboard) and P2-A (a11y override scoping). Cycle 1 reinforcement is genuine: P1-1, P1-2, P2-1, P2-2 are correctly addressed and the token system is now sound for the first time on this branch. The remaining cycle-1 partials (P1-3, P2-3, P3-1) are acceptable for prologue exit but produce a foreseeable hazard at #19 (Combobox `disabled`) and #20 (passthrough search keys). None of the new findings rise to P0 — but P1-A blocks any picker work that needs a disabled state, which #19 explicitly does for triage-locked managed systems.

## What I did NOT review

- Browser/visual QA (toast positions, focus ring contrast on Pack 17 palette, dark-mode coherence).
- Independent bundle-size measurement and tree-shaking of `dev-rich-editor` from prod builds.
- Each of the 22 shadcn primitives line-by-line against upstream shadcn source.
- Korean copy nuance — read all `errorMapper.ts` strings, found them acceptable and consistent in honorific tone, but a native-speaker copy review is out of scope.
- The 226-test suite was not re-run from scratch; I trusted the supplied pass count.
- ADR-0021 cross-references were spot-checked, not fully audited.
