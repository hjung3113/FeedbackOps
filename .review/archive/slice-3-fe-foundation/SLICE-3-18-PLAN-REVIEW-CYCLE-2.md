# PLAN Review — Slice 3 #18 FE Prologue (Opus cycle 2)

Cycle 2 adversarial review. Plan under review: `.review/SLICE-3-18-PLAN.md` (10 chunks). Cycle 1 raised 2× P0, 6× P1, 3× P2. This review audits reinforcement and hunts NEW gaps.

## Cycle 1 reinforcement audit

| Cycle-1 ID | Status | New plan location | Note |
|---|---|---|---|
| P0-1 Hex/Tailwind opacity | CONFIRM | `.review/SLICE-3-18-PLAN.md:10,53-67,76` | R G B triple format locked, `rgb(var(--…) / <alpha-value>)` preset, fidelity test + checkpoint #1. |
| P0-2 Shell taxonomy violation | CONFIRM | `.review/SLICE-3-18-PLAN.md:14,205-229,233-256` | C4a builds exactly 3 shells in `packages/ui/src/layout/`; AppFrame demoted to `apps/frontend/src/lib/layout/`; explicit "NOT a 4th shell" guard. |
| P1-1 Route mounting undecided | CONFIRM | `.review/SLICE-3-18-PLAN.md:264-276` | `_authed.tsx` layout route locked; admin re-parenting decided (with follow-up clause). |
| P1-2 TipTap workspace placement | CONFIRM | `.review/SLICE-3-18-PLAN.md:104-112,154,170` | TipTap deps moved to `packages/ui` in C1b pre-install for C2; no install in `apps/frontend`. |
| P1-3 Button `loading` prop | CONFIRM | `.review/SLICE-3-18-PLAN.md:12,116,120` | `loading` preserved + `aria-busy` + lucide spinner; failing-first regression test required. |
| P1-4 shadcn list inconsistency | PARTIAL | `.review/SLICE-3-18-PLAN.md:86-89` | Locked to exactly 18, `command` explicitly deferred, `dropdown-menu` added. BUT see new finding P0-A — `Alert`, `HoverCard`, `Drawer/Sheet`, `Combobox`, `Sonner` (toast primitive) are spec-referenced but missing. |
| P1-5 If-Match coupling | CONFIRM | `.review/SLICE-3-18-PLAN.md:186,190` | `useIdempotencyKey(ifMatchEtag?)` re-mints on etag change; test case explicit. |
| P1-6 errorMapper coverage | CONFIRM | `.review/SLICE-3-18-PLAN.md:184,189,196` | `errorMapper.test.ts` iterates `ERROR_CODES` directly; non-empty Korean message asserted. |
| P2-1 C1 too large | CONFIRM | `.review/SLICE-3-18-PLAN.md:5` | Split into C1a / C1b / C1c. |
| P2-2 C3 toast checkpoint missing | CONFIRM | `.review/SLICE-3-18-PLAN.md:199` | Checkpoint 2.5 added with toast tone + Korean copy review. |
| P2-3 Failing-first + token fidelity | CONFIRM | `.review/SLICE-3-18-PLAN.md:66-67,73,120,332` | RED-first locked for both token-fidelity and Button-loading; fidelity gate cross-chunk invariant. |

**Summary:** 10/11 cleanly addressed. Only P1-4 has a residual gap (see P0-A below).

---

## New findings (cycle 2)

### Severity summary
- P0 (blocks execution): 2
- P1 (must fix before PR): 5
- P2 (should fix during chunk): 4
- P3 (nice-to-have / follow-up issue): 3

### Findings

#### P0-A: ADR-0020 still locks dark-only; Pack 17 port introduces light theme without amending ADR-0016 nor reconciling ADR-0020 "Out of scope" clause
**File:line:** `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md` "Out of scope → Light-theme support" + `.review/SLICE-3-18-PLAN.md:30-43`
**Issue:** ADR-0020 explicitly states: "Light-theme support. ADR-0016 dark-only stance still holds. The Samsung-light palette refresh in Pack 17 retunes dark-theme tokens to the new visual identity; it does NOT introduce a light theme." However, `docs/design-prototype/styles.css:10-29` ships unambiguously light values (`--color-pitch-black: #f3f7fe` near-white; `--color-graphite: #fbfdff`; canvas + sidebar both light). The plan calls C0 ADR "Pack 17 Samsung-light supersedes ADR-0016" and treats the swap as routine token re-tuning, but the visual identity is in fact inverted (dark→light). ADR-0020's "Out of scope" clause must be amended in the same chunk, or ADR-0020 will internally contradict ADR-0021 the moment it lands.
**Why it matters:** Reviewers downstream will read ADR-0020 and reject the prologue. Worse, the "dark-only" language in ADR-0020 is what currently grants permission for `text-status-danger`, `text-text-inverse` etc. — a future contributor reading ADR-0020 will assume dark contrast ratios still apply and ship WCAG-failing color choices.
**Suggested fix:** In C0, amend ADR-0020 Out-of-scope section to remove the dark-only sentence and add a cross-reference to ADR-0021. Either (a) add a 3rd file edit to C0 explicitly, or (b) bundle the amendment into ADR-0021 with a "this ADR also updates ADR-0020 §Out-of-scope" note. Plan currently mentions only ADR-0016 supersede; ADR-0020 is silently broken.

#### P0-B: shadcn primitive list still missing Alert, HoverCard, Drawer/Sheet, Combobox, Sonner — spec §3 enumerates all of them
**File:line:** `.review/SLICE-3-18-PLAN.md:86-89` vs `docs/frontend/specs/voc.md:89,90,100,112,156,157,167,172`
**Issue:** Spec §3 explicitly cites shadcn `<Alert>` (Callout + PermissionBlockedPanel §3.7), `<HoverCard>` (EntityHoverPreview §3.7), `<Combobox>` (OwnerPicker §3.3), `<Drawer>` (line 172 "use these directly"), and `<Toast>` from sonner (UndoToast §3.3, line 113). Spec line 172 reads: "`<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Combobox>`, `<Checkbox>`, `<RadioGroup>`, `<Tooltip>`, `<Popover>`, `<Dialog>`, `<Drawer>`, `<Toast>`, `<Skeleton>`. Use these directly — do not re-wrap." The locked 18 omit Alert, HoverCard, Drawer, Combobox. Cycle 1 P1-4 was reinforced for count + DropdownMenu + Command but missed the rest.
**Why it matters:** #19 / #20 / #21 each need Alert (for Callout in TriagePanel error states), HoverCard (entity hover popovers are core to VOC list rows), Drawer (mobile detail-panel drill-in per ADR-0020 line "sidebar drawer < 900px, detail-panel drill-in overlays"), Combobox (OwnerPicker count > 5). If they're not in the prologue, each subsequent slice silently expands the shadcn surface area outside #18's scope — defeating the prologue purpose. Sonner provides `Toast` and the Toaster is already in C3, so `Toast` itself is fine — but `Alert` + `HoverCard` + `Drawer` + `Combobox` are not.
**Suggested fix:** Either expand the locked list to 22 (`alert`, `hover-card`, `sheet` for shadcn Drawer equivalent, plus a `Combobox` composite built from `popover + command` or document deferral). Or explicitly defer Drawer + HoverCard with a P3 follow-up issue. Plan must not silently leave the four out — pick a stance and write it.

#### P1-A: `pnpm --filter @fops/ui test` is a no-op — packages/ui has no vitest, just `echo 'no tests yet' && exit 0`
**File:line:** `packages/ui/package.json:14` + plan references `.review/SLICE-3-18-PLAN.md:74,126,144,171,227`
**Issue:** Current `@fops/ui` `test` script is `echo 'no tests yet' && exit 0`. No vitest config exists in `packages/ui/` (only in `apps/backend`, `apps/frontend`, `packages/shared`). The plan repeatedly invokes `pnpm --filter @fops/ui test` (C1a, C1b, C1c, C2, C4a) expecting it to run `packages/ui/src/styles/__tests__/token-fidelity.test.ts`, `packages/ui/__tests__/shadcn-smoke.test.tsx`, `packages/ui/__tests__/button-loading.test.tsx`, `packages/ui/__tests__/rich-content.test.tsx`, `packages/ui/__tests__/shell-taxonomy.test.tsx`. As written, **all those tests will be invisible** — the script returns 0 without running anything.
**Why it matters:** The token-fidelity gate (cross-chunk invariant line 329 "no chunk merges if token fidelity test fails") is unenforceable until vitest is wired into `@fops/ui`. The failing-first RED-then-GREEN discipline is also moot. Final `pnpm test` via turbo will likewise skip the package.
**Suggested fix:** C1a must add: (a) `packages/ui/vitest.config.ts` with `environment: 'jsdom'` (needed for shadcn-smoke + button-loading + rich-content + shell-taxonomy tests that render DOM); (b) replace `"test": "echo …"` with `"test": "vitest run"`; (c) `pnpm --filter @fops/ui add -D vitest jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react`; (d) verify turbo task graph picks it up. This is a prerequisite for C1a's token-fidelity test to be meaningful.

#### P1-B: existing admin + login routes reference token classes that do not exist (already broken; will become more broken after C1a)
**File:line:** `apps/frontend/src/routes/admin/managed-systems.tsx:90,96,142,185,229,270`, `admin/analytics-areas.tsx:132,170,215,255,308,339` + plan line 340
**Issue:** Admin pages use `text-status-danger` and `border-surface-overlay`. Current `packages/ui/tailwind.preset.ts` exposes `accent-danger` and `surface-overlay` — `status-danger` does not exist. After C1a port, `surface-overlay` also disappears from Pack 17 (`docs/design-prototype/styles.css` has `--surface-popover`, no `--surface-overlay`). Plan line 340 risk states "admin uses semantic tokens → should auto-light-render but verify in C1a checkpoint" — but admin already references undefined classes (silent Tailwind compile-fail → unstyled). After C1a, even the previously-working `surface-overlay` references will silently break.
**Why it matters:** Plan claims Slice 1/2 surfaces "auto re-render via tokens" — they will not. Login + admin will lose all border + error styling on `develop` post-merge. The token swap is not visually pure; it requires concurrent route fixups.
**Suggested fix:** C1a must include an audit step: grep `apps/frontend/src/routes/` for token classnames, build a rename map (`text-status-danger` → `text-accent-danger` or new `text-danger`; `border-surface-overlay` → `border-default` or new mapped name), and apply the rename inside C1a (not deferred). Add to C1a Files list: `apps/frontend/src/routes/admin/*.tsx`, `apps/frontend/src/routes/login.tsx`. Add a test or grep-assertion that no `.tsx` references a class whose Tailwind key is not resolvable.

#### P1-C: `_authed.tsx` layout route — TanStack route generation + auth guard pattern unspecified
**File:line:** `.review/SLICE-3-18-PLAN.md:264-276`
**Issue:** Plan locks `_authed.tsx` as the layout route name and re-parents admin under it. TanStack file-route convention (`@tanstack/router-plugin`) treats `_<name>` as a pathless layout — correct. But the plan does NOT specify:
1. `beforeLoad` auth guard on `_authed` — should it call `fetchMe()` once and `redirect({ to: '/login' })` on `UnauthenticatedError`? Current admin pages each duplicate this guard inline (`managed-systems.tsx:34`). Centralizing in `_authed` is the obvious win, but the plan doesn't say so.
2. File-route relocation mechanics: moving `routes/admin/managed-systems.tsx` to `routes/_authed/admin/managed-systems.tsx` requires updating the existing test files' import paths AND the routeTree.gen.ts regen MAY produce different route IDs (`/admin/managed-systems` → `/_authed/admin/managed-systems`). The path stays `/admin/managed-systems` (underscore prefix is pathless) but `Route.id` changes, breaking any `Link` or `navigate` using `.id` references.
3. `/login` route placement — should it stay at `routes/login.tsx` (current) or move to `routes/(public)/login.tsx`? The plan implies "non-authed routes do NOT use this layout" but file-route resolution requires login to live outside `_authed/` — confirm path.
**Why it matters:** A worker reading the plan can pick any of three valid interpretations. Wrong choice → either admin loses its existing auth guard, or test imports break wholesale, or login accidentally inherits AppFrame.
**Suggested fix:** Plan must specify: (a) `_authed.tsx` includes a single `beforeLoad` that calls `fetchMe()` and redirects on `UnauthenticatedError` — admin per-route guards then deleted; (b) admin route file moves listed explicitly (old path → new path, test file path updates); (c) login stays at `routes/login.tsx` (sibling of `_authed.tsx`, not inside it); (d) explicitly state that `Route.id` references are forbidden — only `to:` path-string navigation.

#### P1-D: shadcn Button + `asChild` + `loading` interaction undefined
**File:line:** `.review/SLICE-3-18-PLAN.md:116,120`
**Issue:** Plan says Button is "shadcn CVA Button" with `loading?` preserved + lucide spinner + `aria-busy`. Standard shadcn Button uses Radix `<Slot>` for `asChild` pass-through (e.g., `<Button asChild><Link>…</Link></Button>`). When `asChild` is true, the wrapper renders the child verbatim — so where does the spinner go? Mounting `<Loader2 />` as a sibling alongside `<Link>` would either inject a second child (breaking Slot's single-child contract) or be silently dropped. Failing-first test as written ("loading=true → disabled attribute + aria-busy") does not cover the `asChild` path. This is a real regression vector since spec §3.2 line 99-100 shows `Button` used with `Tabs.Trigger`-like patterns elsewhere.
**Why it matters:** Either (a) `asChild` quietly breaks when `loading` is true, or (b) the shadcn Button has to fork from upstream to compose Slot + spinner — that fork is permanent maintenance debt.
**Suggested fix:** Plan must state one of: (i) `loading` is incompatible with `asChild` — throw or warn in dev; (ii) when `asChild` + `loading`, the Slot child is wrapped with `aria-busy`/`disabled` proxy props and the spinner replaces children (lossy); (iii) drop `asChild` from this Button — name it differently or only support it without `loading`. Add a second regression test that exercises `<Button asChild loading><Link…>` and asserts the chosen contract.

#### P1-E: errorMapper test doesn't assert tone classification correctness or future-proof against Slice 4+ codes
**File:line:** `.review/SLICE-3-18-PLAN.md:184,189`
**Issue:** Test "iterates ERROR_CODES and asserts non-empty Korean message". Plan §C3 line 184 hardcodes per-prefix tone mapping (auth.*→error, rate_limited.*→warning, etc.). But the test as described does NOT assert: (a) tone ∈ `{error, warning, info}` (typo like `'warn'` slips through); (b) `conflict.stale_write` actually classifies as `warning` with retry action (the only special-case); (c) when a future Slice 4 adds a `entity_link.*` prefix to `ERROR_CODES`, the iteration will still pass with the fallback message — but the test gives no signal that NEW codes need Korean copy review. The test passes silently for unknowns rather than flagging them.
**Why it matters:** This is the test that's supposed to "auto-cover new codes" (plan line 190). It does the opposite: it auto-greenlights new codes with a generic fallback.
**Suggested fix:** Test should: (a) assert `tone` is in literal `{'error','warning','info'}`; (b) assert that for every code where prefix matches a Slice 3 owner (`voc.*`, `rich_content.*`, `attachment.*`, `reporter_facing_status.*`, `conflict.stale_write`, `conflict.triage_already_committed`), the Korean message is NOT the generic fallback string; (c) assert `conflict.stale_write` maps to `{tone: 'warning', action: {…}}` specifically. New Slice 4 codes will then deliberately fail the test until their owner adds copy.

#### P2-A: Token fidelity test does not catch token-name drift or extras
**File:line:** `.review/SLICE-3-18-PLAN.md:67`
**Issue:** Plan says the fidelity test "reads tokens.css, parses R G B values, asserts each matches the fixture's `rgb` field." This catches VALUE drift (someone changes `--color-pitch-black` from `243 247 254` to `255 255 255`). It does NOT catch:
- **Name drift:** rename `--color-pitch-black` → `--color-canvas-bg` — test still passes if fixture's `tokenName` is checked only against itself.
- **Missing tokens:** fixture has 19 entries, tokens.css has 18 (one accidentally deleted) — needs explicit `expect(parsedTokens).toHaveProperty(fixtureName)` for every fixture entry.
- **Extra tokens:** someone adds `--color-frosted-glass` not in fixture — test should fail (closed-world invariant).
- **Non-color tokens:** plan line 65 ports spacing, radius, shadow, layout vars from prototype, but fidelity test only covers 19 color tokens per line 66.
**Why it matters:** Pack 17 contract includes layout (`--toolbar-height: 50px` — ADR-0020 50px rhythm), spacing, radius, shadow. Without fidelity coverage, future edits silently drift these. ADR-0020's 50px contract becomes a comment, not an invariant.
**Suggested fix:** Test should: (a) parse tokens.css with PostCSS or `css-tree` (real parser, not regex) — handle comments, multi-line `:root` blocks; (b) assert set-equality between parsed token names and fixture token names (both directions — no extras, no missing); (c) include non-color tokens (layout, spacing, radius, shadow) in fixture OR add a second test for those. Plan line 67 should explicitly call out closed-world + name + value + non-color coverage.

#### P2-B: Sidebar collapse localStorage write — SSR hydration safety unaddressed
**File:line:** `.review/SLICE-3-18-PLAN.md:242,246`
**Issue:** `AppSidebar` writes `localStorage.appSidebarCollapsed` on toggle. Plan line 246 tests "sidebar collapse toggle writes localStorage". TanStack Router defaults to CSR in this project (no SSR config in `vite.config.ts`), so this is fine *today*. BUT: if read on first render via `useState(() => localStorage.getItem(...))` initializer, vitest jsdom may behave differently than browser — and any future SSR enablement (TanStack Start) would hydration-mismatch the initial sidebar width. Plan does not specify the read pattern.
**Why it matters:** Subtle bug class — sidebar flashes wrong width on hard reload if read happens after first paint.
**Suggested fix:** Plan should specify: read via `useSyncExternalStore` OR initialize state with `() => typeof window !== 'undefined' ? localStorage.getItem(...) === '1' : false`. Add a test for first-paint width matching stored value.

#### P2-C: C2 demo route + C3 errorMapper ordering — sanitizer errors will display raw codes
**File:line:** `.review/SLICE-3-18-PLAN.md:160-163` (C2) vs `184` (C3 lands after)
**Issue:** C2 lands the RichEditor + demo route `/dev-rich-editor` before C3 lands errorMapper. The demo is local-state only per plan line 168 ("no API calls"), so this is OK for the demo route itself. BUT: cycle-1 P2-2 concern was about toast UX — the C2 checkpoint will render the editor but cannot demonstrate how a `rich_content.disallowed_node` error surfaces (no apiClient, no errorMapper). The user at Checkpoint 2 cannot validate the end-to-end UX of "user types disallowed node → sanitizer rejects → toast appears". That validation slips to Checkpoint 2.5 (C3) where no editor exists in the toast playground.
**Why it matters:** Two UX checkpoints validate two halves of one flow. Neither validates the joined whole until #19 lands.
**Suggested fix:** Either (a) move C3 before C2; (b) extend Checkpoint 2.5 to include the editor → sanitizer error → toast flow end-to-end (requires the C2 editor to be reachable when C3 lands — feasible since C3 doesn't touch RichEditor); (c) add a sub-step in C3 to call apiClient with a doctored sanitizer-fail response and toast it, with the editor next to it.

#### P2-D: `useDetailPanelSlot` context API + cross-route persistence undefined
**File:line:** `.review/SLICE-3-18-PLAN.md:243-244`
**Issue:** `DetailPanelSlot` reads a slot registered via `useDetailPanelSlot()` hook. Plan doesn't specify: scope (per-route? per-app?), lifetime (cleared on route change?), multiple registrants (does later registration win, or does it error?), or how `ListShell.detailPanel?` (plan line 211) interacts with this app-level slot. ADR-0020 line 18 says "ListShell owns … optional right detail panel" — so does ListShell render its own detail or hand off to AppFrame's DetailPanelSlot?
**Why it matters:** Two competing detail-panel APIs (shell-internal vs frame-global) will collide in #20 when triage detail + VOC detail both try to mount.
**Suggested fix:** Plan must decide: (a) shells own their detail (ListShell.detailPanel prop receives ReactNode) AND there is no DetailPanelSlot in AppFrame; OR (b) AppFrame owns the global slot and shells forward their detailPanel into it via the hook. Pick one. Document in C4a + C4b.

#### P3-A: lucide-react React 19 compatibility unverified
**File:line:** `.review/SLICE-3-18-PLAN.md:97`
**Issue:** Plan installs `lucide-react` into `packages/ui` (and one already in `apps/frontend@0.469.0`). React 19's peer-dep enforcement is strict. lucide-react 0.469 declares `react@^16 || ^17 || ^18` — it works in practice but pnpm strict-peer mode warns. Plan doesn't address whether pnpm warning is treated as failure in CI.
**Suggested fix:** Add `pnpm install --strict-peer-dependencies=false` note or bump to lucide-react >=0.470 (React 19 explicit support).

#### P3-B: `@tiptap/react` peer-resolution from apps/frontend
**File:line:** `.review/SLICE-3-18-PLAN.md:345`
**Issue:** Plan risk line 345 acknowledges this. Worth elevating: when `apps/frontend` imports `<RichEditor>` from `@fops/ui`, React reconciliation requires only ONE copy of React. With pnpm workspaces + `peerDependencies: react ^19` in both `apps/frontend` and `packages/ui`, this should dedupe — but TipTap's internal ProseMirror has its own React adapter. Plan should add a verification: `pnpm dedupe --check react react-dom @tiptap/react`.

#### P3-C: Playwright MCP checkpoint screenshots — baseline comparison?
**File:line:** `.review/SLICE-3-18-PLAN.md:309`
**Issue:** Final §2 uses Playwright MCP to screenshot routes vs prototype `screen-voc.jsx`. ADR-0020 §3 cites `docs/design-prototype/screenshots/final-baselines/` (28 PNGs + manifest.json) as the canonical visual acceptance set. Plan doesn't reference the baseline manifest at all — final screenshots compare against a JSX file, not the locked baseline PNGs.
**Suggested fix:** Final §2 should screenshot AND compare against the matching `final-baselines/*.png` per `manifest.json`'s `mustSurvive` field. The mustSurvive text (per ADR-0020) is the actual acceptance test.

---

## Quality call

The reinforced plan is **executable with caveats**. Cycle 1's P0/P1 set is well-addressed except P1-4 (shadcn list still missing 4 spec-required primitives — P0-B above). The token-format mechanics (R G B + alpha-value), shell taxonomy, idempotency-If-Match coupling, errorMapper iteration, and route mounting are all properly locked.

Residual P0s before dispatch:
1. **P0-A** — ADR-0020 amendment must be folded into C0 or C1a or the ADRs will contradict each other on light vs dark.
2. **P0-B** — Decide shadcn list: 18 + 4 more (Alert, HoverCard, Drawer/Sheet, Combobox) OR explicit deferral with follow-up issues filed before C1b dispatch.

Residual P1s likely to bite during execution:
- **P1-A** — without vitest config in `packages/ui`, every C1a/C1b/C2/C4a test is invisible. Must be fixed in C1a's first step before the token-fidelity test even has meaning.
- **P1-B** — Slice 1/2 admin routes will visually break post-C1a; plan must include the rename audit in C1a Files list.
- **P1-C** — `_authed.tsx` auth guard + admin relocation mechanics need locking, else the dispatched subagent will pick poorly.
- **P1-D** — `Button asChild loading` interaction must be defined or banned.
- **P1-E** — errorMapper test needs tone-assert + Slice-3-prefix non-fallback assert + closed-world for known prefixes.

The P2s and P3s are polish; they would not block execution but would create cycle-3 review noise.

## What I did NOT review

- Did not run `pnpm install` or any build to verify dep resolution works end-to-end with React 19 + lucide + TipTap 2.
- Did not inspect each of `docs/design-prototype/screen-*.jsx` for prototype↔shell mapping correctness; assumed plan's mapping (inbox/my=ListShell, triage=WorkbenchShell, create=PageShell) matches prototype.
- Did not audit Korean error-copy quality — only iteration mechanics.
- Did not verify `pnpm dedupe` actually dedupes React across `packages/ui` + `apps/frontend`.
- Did not check whether `@tanstack/router-plugin` 1.168.2 supports `_authed.tsx` pathless-layout convention (assumed yes from docs; not verified against installed version).
- Did not check `docs/design-prototype/screenshots/final-baselines/manifest.json` exists or its `mustSurvive` field shape (cited from ADR-0020 only).
- Did not verify Pack 17's "Samsung-light" framing vs ADR-0020's "dark-only retune" beyond the textual contradiction; did not consult HANDOFF.md to resolve which interpretation is authoritative.
