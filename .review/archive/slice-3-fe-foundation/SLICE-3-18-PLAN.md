# Slice 3 #18 — FE Prologue Implementation Plan

**Goal:** Land shadcn baseline + TipTap RichEditor + sonner + Pack-17 light tokens + three route shells (PageShell/ListShell/WorkbenchShell per ADR-0020) + AppFrame + `/vocs` route shell so #19/#20/#21 can build VOC surfaces.

**Architecture:** 10 chunks (C0, C1a, C1b, C1c, C2, C3, C4a, C4b, C5, Final) dispatched sequentially. C1a now starts with prerequisite step 0 (wire Vitest in `@fops/ui`) before any token test work. Each chunk = one Sonnet subagent dispatch with single Goal + narrow file set. Main session orchestrates, integrates between chunks, runs typecheck, dispatches next. 5 checkpoints between chunks (after C1a, C2, C3 toast quick check, C4b+C5 merged, Final).

**Tech Stack:** React 19, TanStack Router 1.170, TipTap 2, shadcn/ui + Radix, Tailwind 3 (NOT v4 — `tailwind.config.ts` stays v3 API), sonner, cmdk, Zod, react-hook-form, lucide-react. CVA + tailwind-merge for variants.

**Locked decisions (2026-05-20 user confirm, updated post-codex review):**
- Q1=A (updated): Pack 17 (Samsung-light) verbatim port. ADR-0016 supersede via new ADR-0021. **R G B triple format** (NOT hex). Tailwind preset uses `rgb(var(--color-X) / <alpha-value>)` syntax to preserve `/15` opacity utilities like `bg-severity-high/15`. DESIGN.md keeps hex notation for human readability. ADR-0021 documents the two-format split. Token fidelity test covers full Pack 17 token surface (colors + layout + spacing + radius + shadows + typography).
- Q2=A: shadcn at `packages/ui/src/components/shadcn/`, re-exported from `packages/ui/src/index.ts`. 22 total — locked (`alert`, `hover-card`, `sheet`, `combobox` added; `command` deferred).
- Q3=A: Existing `Button.tsx` replaced by shadcn CVA Button. variant primary→default alias. 1 caller migrated. `loading` prop PRESERVED (see P1-3 fix).
- Q4=A (updated): 10 chunks + 5 checkpoints (after C1a, C2, C3 toast quick check, C4b+C5 merged, Final).
- ADR-0020 taxonomy enforced: `packages/ui/src/layout/` exports exactly 3 shells (PageShell, ListShell, WorkbenchShell). AppFrame in `apps/frontend/src/lib/layout/` is NOT a 4th shell.
- 2026-05-20: DESIGN.md already updated to Pack 17 light values (this session).

---

## Branch + Setup

```bash
git checkout develop && git pull --ff-only origin develop
git checkout -b feature/18-fe-prologue
```

All commits on `feature/18-fe-prologue`. Push + PR after Final cycle.

---

## C0 — ADR-0021 + token-format prep + branch

**Goal:** Land ADR-0021 (Pack 17 Light System) superseding ADR-0016. Update ADR-0016 frontmatter to `superseded-by: 0021`. Document the R G B vs hex two-format split. No code changes yet.

**Files:**
- Create: `docs/adr/0021-pack-17-samsung-light-design-system.md`
- Modify: `docs/adr/0016-frontend-color-tokens.md` (or whichever ADR locks dark palette — locate first) — add supersede marker.
- Modify: `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md` — remove the "Out of scope → Light-theme support" clause and add a cross-reference to ADR-0021.

**Tasks:**
1. Locate existing dark-palette ADR (likely 0016). `ls docs/adr/ | grep -i color\|token\|design`.
2. Write ADR-0021 with: context (Pack 17 prototype refresh + Samsung-blue accent), decision (verbatim port from `docs/design-prototype/styles.css` to `packages/ui/src/styles/tokens.css` + `semantic.css`; **R G B triple format** in runtime tokens.css for Tailwind `<alpha-value>` composition; hex notation preserved in DESIGN.md and in `token-fidelity.fixture.ts` snapshot for human readability), consequences (Slice 1/2 surfaces auto re-render via tokens, Button variants remapped, focus ring tinted Samsung-blue, `/15` opacity utilities like `bg-severity-high/15` work because tokens use R G B triples).
3. ADR-0021 explicitly calls out the two-format rule: DESIGN.md / fixture = hex; runtime tokens.css = R G B triple.
4. Add `supersedes: 0016` to ADR-0021 frontmatter and `superseded-by: 0021` to ADR-0016.
5. Amend ADR-0020: remove "Out of scope → Light-theme support" because ADR-0021 now owns light-theme support; add "See ADR-0021 for Pack 17 Samsung-light tokens."
6. Commit: `docs(slice3 #18): ADR-0021 Pack 17 Samsung-light supersedes ADR-0016, amends ADR-0020 Out-of-scope`.

**Dispatch:** Haiku subagent (doc-only). 1 file create + 2 file edits.

**Verification:** `git diff` review only.

---

## C1a — Tokens + Tailwind preset + token-fidelity snapshot test

**Goal:** Pack 17 raw tokens live in `packages/ui/src/styles/tokens.css` (R G B triple format), semantic tokens re-derived in `semantic.css`, Tailwind preset exposes them with `<alpha-value>` composition. Token-fidelity snapshot test frozen against `docs/design-prototype/styles.css`.

**Step 0 — Vitest prerequisite (must land before any C1a test):**
```bash
pnpm --filter @fops/ui add -D vitest jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react @types/node postcss
```
- Create: `packages/ui/vitest.config.ts` with `environment: 'jsdom'` and `globals: true`.
- Create: `packages/ui/vitest.setup.ts` importing `@testing-library/jest-dom`.
- Modify: `packages/ui/package.json` — replace `"test": "echo 'no tests yet' && exit 0"` with `"test": "vitest run"`, add `"test:watch": "vitest"`.
- Constraint addendum: wire Vitest in `@fops/ui` before writing any other test file. Verify `pnpm --filter @fops/ui test` exits non-zero on RED by running a placeholder failing test first to prove the runner picks it up.

**Conversion rule:** Each Pack 17 hex from `docs/design-prototype/styles.css` is converted to its R G B triple in `tokens.css`. Rule: `#RRGGBB → R G B` (decimal, space-separated). Examples:
- `#f3f7fe → 243 247 254` (--color-pitch-black)
- `#fbfdff → 251 253 255` (--color-graphite)
- `#1428a0 → 20 40 160` (--color-neon-lime / --color-aether-blue)

Do not enumerate all 19 colors inline — store the full mapping in the fixture (see below) and reference `docs/design-prototype/styles.css` as the single source of truth.

**Files:**
- Create: `packages/ui/vitest.config.ts` — jsdom + globals + React plugin.
- Create: `packages/ui/vitest.setup.ts` — imports `@testing-library/jest-dom`.
- Modify: `packages/ui/package.json` — replace no-op test script with Vitest scripts.
- Rewrite: `packages/ui/src/styles/tokens.css` — verbatim port from `docs/design-prototype/styles.css` (~140 lines, all `--color-*` + layout + spacing + radius + shadow + typography vars). **R G B triple format for all color tokens** so Tailwind `rgb(var(--color-X) / <alpha-value>)` works.
- Rewrite: `packages/ui/src/styles/semantic.css` — re-derive semantic tokens against new raw colors; **remap shadcn HSL CSS vars to R G B triple references** (shadcn HSL vars must NOT inherit defaults — semantic.css rewrites `--background`, `--foreground`, `--primary`, etc. to point at the new R G B vars).
- Rewrite: `packages/ui/tailwind.preset.ts` — kebab-case keys (`surface-canvas`, `text-primary`, `severity-high`, etc.) mapped to `rgb(var(--…) / <alpha-value>)`. Add spacing + radius + boxShadow extends. **Tailwind 3 syntax only** (no `@theme` v4 blocks).
- Create (failing-first RED): `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts` — CSV/JSON map of `{ tokenName, hex?, rgb?, raw? }` for ALL Pack 17 token classes from `docs/design-prototype/styles.css` lines 1-200: colors, surfaces, borders, focus, icon sizes, layout (`--sidebar-width`, `--rail-width`, `--detail-panel-width`, `--toolbar-height`, etc.), spacing scale (`--spacing-*`), radius, shadows, typography sizes/leading/tracking, status/reporter/internal, severity, confidence semantic tokens.
- Create (failing-first RED): `packages/ui/src/styles/__tests__/token-fidelity.test.ts` — parse `tokens.css` with `postcss` (NOT regex), assert set-equality between parsed token names and fixture token names in both directions (fail on missing and extras), then assert value match: R G B triple for color tokens, raw value for non-color tokens. Also asserts every semantic Tailwind key (surface, text, border, status, severity, density, layout) has a corresponding Tailwind theme key resolvable via `resolveConfig`. Test must run RED before the port, then GREEN after.
- Modify/audit: `apps/frontend/src/routes/admin/managed-systems.tsx`, `apps/frontend/src/routes/admin/analytics-areas.tsx`, `apps/frontend/src/routes/login.tsx`, `apps/frontend/src/routes/index.tsx` and any other route file referencing token classes — grep first, build rename map, then apply.
- Create: `apps/frontend/src/__tests__/token-class-coverage.test.ts` — grep/scan `.tsx` class strings and assert no `text|border|bg|ring|fill|stroke` token class references a Tailwind theme key that is not resolvable via `resolveConfig`.
- Modify: `apps/frontend/src/styles.css` — keep `@import "@fops/ui/styles/tokens.css"` + `semantic.css` + tailwind directives.

**Dispatch (Sonnet):**
- Read first: `docs/design-prototype/styles.css`, `packages/ui/src/styles/{tokens,semantic}.css`, `packages/ui/tailwind.preset.ts`.
- Constraint: no shadcn primitives, no Button, no pickers in this chunk.
- Constraint: audit existing route token classes before token port:
  `grep -rn '\(text\|border\|bg\|ring\|fill\|stroke\)-\(status\|surface\|accent\|severity\|reporter\|internal\|confidence\|focus\)-' apps/frontend/src/`
  Known renames: `text-status-danger` → `text-accent-danger` (existing) or new `text-danger`; `border-surface-overlay` → `border-default` because Pack 17 has no `surface-overlay` token and popover owns overlay surfaces.
- Constraint: failing-first discipline — write token-fidelity.test.ts BEFORE porting tokens, run RED, then port.
- Verification: `pnpm --filter @fops/ui typecheck && pnpm --filter @fops/ui test`. Also run the frontend token-class coverage test and confirm no `.tsx` references a class whose Tailwind theme key is unresolved.

**CHECKPOINT 1** — playground HTML: prototype token table vs tokens.css R G B triples side-by-side, Tailwind `/15` opacity swatch matrix. AskUserQuestion: "토큰 R G B 변환 OK? opacity utility 작동 확인?"

**Commit:** `feat(slice3 #18): Pack 17 tokens (R G B) + Tailwind preset + token-fidelity snapshot`

---

## C1b — shadcn baseline + Button loading regression fix

**Goal:** 22 shadcn primitives in `packages/ui/src/components/shadcn/`, Button wholesale-replaced with shadcn CVA Button preserving `loading` prop and `aria-busy` contract. Smoke tests pass.

**shadcn primitive list (22 total — locked):**
`button`, `input`, `textarea`, `label`, `select`, `checkbox`, `radio-group`, `toggle-group`, `card`, `dialog`, `alert-dialog`, `alert`, `tooltip`, `hover-card`, `popover`, `sheet`, `tabs`, `skeleton`, `avatar`, `badge`, `dropdown-menu`, `combobox`.

**Note on `command`:** `cmdk` is installed (tree presence for C3/CommandMenu wiring in a later slice). The full `command` shadcn primitive is **deferred** — do NOT scaffold/export it in C1b. `combobox` uses a command-less pattern: shadcn-style `Popover` + search input + filtered listbox/options, without `Command` parts. Trade-off: enough fidelity for C1b form/search affordances, but full CommandMenu parity remains follow-up work.

**Dependencies install (packages/ui is owner of shadcn primitives):**
```bash
# apps/frontend — app-level deps only
pnpm --filter @fops/frontend add sonner cmdk @tailwindcss/typography

# packages/ui — shadcn primitive deps live here
pnpm --filter @fops/ui add class-variance-authority tailwind-merge clsx lucide-react \
  @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip \
  @radix-ui/react-hover-card @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select \
  @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group \
  @radix-ui/react-avatar @radix-ui/react-slot @radix-ui/react-dropdown-menu
```

**TipTap deps belong in packages/ui (not apps/frontend):**
TipTap React bindings live in `packages/ui` because RichEditor is a shared component. `apps/frontend` gets them transitively via `@fops/ui`.
```bash
# packages/ui (C1b pre-installs for C2)
pnpm --filter @fops/ui add @tiptap/core @tiptap/pm @tiptap/html @tiptap/react \
  @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline \
  @tiptap/extension-placeholder
# apps/frontend does NOT directly install @tiptap/* — consumed via @fops/ui
```

**Files:**
- Create: 22 shadcn primitives in `packages/ui/src/components/shadcn/`: `button.tsx` (re-export Button), `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toggle-group.tsx`, `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `alert.tsx`, `tooltip.tsx`, `hover-card.tsx`, `popover.tsx`, `sheet.tsx`, `tabs.tsx`, `skeleton.tsx`, `avatar.tsx`, `badge.tsx`, `dropdown-menu.tsx`, `combobox.tsx`. Each = standard shadcn CVA/Radix wrapper except `combobox`, which is the command-less Popover + search input + filtered list pattern.
- Rewrite: `packages/ui/src/components/Button.tsx` — shadcn CVA Button. Variants: `default|secondary|destructive|outline|ghost|link`. Keep `primary|subtle` as aliases (primary→default, subtle→ghost). Keep `size: sm|md|lg`. **MUST preserve `loading?: boolean`**: when `loading=true`, button is `disabled`, `aria-busy="true"`, and renders a spinner via lucide-react `<Loader2 className="animate-spin" />` (16px, margin-right-2). `loading` is incompatible with `asChild`: if both are true, throw in dev (`process.env.NODE_ENV !== 'production'`); in prod, render the child without loading affordance and log a warning. Document this trade-off in a short `Button.tsx` code comment.
- Modify: `packages/ui/src/index.ts` — re-export 22 shadcn primitives + cn + Button (now shadcn) + existing pickers.
- Modify: `apps/frontend/src/features/admin/permissions/request-access-button.tsx:115` — `variant="primary"` → `variant="default"` (or leave with primary alias).
- Create: `packages/ui/__tests__/shadcn-smoke.test.tsx` — render each of the 22 primitives once asserting no throw.
- Create: `packages/ui/__tests__/button-loading.test.tsx` — regression tests: `<Button loading>` → disabled + `aria-busy` + spinner; `<Button asChild><Link>…</Link></Button>` without loading → renders Link with no spinner; `<Button asChild loading>` → dev throws or logs warning, prod renders Link without spinner. Must run RED before the Button rewrite (write failing test first), then GREEN.

**Dispatch (Sonnet):**
- Read first: `packages/ui/src/components/Button.tsx` (current `loading` + `aria-busy` contract must survive), `packages/ui/src/index.ts`.
- Constraint: no TipTap, no pickers, no AppShell, no route changes.
- Constraint: failing-first for Button loading test — write test before rewrite.
- Verification: `pnpm --filter @fops/ui typecheck && pnpm --filter @fops/ui test && pnpm --filter @fops/frontend typecheck`.

**Commit:** `feat(slice3 #18): 22 shadcn primitives + Button CVA with loading regression fix`

---

## C1c — Picker rebuild + caller migration

**Goal:** `ManagedSystemPicker` and `AnalyticsAreaPicker` rebuilt on shadcn ToggleGroup. Existing picker test passes. 1 caller migrated.

**Files:**
- Rewrite: `packages/ui/src/components/ManagedSystemPicker.tsx` — replace native `<select>` with shadcn ToggleGroup (chip style per spec §3.4) keeping `PickerOption[]` + `onChange(value: string|null)` dumb-prop contract.
- Rewrite: `packages/ui/src/components/AnalyticsAreaPicker.tsx` — same pattern.
- (existing) `apps/frontend/src/components-test-pickers.test.tsx` — must pass unchanged.

**Dispatch (Sonnet):**
- Read first: `packages/ui/src/components/{ManagedSystemPicker,AnalyticsAreaPicker}.tsx`, `apps/frontend/src/components-test-pickers.test.tsx`, `docs/frontend/specs/voc.md` §3.4.
- Constraint: dumb-prop contract (`PickerOption[]`, `onChange(string|null)`) must survive intact.
- Verification: `pnpm test` (picker test must still pass).

**Commit:** `feat(slice3 #18): ManagedSystemPicker + AnalyticsAreaPicker on ToggleGroup`

---

## C2 — TipTap RichEditor + RichContentRenderer

**Goal:** `<RichEditor>` + `<RichContentRenderer>` + 2 custom extensions land in `packages/ui/src/rich-content/`. Demo route renders editor in `voc-description` surface. Renderer mode strips mentions for reporter_visible.

**Note on deps:** TipTap packages were installed in C1b (`@tiptap/core`, `@tiptap/pm`, `@tiptap/html`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-underline`, `@tiptap/extension-placeholder` — all in `packages/ui`). No new installs needed in C2.

**Files:**
- Create: `packages/ui/src/rich-content/extensions/attachmentRef.ts` — TipTap Node `{ name: 'attachmentRef', group: 'block', attrs: { id, name, sizeBytes, mimeType }, parseHTML/renderHTML/addNodeView }`.
- Create: `packages/ui/src/rich-content/extensions/mention.ts` — TipTap Node `{ name: 'mention', group: 'inline', inline: true, attrs: { actor_id, label } }`.
- Create: `packages/ui/src/rich-content/RichEditor.tsx` — props `{ surface: string, value?, defaultValue?, onChange, placeholder?, disabled?, minHeight?, toolbar?: ReactNode }`. Extensions: `StarterKit.configure({ image: false })` + Link + Underline + Placeholder + attachmentRef + mention. Returns editor instance via render-prop for toolbar.
- Create: `packages/ui/src/rich-content/RichContentRenderer.tsx` — props `{ doc: TipTapDoc, mode: 'reporter_visible'|'internal' }`. Uses `generateHTML` from `@tiptap/html` with same extension set. `reporter_visible` strips mention nodes pre-render.
- Modify: `packages/ui/src/index.ts` — export RichEditor, RichContentRenderer, attachmentRef, mention, types.
- Create: `apps/frontend/src/routes/dev-rich-editor.tsx` — temporary demo route (keep behind `import.meta.env.DEV` guard or delete in Final). Renders RichEditor + RichContentRenderer side by side, with surface picker + mode toggle.
- Create: `packages/ui/__tests__/rich-content.test.tsx` — controlled value round-trips through onChange; reporter_visible strips mentions; internal preserves; attachmentRef + mention attrs round-trip TipTap doc → HTML → TipTap doc.

**Dispatch (Sonnet):**
- Read first: `docs/design-prototype/rich-editor.jsx` (toolbar baseline), `docs/adr/0011-*.md`, `apps/backend/src/lib/rich-content/sanitizer.ts` (BE wire shape).
- Constraint: surface allowlist NOT enforced client-side — opaque pass-through to feature-supplied toolbar config.
- Constraint: editor must NOT register Image extension (StarterKit image: false).
- Constraint: no API calls. Demo route uses local state only.
- Constraint: `@tiptap/react` lives in `packages/ui` — do NOT install it in `apps/frontend`.
- Constraint: keep `apps/frontend/src/routes/dev-rich-editor.tsx` available after C2 so C3 can validate sanitizer-fail toast flow against the demo route; C5 may delete it only if no later checkpoint needs it.
- Verification: `pnpm --filter @fops/ui test`, `pnpm --filter @fops/frontend dev`, manual visit `/dev-rich-editor`, `pnpm dedupe --check react react-dom @tiptap/react @tiptap/pm`.

**CHECKPOINT 2** — playground HTML: RichEditor surface toggle (4 surfaces), mode toggle, mention/attachment node demo, prototype rich-editor.jsx screenshot side-by-side. AskUserQuestion: "에디터 UX prototype 일치?"

**Commit:** `feat(slice3 #18): TipTap RichEditor + RichContentRenderer + attachmentRef + mention extensions`

---

## C3 — sonner Toaster + apiClient + errorMapper + idempotency hook

**Goal:** `<Toaster>` mounted in `__root.tsx`. `apiClient`, `errorMapper`, `useIdempotencyKey` land in `apps/frontend/src/lib/api/`. ALL codes in `ERROR_CODES` from `@fops/shared` covered with Korean copy and tone classification.

**Files:**
- Create: `apps/frontend/src/lib/api/errorMapper.ts` — maps `{ code, detail }` to `{ tone: 'error'|'warning'|'info', message: string, action?: { label, run } }`. **Catalog is generated by iterating `ERROR_CODES` from `@fops/shared`** — no manually typed list. Every code must map to a non-empty Korean message. Export `GENERIC_ERROR_MESSAGE = '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'` so tests compare to the fallback constant directly. Fallback for unknown codes: `{ tone: 'error', message: GENERIC_ERROR_MESSAGE }`. Tone per category: `auth.*` → `error`, `permission.*` → `error`, `rate_limited.*` → `warning`, `validation.*` → `error`, `conflict.*` → `error` (except `conflict.stale_write` → `warning` with retry action), `not_found.*` → `error`, `internal.*` → `error`, `voc.*` → `error`, `rich_content.*` → `error`, `attachment.*` → `warning`, `reporter_facing_status.*` → `warning`. Required codes at minimum (from `packages/shared/src/errors/codes.ts`): `auth.session_invalid`, `auth.session_required`, `auth.session_expired`, `auth.workspace_mismatch`, `permission.denied`, `rate_limited.actor`, `rate_limited.ip`, `validation.failed`, `validation.malformed_request`, `validation.unknown_capability`, `conflict.idempotency_key_reuse`, `conflict.capability_already_granted`, `conflict.permission_request_duplicate`, `validation.malformed_idempotency_key`, `validation.sensitive_reason_required`, `validation.immutable_field`, `conflict.duplicate_slug`, `conflict.parent_archived`, `conflict.record_archived`, `not_found.record`, `internal.unexpected`, `voc.severity_not_user_settable`, `validation.unexpected_field`, `rich_content.disallowed_node`, `rich_content.external_image_forbidden`, `attachment.unsupported_pending_storage_slice`, `conflict.stale_write`, `voc.reporter_status_via_public_update_only`, `permission.scope_required`, `reporter_facing_status.invalid_transition`, `reporter_facing_status.gate_blocked`, `conflict.triage_already_committed`.
- Create: `apps/frontend/src/lib/api/client.ts` — `apiClient(method, path, { body?, idempotencyKey?, ifMatch?, signal? })`. Auto-mint Idempotency-Key UUIDv4 on POST/PATCH/DELETE when not supplied. Attach `Authorization` from session store. Parse JSON. Non-2xx → throw `ApiError extends Error { code, detail, status, requestId }`. 304 → return `{ status: 304, etag }`.
- Create: `apps/frontend/src/lib/api/useIdempotencyKey.ts` — `useIdempotencyKey(ifMatchEtag?: string)`. Returns stable UUIDv4 per render-tree until consumed; `markConsumed()` mints fresh. **When `ifMatchEtag` changes value, the hook MUST automatically mint a fresh UUIDv4** — this prevents `conflict.idempotency_key_reuse` after a stale-write refetch (BE includes `ifMatch` in the idempotency hash per `apps/backend/src/modules/voc/routes.ts:225`, so a retry with a new `If-Match` value is a semantically different request that needs a new key).
- Create: `apps/frontend/src/lib/api/types.ts` — `ApiErrorEnvelope` matching BE `errors/envelope.ts`.
- Modify: `apps/frontend/src/routes/__root.tsx` — mount `<Toaster position="bottom-center" />` from `sonner`.
- Create: `apps/frontend/src/lib/api/__tests__/errorMapper.test.ts` — **iterate `ERROR_CODES` from `@fops/shared` and assert each maps to a non-empty Korean message** (not a manual catalog). This test auto-covers new codes added to `codes.ts` without test update. Locked assertions: (1) every `ERROR_CODES` mapping has `tone` in literal set `{ 'error', 'warning', 'info' }`; (2) every code with prefix/member in `{ voc.*, rich_content.*, attachment.*, reporter_facing_status.*, conflict.stale_write, conflict.triage_already_committed, conflict.idempotency_key_reuse }` has Korean message not equal to exported `GENERIC_ERROR_MESSAGE`; (3) `conflict.stale_write` maps to `{ tone: 'warning', action: { label: <not undefined>, run: <fn> } }`.
- Create: `apps/frontend/src/lib/api/__tests__/client.test.ts` — mock fetch: POST mints Idempotency-Key, GET omits, Authorization attached, 422 throws ApiError, 304 returns ETag. Add test case: same `useIdempotencyKey` instance + changed `ifMatchEtag` → new key minted automatically.

**Dispatch (Sonnet):**
- Read first: `packages/shared/src/errors/codes.ts` (full `ERROR_CODES` array — iterate it), `apps/backend/src/lib/errors/envelope.ts`, `apps/backend/src/modules/voc/routes.ts` lines 200-260 (If-Match + idempotency hash).
- Constraint: Korean copy only. No i18n framework wiring (deferred).
- Constraint: apiClient must not import from any feature folder. Lives in `lib/api/` only.
- Constraint: errorMapper test MUST iterate `ERROR_CODES` — no hardcoded list.
- Verification: `pnpm --filter @fops/frontend typecheck && test`.

**CHECKPOINT 2.5** — playground HTML demonstrating: Toaster tones + Korean copy for 3+ representative codes (`conflict.stale_write` warning + retry action, `permission.denied` error, `rate_limited.ip` warning) + RichEditor demo rendering sanitizer-rejected content with toast surfaced via apiClient mock. Requires C2 `/dev-rich-editor` route to still exist when C3 lands. AskUserQuestion: "토스트 UX + 에러 메시지 OK?"

**Commit:** `feat(slice3 #18): sonner Toaster + apiClient + errorMapper (full ERROR_CODES) + useIdempotencyKey(ifMatch)`

---

## C4a — Three shells in packages/ui/src/layout/

**Goal:** `PageShell`, `ListShell`, `WorkbenchShell` + shared `ShellHeader` primitive land in `packages/ui/src/layout/`. Each shell conforms to ADR-0020 §3 slot contract. 50px header rhythm enforced. Re-exported from `packages/ui/src/index.ts`.

**ADR-0020 slot contracts (port from `docs/design-prototype/components.jsx`):**
- `PageShell` — slots: `title`, `subtitle`, `eyebrow`, `actions`, `back`, `fluid`.
- `ListShell` — slots: `toolbar` (50px), `beforeList?`, scroll body, `detailPanel?` (right content intent only).
- `WorkbenchShell` — slots: `toolbar` (50px), `belowToolbar?`, body, `detailPanel?` (right content intent only).
- `ShellHeader` — shared 50px header primitive used by ListShell toolbar and WorkbenchShell toolbar.

**DetailPanel ownership — LOCKED:** AppFrame owns the single global `DetailPanelSlot`. Shells DO NOT render their own detail-panel surface. `ListShell` and `WorkbenchShell` expose `detailPanel?: ReactNode`, but internally forward that content to AppFrame's slot via `useDetailPanelSlot()`. ADR-0020's "ListShell owns optional right detail panel" means the shell owns content placement intent for routes that opt into detail, not the rendering surface.

**Files:**
- Create: `packages/ui/src/layout/PageShell.tsx` — per ADR-0020 §1 + prototype `components.jsx`.
- Create: `packages/ui/src/layout/ListShell.tsx` — per ADR-0020 §1.
- Create: `packages/ui/src/layout/WorkbenchShell.tsx` — per ADR-0020 §1.
- Create: `packages/ui/src/layout/ShellHeader.tsx` — shared 50px header primitive. Height derived from `var(--toolbar-height)` token (50px), NOT hardcoded pixel constant.
- Modify: `packages/ui/src/index.ts` — re-export PageShell, ListShell, WorkbenchShell, ShellHeader.
- Create: `packages/ui/__tests__/shell-taxonomy.test.tsx` — 3 tests: (a) each of the 3 shells renders without throw; (b) ShellHeader height = 50px (via rendered style / token); (c) slot contracts smoke — PageShell renders `actions` slot, ListShell renders `toolbar` + body slots, WorkbenchShell renders `toolbar` + body slots.

**Dispatch (Sonnet):**
- Read first: `docs/adr/0020-*.md` (full), `docs/design-prototype/components.jsx` (source-of-truth implementations — port these, do not re-derive).
- Constraint: shells are PURE layout — no nav, no sidebar, no rail in this chunk (those belong in AppFrame, C4b).
- Constraint: no duplicate detail-panel surfaces. `detailPanel` props forward via `useDetailPanelSlot()` only.
- Constraint: NO 4th shell may be created. Adding a 4th shell requires an ADR amendment per ADR-0020 Consequences.
- Verification: `pnpm --filter @fops/ui typecheck && pnpm --filter @fops/ui test`.

**Commit:** `feat(slice3 #18): PageShell + ListShell + WorkbenchShell + ShellHeader per ADR-0020`

---

## C4b — AppFrame in apps/frontend + useFullscreenPanel hook

**Goal:** `<AppFrame>` in `apps/frontend/src/lib/layout/` composes Rail(52) + Sidebar(240/56) + (shell outlet) + the single global DetailPanelSlot(440). AppFrame consumes one of the 3 shells as its inner outlet. It is NOT exported as a shell — it is the authenticated route frame. `useFullscreenPanel` hook ready for #20 to consume.

**AppFrame is NOT a 4th shell.** It wraps a shell. The shell taxonomy (PageShell/ListShell/WorkbenchShell) lives in `packages/ui`. AppFrame is app-internal infrastructure.

**Files:**
- Create: `apps/frontend/src/lib/layout/AppFrame.tsx` — flex row Rail(52) + Sidebar(240/56) + Main(flex-1, shell outlet) + DetailPanelSlot(440 conditional). Headers conform to 50px rhythm via ShellHeader from `packages/ui`.
- Create: `apps/frontend/src/lib/layout/AppRail.tsx` — 52px vertical, workspace switcher placeholder + lucide-react utility icons.
- Create: `apps/frontend/src/lib/layout/AppSidebar.tsx` — 240px nav list. Slice 3 entries: Inbox, My VOCs, Triage, + New VOC. Collapse state uses SSR-safe initializer:
  ```ts
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('appSidebarCollapsed') === '1';
  });
  ```
  Collapse button writes `localStorage.appSidebarCollapsed`.
- Create: `apps/frontend/src/lib/layout/DetailPanelSlot.tsx` — fixed 440 right column. min 360 / max 520. Hidden when no content registered via `useDetailPanelSlot()`. This is the single rendering surface for all shell `detailPanel` content.
- Create: `apps/frontend/src/lib/layout/useDetailPanelSlot.ts` — context-based slot register/clear hook. Forbid multiple registrants: throw in dev (and warn in prod) if called twice with overlapping lifetimes, using a ref to track active ownership.
- Create: `apps/frontend/src/lib/panel/useFullscreenPanel.ts` — `[isFullscreen, toggle]`. Esc collapses. Route change clears.
- Create: `apps/frontend/src/lib/layout/__tests__/AppFrame.test.tsx` — Rail/Sidebar/Main present; sidebar first-paint width matches stored `localStorage.appSidebarCollapsed` before any user interaction; sidebar collapse toggle writes localStorage; DetailPanelSlot collapses when empty; multiple overlapping `useDetailPanelSlot()` registrants throw/warn.
- Create: `apps/frontend/src/lib/panel/__tests__/useFullscreenPanel.test.tsx` — toggle flips boolean; Esc dispatches collapse; route change clears (mock router).

**Dispatch (Sonnet):**
- Read first: `docs/design-prototype/app.jsx`, `docs/adr/0020-*.md`, `docs/frontend/specs/voc.md` §6.7, `packages/ui/src/layout/` (shells just created in C4a).
- Constraint: do not wire any route to AppFrame yet — C5 owns route mounting.
- Constraint: AppRail content stays placeholder (entries land per-feature per AGENTS.md two-consumer rule).
- Constraint: AppFrame is NOT exported from `packages/ui` — it lives in `apps/frontend/src/lib/layout/` only.
- Constraint: AppFrame is the single DetailPanelSlot owner; shells forward content via hook and never mount independent right panels.
- Verification: typecheck + test.

**Commit:** `feat(slice3 #18): AppFrame (Rail+Sidebar+Main+DetailPanelSlot) + useFullscreenPanel`

---

## C5 — /vocs route shell + authenticated layout route

**Goal:** TanStack layout route `_authed.tsx` wraps all authenticated routes in `<AppFrame>`. `/vocs` file-route uses `_authed` as parent and selects the correct shell per view (ListShell for inbox/my, WorkbenchShell for triage, PageShell for create). Zod search schema validates query params. routeTree regen clean.

**Route mounting — LOCKED (no "decide in dispatch" language):**
- `apps/frontend/src/routes/_authed.tsx` — new TanStack pathless layout route. Includes a `beforeLoad` callback that calls `fetchMe()` (same auth pattern currently used in admin routes) and `redirect({ to: '/login' })` on `UnauthenticatedError`. Wraps children with `<AppFrame>`. Login + non-authed routes do NOT use this layout and do NOT render AppFrame.
- Per-route auth guards in admin pages are DELETED in C5 after `_authed.beforeLoad` centralizes the guard.
- Admin routes (`/admin/*`) are relocated under `_authed` and classified as `PageShell`; URL path strings remain unchanged because `_authed` is pathless:
  - `apps/frontend/src/routes/admin/managed-systems.tsx` → `apps/frontend/src/routes/_authed/admin/managed-systems.tsx`
  - `apps/frontend/src/routes/admin/analytics-areas.tsx` → `apps/frontend/src/routes/_authed/admin/analytics-areas.tsx`
  - `apps/frontend/src/routes/admin/placeholder.tsx` → `apps/frontend/src/routes/_authed/admin/placeholder.tsx`
  - Test file imports updated: `apps/frontend/src/routes/admin/*.test.tsx` move alongside their routes.
  - Path strings (`/admin/managed-systems`, `/admin/analytics-areas`) UNCHANGED.
- `__root.tsx` stays a minimal global wrapper (providers + `<Outlet>`) — no AppFrame in `__root.tsx`.
- `/vocs` route file = `apps/frontend/src/routes/_authed/vocs.tsx`. Public path string is `/vocs`; `_authed` is pathless. Per-view shell selection: `view=inbox|my` → `<ListShell>`, `view=triage` → `<WorkbenchShell>`, `action=create` → `<PageShell>` (default when no view/action = `<ListShell>`).
- Forbid `Route.id` usage anywhere in navigation — only `to:` path strings. Add a lint rule or grep check in C5 verification.

**Files:**
- Create: `apps/frontend/src/routes/_authed.tsx` — TanStack layout route. `beforeLoad` calls `fetchMe()` and redirects unauthenticated users to `/login`; renders `<AppFrame><Outlet /></AppFrame>`.
- Create: `apps/frontend/src/routes/_authed/vocs.tsx` — `createFileRoute('/_authed/vocs')` with validateSearch zod. Component selects shell based on `view`/`action`. Main = placeholder text.
- Modify: `apps/frontend/src/routes/__root.tsx` — minimal; providers + `<Outlet>` only (no AppFrame).
- Move: `apps/frontend/src/routes/admin/managed-systems.tsx` → `apps/frontend/src/routes/_authed/admin/managed-systems.tsx`.
- Move: `apps/frontend/src/routes/admin/analytics-areas.tsx` → `apps/frontend/src/routes/_authed/admin/analytics-areas.tsx`.
- Move: `apps/frontend/src/routes/admin/placeholder.tsx` → `apps/frontend/src/routes/_authed/admin/placeholder.tsx`.
- Move: `apps/frontend/src/routes/admin/*.test.tsx` → alongside relocated `_authed/admin/*` routes; update imports.
- Modify relocated admin routes — delete page-local auth guards now covered by `_authed.beforeLoad`.
- Auto-regen: `apps/frontend/src/routeTree.gen.ts` (TanStackRouterVite plugin handles on dev).
- Create: `apps/frontend/src/routes/__tests__/vocs.test.tsx` — navigating to `/vocs?view=inbox` resolves; invalid `?view=foo` rejected by zod; sidebar `+ New VOC` href = `/vocs?action=create`; `view=triage` renders WorkbenchShell.
- Delete: `apps/frontend/src/routes/dev-rich-editor.tsx` IF it was added in C2 and is no longer needed (or keep behind DEV flag).

**Search schema:**
```ts
const vocSearchSchema = z.object({
  view: z.enum(['inbox', 'my', 'triage']).optional(),
  action: z.enum(['create']).optional(),
  selected: z.string().uuid().optional(),
  managedSystem: z.string().optional(),
  tab: z.string().optional(),
  sort: z.string().optional(),
}).passthrough(); // filter.* parsed per-view in #20
```

**Dispatch (Sonnet):**
- Read first: `apps/frontend/src/routes/__root.tsx`, `apps/frontend/vite.config.ts`, `apps/frontend/src/routes/admin/managed-systems.tsx` (existing TanStack file-route pattern), `apps/frontend/src/lib/layout/AppFrame.tsx` (just created in C4b), `packages/ui/src/layout/` (shells).
- Constraint: zero feature logic in /vocs — placeholder only.
- Constraint: login + non-authed routes must NOT render AppFrame — test this.
- Constraint: no `Route.id` navigation. Run `grep -rn 'Route\\.id\\|from: .*Route\\.id\\|to: .*Route\\.id' apps/frontend/src/` and refactor any hits to literal `to:` path strings.
- Verification: `pnpm --filter @fops/frontend dev`, navigate `/vocs?view=inbox`, `/vocs?action=create`. `pnpm typecheck && test`.

**CHECKPOINT 3 (C4b+C5 merged)** — playground HTML: AppFrame layout with collapse toggle, fullscreen toggle, 50px header overlay, baseline screenshot comparison per `docs/design-prototype/screenshots/final-baselines/manifest.json` route field, `/vocs` route screenshot per shell variant, and `mustSurvive` text validated for each matched route. AskUserQuestion: "셸 정렬 OK?"

**Commit:** `feat(slice3 #18): _authed layout route + /vocs route shell + shell selection per view`

---

## Final — adversarial review + push + PR

**Goal:** 2 cycles adversarial review (codex CLI → Opus subagent), reinforce gaps, push branch, open PR to develop, squash-merge after user OK, sync memory + wiki.

**Tasks:**
1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all clean from monorepo root.
2. Playwright MCP: screenshot `/vocs?view=inbox` + `/vocs?action=create` and compare against `docs/design-prototype/screenshots/final-baselines/*.png` matched per `manifest.json` `route` field. Validate the `mustSurvive` text for each route. Embed in final report.
3. Cycle 1: `codex review --base develop - <<'EOF' …` brief. Output → `.review/SLICE-3-18-REVIEW-CYCLE-1-codex.md`.
4. Reinforce gaps via Sonnet dispatch (narrow file set per finding).
5. Cycle 2: dispatch Opus subagent (general-purpose model=opus) with adversarial brief. Output → `.review/SLICE-3-18-REVIEW-CYCLE-2.md`.
6. Reinforce gaps via Sonnet.
7. CHECKPOINT 4 (Final): static HTML report — ship summary, follow-ups table, diff stats, test counts. AskUserQuestion: "최종 OK?"
8. `git push -u origin feature/18-fe-prologue` (agent allowed per orchestration §1).
9. `gh pr create --base develop --title "feat(slice3 #18): FE prologue — shadcn + TipTap + Pack 17 tokens + AppFrame + shells + /vocs shell" --body @.review/SLICE-3-18-PR-BODY.md`.
10. After user merge OK: `gh pr merge --squash --delete-branch`. Do NOT close issue (orchestration §2).
11. Sync memory: write `project_slice3_18_pr.md`, update MEMORY.md.
12. Sync llmwiki: append #18 PR commit to relevant pages (rich-content-sanitizer, shell-taxonomy, bounded-context-voc).

---

## Cross-chunk invariants

- Every chunk ends with `pnpm typecheck` green.
- No chunk touches files outside its declared file set without re-dispatch.
- Sonnet dispatches read AGENTS.md hierarchy first (`apps/frontend/AGENTS.md` mandatory).
- Tests added per chunk run live, not deferred.
- Vitest must run in `@fops/ui` before any test in C1a/C1b/C2/C4a is meaningful (P1-A fix in C1a step 0).
- **Token snapshot test is the gate — no chunk merges if token fidelity test fails.**
- **Token-fidelity test covers ALL Pack 17 token classes: colors + layout + spacing + radius + shadow + typography + status/severity/confidence, not just colors.**
- **AppFrame in `apps/frontend` NEVER becomes a 4th exported shell. Shell taxonomy = 3 (PageShell/ListShell/WorkbenchShell) per ADR-0020.**
- **AppFrame is the single DetailPanelSlot owner; shells forward `detailPanel` content via `useDetailPanelSlot()` (P2-D).**
- `git add -A` BANNED — explicit file paths only (per memory `feedback_orchestration`).
- Failing-first (RED → GREEN) discipline required for: token-fidelity snapshot (C1a), Button loading regression (C1b).

## Out of scope (lands in #19/#20/#21)

VOC list / row / toolbar / filter / sort, DetailPanel components, badge primitives, EntityHoverPreview, ComposerTabs, triage queue, severity picker, real attachment UI, mobile layout, AppRail content, CommandMenu wiring (cmdk installed only — `command` shadcn primitive deferred to a separate FE issue).

## Risks

- Pack 17 token swap may break Slice 1/2 admin pages visually (admin uses semantic tokens → should auto-light-render but verify in C1a checkpoint).
- TipTap `generateHTML` from `@tiptap/html` requires same extension set on render side → ensure renderer imports custom extensions, not just StarterKit.
- TanStack Router file routes regen — ensure vite plugin runs during typecheck CI (currently dev-only?).
- **shadcn HSL CSS vars must be remapped to R G B triple references** — `semantic.css` must explicitly remap `--background`, `--foreground`, `--primary`, etc. to `rgb(var(--color-X))` form; do NOT inherit shadcn defaults which use HSL.
- **TanStack `_authed` layout adoption requires admin relocation + auth-guard centralization. If `Route.id` is referenced anywhere, refactor in C5 (grep first).**
- `@tiptap/react` in `packages/ui` — verify `apps/frontend` resolves it transitively via workspace link without explicit install; if pnpm strict-mode blocks it, add a peer dep declaration.
- lucide-react peer-dep React 19: current frontend has 0.469.0; npm has 0.470.0+ available. Bump to `>=0.470` if peer range supports React 19, or set `pnpm install --strict-peer-dependencies=false` in CI.
- Tailwind v3 vs v4 ambiguity — DESIGN.md Quick Start shows `@theme` (v4 syntax). Project uses Tailwind 3. Subagent must NOT use v4 `@theme` blocks in any CSS files.
