---
paths:
  - "apps/frontend/src/**/*.test.{ts,tsx}"
  - "apps/frontend/src/**/__tests__/**"
  - "apps/frontend/src/test/**"
  - "packages/ui/src/**/*.test.{ts,tsx}"
---

# Frontend test traps (vitest + jsdom)

Each item is an independent, measured trap. Check this list before blaming a selector for "element not found".

## Radix and editor interactions in jsdom

- `TabsTrigger` activates on `fireEvent.mouseDown`, not `click`. An already-selected tab does not fire `onValueChange`; assert the active tab via `aria-selected`.
- `DropdownMenu` opens with neither `mouseDown` nor `pointerDown` in jsdom. Open it with `fireEvent.keyDown(trigger, { key: 'Enter' })`.
- `ChipPicker`, `ManagedSystemPicker`, and `AnalyticsAreaPicker` are single-select `ToggleGroup`s: items are `role="radio"` inside a `radiogroup`, not `role="button"`.
- `DialogContent` renders a built-in sr-only close button named by the Korean `closeLabel` default (overridable per call). Close a dialog with `fireEvent.keyDown(document.body, { key: 'Escape' })`, and target buttons inside a dialog by `data-testid` rather than by name.
- TipTap/ProseMirror accepts no text in jsdom. When a test needs body text, replace `RichEditor` with a textarea stand-in in that file only (`vi.mock('@fops/ui', importOriginal)`).
- jsdom has no `document.execCommand` (stub it) and no `Element.prototype.scrollIntoView` (polyfilled in `apps/frontend/src/test/setup.ts`; without it Radix Select crashes and unmounts the tree).
- `userEvent.setup()` installs its own `navigator.clipboard`. Install a clipboard stub after calling it, via `Object.defineProperty(navigator, 'clipboard', { value, configurable: true })`, and delete it in `afterEach`. `vi.stubGlobal('navigator', …)` does not work in jsdom.
- Tab accessible names include count badges (`Pending 1`); match by prefix (`/^Pending/`).

## Assertions that silently stop protecting anything

- A test that pins a hook's whole return object with `toEqual` breaks when a key is added. That pin is intentional: update the expected value; do not loosen it to `toMatchObject`.
- A double-submit lock test must click twice inside one `await act(async () => { … })`. Two separate `fireEvent.click` calls re-render in between, so the test passes even without the lock.
- react-query `mutate` runs in a microtask. Before asserting that no request was sent, flush with `await act(async () => { await Promise.resolve(); })`, and count only the relevant method (e.g. POSTs).
- A partial `vi.mock('@/lib/api', () => ({ … }))` drops `ApiParseError`, and hooks whose `retry` predicate uses `instanceof ApiParseError` then never settle. Spread the original: `vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal()), … }))`.
- Hooks with `retry: 1` take about 1 s to reach `isError`, beyond the default `findBy` timeout. Use a longer `waitFor` or a no-retry client.
- With `exactOptionalPropertyTypes`, passing an explicit `undefined` to an optional prop is a type error; omit the prop.
- jsdom has no layout engine, so a grid/flex placement regression passes every unit test. Check layout in the visual harness (`apps/frontend/tests/visual/AGENTS.md`).

## Environment

- "No registered route" usually means a stale generated `apps/frontend/src/routeTree.gen.ts` (gitignored). It is missing in a fresh worktree and stale after adding a route or rebasing. Check `grep -c <route symbol> apps/frontend/src/routeTree.gen.ts`; regenerate with `pnpm gen:routes`.
- Run frontend vitest on Node 22 (`.nvmrc`). Newer default Node versions produce false failures from a missing `localStorage`.
- Outside a secure context (http on a non-localhost origin) browsers drop `crypto.randomUUID` and `navigator.clipboard`. Test fallback paths as primary paths (stub `crypto` both with only `getRandomValues` and as `undefined`), copy the backend's validation regex into the test oracle, and branch success messages on the actual result.
