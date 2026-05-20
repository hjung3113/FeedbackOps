OpenAI Codex v0.131.0
--------
workdir: /Users/hyojung/Desktop/2026/FeedbackOps
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019e40e3-f91c-7830-9b94-e339ee27d18a
--------
user
You are an adversarial reviewer of an implementation plan. The plan is at `.review/SLICE-3-18-PLAN.md`. Issue context: Slice 3 #18 — FE prologue for a TypeScript monorepo (React 19, TanStack Router, shadcn/ui, TipTap, Pack 17 Samsung-light tokens). Develop branch HEAD = e6577eb. Backend complete (558 tests). Frontend has Slice 1/2 surfaces (admin pages, login, pickers, Button).

READ FIRST (all required, in this order):
1. `.review/SLICE-3-18-PLAN.md` (the plan under review)
2. `docs/design-prototype/styles.css` (Pack 17 source — tokens being ported)
3. `packages/ui/src/styles/tokens.css` and `semantic.css` (current ADR-0016 dark tokens being replaced)
4. `packages/ui/tailwind.preset.ts` (current Tailwind preset, R G B + <alpha-value> format)
5. `packages/ui/src/components/Button.tsx` (current Button being replaced)
6. `packages/ui/src/components/{ManagedSystemPicker,AnalyticsAreaPicker}.tsx` (pickers being rebuilt on ToggleGroup)
7. `apps/frontend/src/routes/__root.tsx` and `apps/frontend/vite.config.ts` (TanStack Router setup)
8. `apps/frontend/AGENTS.md` (FE rules — extraction, dumb-prop, packages/ui export)
9. `docs/frontend/specs/voc.md` §3 + §6 (component inventory + visual contract)
10. `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md` (shell ADR)
11. `docs/adr/0011-rich-content-editor-and-attachment-storage.md` (TipTap ADR)
12. `apps/backend/src/modules/voc/routes.ts` (BE wire shape FE will consume)
13. `packages/shared/src/errors/codes.ts` (ADR-0012 error codes — verify errorMapper coverage list in C3)

REVIEW DIMENSIONS (rank gaps by severity P0/P1/P2/P3):

1. **Spec coverage** — Does the plan implement every acceptance criterion listed in issue #18 (read it via gh issue view 18 if available, else infer from PLAN.md "locked decisions")? List any AC with no task.
2. **Token swap correctness** — ADR-0016 → ADR-0021. Slice 1/2 surfaces ALSO consume `--surface-canvas`, `--text-primary`, etc. Will swapping the underlying semantic mappings break existing routes (admin pages, login, picker test page)? Are R G B → hex migration steps for Tailwind preset complete and consistent (drop `<alpha-value>` everywhere)? Is shadcn HSL remap removed cleanly?
3. **shadcn integration** — Is the 15-primitive list complete for Slice 3 needs per spec §3 (component inventory)? Is the `cn` util reused? Does `Button.tsx` replacement preserve every existing call site contract (primary, secondary, subtle, destructive variants)? Picker rebuild on ToggleGroup — does dumb-prop contract survive?
4. **TipTap surface contract** — C2 says surface is opaque pass-through. Does the renderer correctly avoid using StarterKit's Image extension? Does `RichContentRenderer` round-trip TipTap doc → HTML → TipTap doc for `attachmentRef` + `mention` custom extensions? Reporter_visible mode strip mentions — is this defense-in-depth correct?
5. **AppShell vs ADR-0020** — ListShell/PageShell/WorkbenchShell taxonomy. C4 only ships AppShell (Rail+Sidebar+Main+DetailPanelSlot). Where do the three shell variants live? Is the 50px header rhythm enforced by token or by hardcoded 50px constants?
6. **Route mounting** — C5 mounts AppShell INSIDE the /vocs route, but issue body suggests AppShell wraps `__root.tsx` for authed routes. Will admin routes (`/admin/analytics-areas`, `/admin/managed-systems`) break or render wrong if AppShell wraps root?
7. **apiClient + idempotency** — C3 mints UUIDv4 for Idempotency-Key. BE PATCH /vocs/:id and PATCH /vocs/:id/description require both Idempotency-Key AND If-Match. Does the client surface If-Match? errorMapper code list — cross-check against `packages/shared/src/errors/codes.ts` for omissions (rate_limited.actor, conflict.idempotency_key_reuse, etc.). Korean copy quality.
8. **Chunk dependencies + dispatch sizing** — C1 is large (~1200 LOC across 30+ files in 2 packages). Is it splittable? Does any chunk exceed the 800 LOC / 50 file Sonnet rule? Are there hidden ordering dependencies between C2 (TipTap) and C3 (errorMapper for sanitizer errors)?
9. **Checkpoint coverage** — 4 checkpoints. Should C3 (sonner/apiClient) have a checkpoint too (toast UX visual)? Is the C4+C5 merged checkpoint enough for shell verification?
10. **Test discipline** — Each chunk lists tests, but are they failure-first (TDD)? Live database touches? Snapshot tests for token verbatim port (token names + hex pairs frozen)?
11. **Hidden risks** — TanStack Router routeTree.gen.ts regen during typecheck CI? Vite preset config interaction with @fops/ui workspace alias? Tailwind v3 vs v4 syntax (DESIGN.md Quick Start shows @theme v4 — but project may be v3)?
12. **Out-of-scope leaks** — Anything in the plan that should be deferred to #19/#20/#21? Anything from #19/#20/#21 leaking into #18?

OUTPUT FORMAT (markdown):

# PLAN Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0 (blocks execution): N findings
- P1 (must fix before PR): N findings
- P2 (should fix during chunk): N findings
- P3 (nice-to-have / follow-up issue): N findings

## Findings

### P0-1: <title>
**File:line:** `.review/SLICE-3-18-PLAN.md:42` (or the source-file:line being violated)
**Issue:** <what is wrong>
**Why it matters:** <consequence>
**Suggested fix:** <concrete change to the plan>

[repeat per finding, ordered by severity then chunk]

## Quality call
One paragraph: is this plan executable as-is, executable with P0/P1 fixes, or does it need rewrite?

## What I did NOT review
Bullet list — areas you skipped or had insufficient context.

DO NOT be diplomatic. Find real problems. Prefer 8 specific findings over 20 vague ones. Cite file:line.

hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
codex
I’ll review this as a plan review, not a code-change task. I’m going to gather the required files and issue context first, keeping the raw file contents out of the chat context where possible.
codex
I’m pulling structured summaries and line-numbered excerpts from the plan plus the referenced source/docs. I’ll also try `gh issue view 18`; if auth/network blocks it, I’ll fall back to the plan’s locked decisions as requested.
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
The first batch got the GitHub issue body, but my file-summary command didn’t resolve the repo path correctly. I’m rerunning the extraction with the absolute project root so the citations are anchored to real file lines.
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
The heredoc form is being swallowed by the context-mode shell wrapper, so I’m switching to `ctx_execute` JavaScript directly. That will still keep the review extraction programmatic and compact.
mcp: context-mode/ctx_execute_file started
mcp: context-mode/ctx_execute_file (failed)
user cancelled MCP tool call
codex
The context-mode file execution call was cancelled. I’ll avoid dumping whole files and use narrow shell reads/searches with line numbers so the review can still proceed.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse
exec
/bin/zsh -lc "rg -n \"Acceptance|AC|Locked|decision|C[1-9]\\b|Chunk|Token|ADR-0016|ADR-0021|tailwind|alpha|hsl|hex|semantic|shadcn|primitive|Button|ToggleGroup|Picker|cn\\b|TipTap|RichContent|StarterKit|Image|attachmentRef|mention|reporter|AppShell|ListShell|PageShell|WorkbenchShell|50px|header|route|__root|admin|vocs|apiClient|Idempotency|If-Match|errorMapper|Korean|toast|sonner|checkpoint|dispatch|800|1200|LOC|files|TDD|snapshot|routeTree|v4|v3|out.of.scope\" .review/SLICE-3-18-PLAN.md" in /Users/hyojung/Desktop/2026/FeedbackOps
exec
/bin/zsh -lc 'rg -n "surface-canvas|text-primary|hsl|rgb|alpha-value|--|#[0-9a-fA-F]{6}|Pack|Samsung" docs/design-prototype/styles.css packages/ui/src/styles/tokens.css packages/ui/src/styles/semantic.css packages/ui/tailwind.preset.ts' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
3:**Goal:** Land shadcn baseline + TipTap RichEditor + sonner + Pack-17 light tokens + AppShell + `/vocs` route shell so #19/#20/#21 can build VOC surfaces.
5:**Architecture:** 6 chunks (C0-C5) dispatched sequentially. Each chunk = one Sonnet subagent dispatch with single Goal + narrow file set. Main session orchestrates, integrates between chunks, runs typecheck, dispatches next. 4 visual checkpoints between chunks (playground/report HTML + AskUserQuestion).
7:**Tech Stack:** React 19, TanStack Router 1.170, TipTap 2, shadcn/ui + Radix, Tailwind 3, sonner, cmdk, Zod, react-hook-form, lucide-react. CVA + tailwind-merge for variants.
9:**Locked decisions (2026-05-20 user confirm):**
10:- Q1=A: Pack 17 (Samsung-light) verbatim port. ADR-0016 supersede via new ADR-0021. hex format (drop R G B triples).
11:- Q2=A: shadcn at `packages/ui/src/components/shadcn/`, re-exported from `packages/ui/src/index.ts`.
12:- Q3=A: Existing `Button.tsx` replaced by shadcn CVA Button. variant primary→default alias. 1 caller migrated.
13:- Q4=A: 6 chunks + 4 checkpoints (C1, C2, C4+C5 merged, Final).
29:## C0 — ADR-0021 + token-format prep + branch
31:**Goal:** Land ADR-0021 (Pack 17 Light System) superseding ADR-0016. Update ADR-0016 frontmatter to `superseded-by: 0021`. No code changes yet.
39:2. Write ADR-0021 with: context (Pack 17 prototype refresh + Samsung-blue accent), decision (verbatim port from `docs/design-prototype/styles.css` to `packages/ui/src/styles/tokens.css` + `semantic.css`, hex format, drop `<alpha-value>` Tailwind composition), consequences (Slice 1/2 surfaces auto re-render via tokens, Button variants remapped, focus ring tinted Samsung-blue).
40:3. Add `supersedes: 0016` to ADR-0021 frontmatter and `superseded-by: 0021` to ADR-0016.
41:4. Commit: `docs(slice3 #18): ADR-0021 Pack 17 Samsung-light supersedes ADR-0016`.
49:## C1 — shadcn baseline + tokens + Tailwind preset
51:**Goal:** Pack 17 tokens live in `packages/ui/src/styles/`, Tailwind preset exposes them, 15 shadcn primitives in `packages/ui/src/components/shadcn/`, Button wholesale-replaced with shadcn CVA Button, 1 caller migrated, pickers rebuilt on ToggleGroup, existing tests pass.
56:pnpm --filter @fops/frontend add sonner cmdk @tailwindcss/typography
58:# packages/ui (owner of shadcn primitives)
59:pnpm --filter @fops/ui add class-variance-authority tailwind-merge clsx lucide-react @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-avatar @radix-ui/react-slot
64:- Rewrite: `packages/ui/src/styles/semantic.css` — re-derive semantic tokens against new raw colors; remove shadcn HSL remap that conflicts with hex format.
65:- Rewrite: `packages/ui/tailwind.preset.ts` — kebab-case keys (`surface-canvas`, `text-primary`, `severity-high`, etc.) mapped to `var(--…)` without `<alpha-value>`. Add spacing + radius + boxShadow extends.
66:- Rewrite: `packages/ui/src/components/Button.tsx` — shadcn CVA Button, variants `default|secondary|destructive|outline|ghost|link`. Keep `primary|subtle` as aliases for backwards-compat (primary→default, subtle→ghost). Keep `size: sm|md|lg`. Drop `loading` prop unless trivially preserved.
67:- Create: 15 shadcn primitives in `packages/ui/src/components/shadcn/`: `button.tsx` (re-export Button), `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toggle-group.tsx`, `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `tooltip.tsx`, `popover.tsx`, `tabs.tsx`, `skeleton.tsx`, `avatar.tsx`, `badge.tsx`. Each = standard shadcn CVA wrapper.
68:- Modify: `packages/ui/src/index.ts` — re-export 15 shadcn primitives + cn + Button (now shadcn) + existing pickers.
69:- Rewrite: `packages/ui/src/components/ManagedSystemPicker.tsx` — replace native `<select>` with shadcn ToggleGroup (chip style per spec §3.4) keeping `PickerOption[]` + `onChange(value: string|null)` dumb-prop contract.
70:- Rewrite: `packages/ui/src/components/AnalyticsAreaPicker.tsx` — same pattern.
71:- Modify: `apps/frontend/src/features/admin/permissions/request-access-button.tsx:115` — `variant="primary"` → `variant="default"` (or leave with primary alias).
72:- Modify: `apps/frontend/src/styles.css` — keep `@import "@fops/ui/styles/tokens.css"` + `semantic.css` + tailwind directives.
73:- Create: `packages/ui/__tests__/shadcn-smoke.test.tsx` — render each primitive once asserting no throw.
76:- Read first: `docs/design-prototype/styles.css`, `packages/ui/src/styles/{tokens,semantic}.css`, `packages/ui/tailwind.preset.ts`, `packages/ui/src/components/Button.tsx`, `packages/ui/src/components/{ManagedSystemPicker,AnalyticsAreaPicker}.tsx`, `apps/frontend/src/components-test-pickers.test.tsx`.
77:- Constraint: no Slice 3 #18 wiring beyond C1 scope (no TipTap, no AppShell, no /vocs route).
81:**CHECKPOINT 1** — playground HTML: prototype components vs impl components, token side-by-side, Button variant matrix. Pair AskUserQuestion: "토큰 + shadcn baseline OK?"
83:**Commit:** `feat(slice3 #18): Pack 17 tokens + shadcn baseline + pickers on ToggleGroup`
87:## C2 — TipTap RichEditor + RichContentRenderer
89:**Goal:** `<RichEditor>` + `<RichContentRenderer>` + 2 custom extensions land in `packages/ui/src/rich-content/`. Demo route renders editor in `voc-description` surface. Renderer mode strips mentions for reporter_visible.
98:- Create: `packages/ui/src/rich-content/extensions/attachmentRef.ts` — TipTap Node `{ name: 'attachmentRef', group: 'block', attrs: { id, name, sizeBytes, mimeType }, parseHTML/renderHTML/addNodeView }`.
99:- Create: `packages/ui/src/rich-content/extensions/mention.ts` — TipTap Node `{ name: 'mention', group: 'inline', inline: true, attrs: { actor_id, label } }`.
100:- Create: `packages/ui/src/rich-content/RichEditor.tsx` — props `{ surface: string, value?, defaultValue?, onChange, placeholder?, disabled?, minHeight?, toolbar?: ReactNode }`. Extensions: `StarterKit.configure({ image: false })` + Link + Underline + Placeholder + attachmentRef + mention. Returns editor instance via render-prop for toolbar.
101:- Create: `packages/ui/src/rich-content/RichContentRenderer.tsx` — props `{ doc: TipTapDoc, mode: 'reporter_visible'|'internal' }`. Uses `generateHTML` from `@tiptap/html` with same extension set. `reporter_visible` strips mention nodes pre-render.
102:- Modify: `packages/ui/src/index.ts` — export RichEditor, RichContentRenderer, attachmentRef, mention, types.
103:- Create: `apps/frontend/src/routes/dev-rich-editor.tsx` — temporary demo route (keep behind `import.meta.env.DEV` guard or delete in Final). Renders RichEditor + RichContentRenderer side by side, with surface picker + mode toggle.
104:- Create: `packages/ui/__tests__/rich-content.test.tsx` — controlled value round-trips through onChange; reporter_visible strips mentions; internal preserves; attachmentRef + mention attrs round-trip TipTap doc → HTML → TipTap doc.
109:- Constraint: editor must NOT register Image extension (StarterKit image: false).
110:- Constraint: no API calls. Demo route uses local state only.
113:**CHECKPOINT 2** — playground HTML: RichEditor surface toggle (4 surfaces), mode toggle, mention/attachment node demo, prototype rich-editor.jsx screenshot side-by-side. AskUserQuestion: "에디터 UX prototype 일치?"
115:**Commit:** `feat(slice3 #18): TipTap RichEditor + RichContentRenderer + attachmentRef + mention extensions`
119:## C3 — sonner Toaster + apiClient + errorMapper + idempotency hook
121:**Goal:** `<Toaster>` mounted in `__root.tsx`. `apiClient`, `errorMapper`, `useIdempotencyKey` land in `apps/frontend/src/lib/api/`. All Slice 3 ADR-0012 codes covered with Korean copy.
124:- Create: `apps/frontend/src/lib/api/errorMapper.ts` — function mapping `{ code, detail }` to `{ tone: 'error'|'warning'|'info', message: string, action?: { label, run } }`. Catalog covers: validation.failed, voc.severity_not_user_settable, voc.reporter_status_via_public_update_only, validation.unexpected_field, rich_content.disallowed_node, rich_content.external_image_forbidden, attachment.unsupported_pending_storage_slice, conflict.stale_write, conflict.triage_already_committed, conflict.parent_archived, conflict.record_archived, conflict.idempotency_key_reuse, not_found.record, permission.denied, permission.scope_required, reporter_facing_status.invalid_transition, reporter_facing_status.gate_blocked, rate_limited.actor. Korean copy.
125:- Create: `apps/frontend/src/lib/api/client.ts` — `apiClient(method, path, { body?, idempotencyKey?, ifMatch?, signal? })`. Auto-mint Idempotency-Key UUIDv4 on POST/PATCH/DELETE when not supplied. Attach `Authorization` from session store. Parse JSON. Non-2xx → throw `ApiError extends Error { code, detail, status, requestId }`. 304 → return `{ status: 304, etag }`.
126:- Create: `apps/frontend/src/lib/api/useIdempotencyKey.ts` — `useIdempotencyKey()` returns stable UUIDv4 per render-tree until consumed; `markConsumed()` mints fresh.
128:- Modify: `apps/frontend/src/routes/__root.tsx` — mount `<Toaster position="bottom-center" />` from `sonner`.
129:- Create: `apps/frontend/src/lib/api/__tests__/errorMapper.test.ts` — enumerate every code in catalog.
130:- Create: `apps/frontend/src/lib/api/__tests__/client.test.ts` — mock fetch: POST mints Idempotency-Key, GET omits, Authorization attached, 422 throws ApiError, 304 returns ETag.
133:- Read first: `packages/shared/src/errors/`, `apps/backend/src/lib/errors/envelope.ts`, `apps/backend/src/modules/voc/routes.ts` (header expectations).
134:- Constraint: Korean copy only. No i18n framework wiring (deferred).
135:- Constraint: apiClient must not import from any feature folder. Lives in `lib/api/` only.
138:**Commit:** `feat(slice3 #18): sonner Toaster + apiClient + errorMapper + useIdempotencyKey`
140:(No checkpoint — not visual.)
144:## C4 — AppShell + useFullscreenPanel hook
146:**Goal:** `<AppShell>` mounts Rail/Sidebar/Main/DetailPanelSlot. 50px header rhythm enforced (ADR-0020). Sidebar collapse persists to localStorage. `useFullscreenPanel` hook ready for #20 to consume.
149:- Create: `apps/frontend/src/lib/layout/AppShell.tsx` — flex row Rail(52) + Sidebar(240/56) + Main(flex-1) + DetailPanelSlot(440 conditional). Headers 50px.
155:- Create: `apps/frontend/src/lib/layout/__tests__/AppShell.test.tsx` — Rail/Sidebar/Main present; sidebar collapse toggle writes localStorage; DetailPanelSlot collapses when empty.
156:- Create: `apps/frontend/src/lib/panel/__tests__/useFullscreenPanel.test.tsx` — toggle flips boolean; Esc dispatches collapse; route change clears (mock router).
160:- Constraint: do not wire any route to AppShell yet — C5 owns route mounting.
164:**Commit:** `feat(slice3 #18): AppShell (Rail+Sidebar+Main+DetailPanelSlot) + useFullscreenPanel`
168:## C5 — /vocs route shell
170:**Goal:** TanStack file-route `/vocs` mounts AppShell with 4 sidebar entries. Zod search schema validates query params. Placeholder main keyed off `view`/`action`. routeTree regen clean.
173:- Create: `apps/frontend/src/routes/vocs.tsx` — `createFileRoute('/vocs')` with validateSearch zod. Component renders `<AppShell>` + sidebar items linking to `?view=inbox|my|triage` + `?action=create`. Main = `<p>VOC routes land in #19/#20/#21 — current view: {view ?? action}</p>`.
174:- Modify: `apps/frontend/src/routes/__root.tsx` — wrap children with `<AppShell>` for authed routes (or wrap inside vocs.tsx only — decide in dispatch).
175:- Auto-regen: `apps/frontend/src/routeTree.gen.ts` (TanStackRouterVite plugin handles on dev).
176:- Create: `apps/frontend/src/routes/__tests__/vocs.test.tsx` — navigating to `/vocs?view=inbox` resolves; invalid `?view=foo` rejected by zod; sidebar `+ New VOC` href = `/vocs?action=create`.
177:- Delete: `apps/frontend/src/routes/dev-rich-editor.tsx` IF it was added in C2 and is no longer needed (or keep behind DEV flag).
192:- Read first: `apps/frontend/src/routes/__root.tsx`, `apps/frontend/vite.config.ts`, `apps/frontend/src/routes/admin/managed-systems.tsx` (existing TanStack file-route pattern).
193:- Constraint: zero feature logic in /vocs — placeholder only.
194:- Verification: `pnpm --filter @fops/frontend dev`, navigate `/vocs?view=inbox`, `/vocs?action=create`. `pnpm typecheck && test`.
196:**CHECKPOINT 3 (C4+C5 merged)** — playground HTML: AppShell layout with collapse toggle, fullscreen toggle, 50px header overlay, prototype `screen-voc.jsx` side-by-side, /vocs route screenshot. AskUserQuestion: "셸 정렬 OK?"
198:**Commit:** `feat(slice3 #18): /vocs route shell + zod search schema + AppShell mount`
208:2. Playwright MCP: screenshot `/vocs?view=inbox` + `/vocs?action=create` + prototype `screen-voc.jsx` + `screen-voc-create.jsx`. Embed in final report.
210:4. Reinforce gaps via Sonnet dispatch (narrow file set per finding).
211:5. Cycle 2: dispatch Opus subagent (general-purpose model=opus) with adversarial brief. Output → `.review/SLICE-3-18-REVIEW-CYCLE-2.md`.
215:9. `gh pr create --base develop --title "feat(slice3 #18): FE prologue — shadcn + TipTap + Pack 17 tokens + AppShell + /vocs shell" --body @.review/SLICE-3-18-PR-BODY.md`.
225:- No chunk touches files outside its declared file set without re-dispatch.
226:- Sonnet dispatches read AGENTS.md hierarchy first (`apps/frontend/AGENTS.md` mandatory).
232:VOC list / row / toolbar / filter / sort, DetailPanel components, badge primitives, EntityHoverPreview, ComposerTabs, triage queue, severity picker, real attachment UI, mobile layout, AppRail content, CommandMenu wiring (cmdk installed only).
236:- Pack 17 token swap may break Slice 1/2 admin pages visually (admin uses semantic tokens → should auto-light-render but verify in C1 checkpoint).
237:- TipTap `generateHTML` from `@tiptap/html` requires same extension set on render side → ensure renderer imports custom extensions, not just StarterKit.
238:- TanStack Router file routes regen — ensure vite plugin runs during typecheck CI (currently dev-only?).
239:- shadcn HSL CSS vars conflict with hex tokens — semantic.css must explicitly remap, not inherit shadcn defaults.

exec
/bin/zsh -lc 'rg -n "variant|primary|secondary|subtle|destructive|size|className|forwardRef|buttonVariants|interface|type .*Props|value|onChange|disabled|loading|Button|Toggle" packages/ui/src/components/Button.tsx packages/ui/src/components/ManagedSystemPicker.tsx packages/ui/src/components/AnalyticsAreaPicker.tsx' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
packages/ui/src/components/Button.tsx:1:import type { ButtonHTMLAttributes, ReactNode } from 'react';
packages/ui/src/components/Button.tsx:4:// Per ADR-0016: variant surface constrained to component-inventory.md.
packages/ui/src/components/Button.tsx:6:type Variant = 'primary' | 'secondary' | 'subtle' | 'destructive';
packages/ui/src/components/Button.tsx:9:interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
packages/ui/src/components/Button.tsx:10:  variant?: Variant;
packages/ui/src/components/Button.tsx:11:  size?: Size;
packages/ui/src/components/Button.tsx:12:  loading?: boolean;
packages/ui/src/components/Button.tsx:17:  primary: 'bg-accent-primary text-text-inverse hover:opacity-90',
packages/ui/src/components/Button.tsx:18:  secondary: 'bg-surface-raised text-text-primary hover:bg-surface-overlay',
packages/ui/src/components/Button.tsx:19:  subtle: 'bg-transparent text-text-muted hover:text-text-primary',
packages/ui/src/components/Button.tsx:20:  destructive: 'bg-accent-danger text-text-primary hover:opacity-90',
packages/ui/src/components/Button.tsx:29:export function Button({
packages/ui/src/components/Button.tsx:30:  variant = 'primary',
packages/ui/src/components/Button.tsx:31:  size = 'md',
packages/ui/src/components/Button.tsx:32:  loading = false,
packages/ui/src/components/Button.tsx:33:  disabled,
packages/ui/src/components/Button.tsx:34:  className,
packages/ui/src/components/Button.tsx:37:}: ButtonProps) {
packages/ui/src/components/Button.tsx:42:      disabled={disabled === true || loading}
packages/ui/src/components/Button.tsx:43:      aria-busy={loading}
packages/ui/src/components/Button.tsx:44:      className={cn(
packages/ui/src/components/Button.tsx:46:        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
packages/ui/src/components/Button.tsx:47:        'disabled:opacity-50 disabled:cursor-not-allowed',
packages/ui/src/components/Button.tsx:49:        VARIANT_CLASSES[variant],
packages/ui/src/components/Button.tsx:50:        SIZE_CLASSES[size],
packages/ui/src/components/Button.tsx:51:        className,
packages/ui/src/components/ManagedSystemPicker.tsx:9:export interface PickerOption {
packages/ui/src/components/ManagedSystemPicker.tsx:15:export interface ManagedSystemPickerProps {
packages/ui/src/components/ManagedSystemPicker.tsx:17:  value: string | null;
packages/ui/src/components/ManagedSystemPicker.tsx:18:  onChange: (id: string | null) => void;
packages/ui/src/components/ManagedSystemPicker.tsx:19:  disabled?: boolean;
packages/ui/src/components/ManagedSystemPicker.tsx:26:  className?: string;
packages/ui/src/components/ManagedSystemPicker.tsx:31:    const v = e.target.value;
packages/ui/src/components/ManagedSystemPicker.tsx:32:    props.onChange(v === '' ? null : v);
packages/ui/src/components/ManagedSystemPicker.tsx:36:      className={cn('border px-2 py-1 text-sm', props.className)}
packages/ui/src/components/ManagedSystemPicker.tsx:37:      value={props.value ?? ''}
packages/ui/src/components/ManagedSystemPicker.tsx:38:      onChange={handle}
packages/ui/src/components/ManagedSystemPicker.tsx:39:      disabled={props.disabled}
packages/ui/src/components/ManagedSystemPicker.tsx:42:      <option value="">{props.placeholder ?? 'Select Managed System…'}</option>
packages/ui/src/components/ManagedSystemPicker.tsx:47:          <option key={opt.id} value={opt.id}>
packages/ui/src/components/AnalyticsAreaPicker.tsx:2:// Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
packages/ui/src/components/AnalyticsAreaPicker.tsx:9:export interface AnalyticsAreaPickerProps {
packages/ui/src/components/AnalyticsAreaPicker.tsx:11:  value: string | null;
packages/ui/src/components/AnalyticsAreaPicker.tsx:12:  onChange: (id: string | null) => void;
packages/ui/src/components/AnalyticsAreaPicker.tsx:13:  disabled?: boolean;
packages/ui/src/components/AnalyticsAreaPicker.tsx:17:  className?: string;
packages/ui/src/components/AnalyticsAreaPicker.tsx:22:    const v = e.target.value;
packages/ui/src/components/AnalyticsAreaPicker.tsx:23:    props.onChange(v === '' ? null : v);
packages/ui/src/components/AnalyticsAreaPicker.tsx:27:      className={cn('border px-2 py-1 text-sm', props.className)}
packages/ui/src/components/AnalyticsAreaPicker.tsx:28:      value={props.value ?? ''}
packages/ui/src/components/AnalyticsAreaPicker.tsx:29:      onChange={handle}
packages/ui/src/components/AnalyticsAreaPicker.tsx:30:      disabled={props.disabled}
packages/ui/src/components/AnalyticsAreaPicker.tsx:33:      <option value="">{props.placeholder ?? 'Select Analytics Area…'}</option>
packages/ui/src/components/AnalyticsAreaPicker.tsx:38:          <option key={opt.id} value={opt.id}>

 succeeded in 0ms:
packages/ui/tailwind.preset.ts:9:        'surface-canvas': 'rgb(var(--surface-canvas) / <alpha-value>)',
packages/ui/tailwind.preset.ts:10:        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
packages/ui/tailwind.preset.ts:11:        'surface-overlay': 'rgb(var(--surface-overlay) / <alpha-value>)',
packages/ui/tailwind.preset.ts:12:        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
packages/ui/tailwind.preset.ts:13:        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
packages/ui/tailwind.preset.ts:14:        'text-subtle': 'rgb(var(--text-subtle) / <alpha-value>)',
packages/ui/tailwind.preset.ts:15:        'text-inverse': 'rgb(var(--text-inverse) / <alpha-value>)',
packages/ui/tailwind.preset.ts:16:        'border-default': 'rgb(var(--border-default) / <alpha-value>)',
packages/ui/tailwind.preset.ts:17:        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
packages/ui/tailwind.preset.ts:18:        'accent-primary': 'rgb(var(--accent-primary) / <alpha-value>)',
packages/ui/tailwind.preset.ts:19:        'accent-info': 'rgb(var(--accent-info) / <alpha-value>)',
packages/ui/tailwind.preset.ts:20:        'accent-warn': 'rgb(var(--accent-warn) / <alpha-value>)',
packages/ui/tailwind.preset.ts:21:        'accent-danger': 'rgb(var(--accent-danger) / <alpha-value>)',
packages/ui/tailwind.preset.ts:22:        'accent-success': 'rgb(var(--accent-success) / <alpha-value>)',
packages/ui/src/styles/tokens.css:2: * Components MUST NOT reference --color-* directly; consume semantic tokens in semantic.css.
packages/ui/src/styles/tokens.css:3: * Values stored as `R G B` triples for Tailwind alpha-value composition.
packages/ui/src/styles/tokens.css:6:  --color-pitch-black: 8 9 10;
packages/ui/src/styles/tokens.css:7:  --color-graphite: 26 27 30;
packages/ui/src/styles/tokens.css:8:  --color-coal: 35 37 41;
packages/ui/src/styles/tokens.css:9:  --color-iron: 53 56 61;
packages/ui/src/styles/tokens.css:10:  --color-storm-cloud: 138 143 152;
packages/ui/src/styles/tokens.css:11:  --color-cement: 187 191 197;
packages/ui/src/styles/tokens.css:12:  --color-porcelain: 240 241 243;
packages/ui/src/styles/tokens.css:13:  --color-white: 255 255 255;
packages/ui/src/styles/tokens.css:15:  --color-neon-lime: 228 242 34;
packages/ui/src/styles/tokens.css:16:  --color-electric-blue: 90 161 255;
packages/ui/src/styles/tokens.css:17:  --color-warn-amber: 245 173 66;
packages/ui/src/styles/tokens.css:18:  --color-danger-crimson: 232 76 76;
packages/ui/src/styles/tokens.css:19:  --color-success-jade: 80 200 140;
packages/ui/src/styles/semantic.css:6:  --surface-canvas: var(--color-pitch-black);
packages/ui/src/styles/semantic.css:7:  --surface-raised: var(--color-graphite);
packages/ui/src/styles/semantic.css:8:  --surface-overlay: var(--color-coal);
packages/ui/src/styles/semantic.css:11:  --text-primary: var(--color-porcelain);
packages/ui/src/styles/semantic.css:12:  --text-muted: var(--color-cement);
packages/ui/src/styles/semantic.css:13:  --text-subtle: var(--color-storm-cloud);
packages/ui/src/styles/semantic.css:14:  --text-inverse: var(--color-pitch-black);
packages/ui/src/styles/semantic.css:17:  --border-default: var(--color-iron);
packages/ui/src/styles/semantic.css:18:  --border-strong: var(--color-storm-cloud);
packages/ui/src/styles/semantic.css:21:  --accent-primary: var(--color-neon-lime);
packages/ui/src/styles/semantic.css:22:  --accent-info: var(--color-electric-blue);
packages/ui/src/styles/semantic.css:23:  --accent-warn: var(--color-warn-amber);
packages/ui/src/styles/semantic.css:24:  --accent-danger: var(--color-danger-crimson);
packages/ui/src/styles/semantic.css:25:  --accent-success: var(--color-success-jade);
packages/ui/src/styles/semantic.css:28:  --background: var(--surface-canvas);
packages/ui/src/styles/semantic.css:29:  --foreground: var(--text-primary);
packages/ui/src/styles/semantic.css:30:  --card: var(--surface-raised);
packages/ui/src/styles/semantic.css:31:  --card-foreground: var(--text-primary);
packages/ui/src/styles/semantic.css:32:  --popover: var(--surface-overlay);
packages/ui/src/styles/semantic.css:33:  --popover-foreground: var(--text-primary);
packages/ui/src/styles/semantic.css:34:  --primary: var(--accent-primary);
packages/ui/src/styles/semantic.css:35:  --primary-foreground: var(--text-inverse);
packages/ui/src/styles/semantic.css:36:  --muted: var(--surface-raised);
packages/ui/src/styles/semantic.css:37:  --muted-foreground: var(--text-muted);
packages/ui/src/styles/semantic.css:38:  --border: var(--border-default);
packages/ui/src/styles/semantic.css:39:  --input: var(--border-default);
packages/ui/src/styles/semantic.css:40:  --ring: var(--accent-primary);
packages/ui/src/styles/semantic.css:41:  --destructive: var(--accent-danger);
packages/ui/src/styles/semantic.css:42:  --destructive-foreground: var(--text-primary);
docs/design-prototype/styles.css:9:  /* --- Raw color tokens (DESIGN.md) --- */
docs/design-prototype/styles.css:10:  --color-pitch-black: #f3f7fe;
docs/design-prototype/styles.css:11:  --color-graphite: #fbfdff;
docs/design-prototype/styles.css:12:  --color-deep-slate: #edf3fb;
docs/design-prototype/styles.css:13:  --color-charcoal-grey: #cbd6e6;
docs/design-prototype/styles.css:14:  --color-muted-ash: #b8c4d6;
docs/design-prototype/styles.css:15:  --color-gunmetal: #94a3b8;
docs/design-prototype/styles.css:16:  --color-porcelain: #101828;
docs/design-prototype/styles.css:17:  --color-light-steel: #374151;
docs/design-prototype/styles.css:18:  --color-storm-cloud: #687386;
docs/design-prototype/styles.css:19:  --color-fog-grey: #98a2b3;
docs/design-prototype/styles.css:20:  --color-alabaster: #e5e5e6;
docs/design-prototype/styles.css:21:  --color-neon-lime: #1428a0;
docs/design-prototype/styles.css:22:  --color-aether-blue: #1428a0;
docs/design-prototype/styles.css:23:  --color-forest-green: #008d4c;
docs/design-prototype/styles.css:24:  --color-cyan-spark: #00a9e0;
docs/design-prototype/styles.css:25:  --color-emerald: #18a86b;
docs/design-prototype/styles.css:26:  --color-warning-red: #d92d3a;
docs/design-prototype/styles.css:27:  --color-deep-violet: #3157d5;
docs/design-prototype/styles.css:28:  --color-amethyst: #6a8dff;
docs/design-prototype/styles.css:29:  --color-amber: #a56300;
docs/design-prototype/styles.css:31:  /* --- Semantic text tokens --- */
docs/design-prototype/styles.css:32:  --text-primary: var(--color-porcelain);
docs/design-prototype/styles.css:33:  --text-secondary: var(--color-light-steel);
docs/design-prototype/styles.css:34:  --text-muted: var(--color-storm-cloud);
docs/design-prototype/styles.css:35:  --text-disabled: var(--color-fog-grey);
docs/design-prototype/styles.css:36:  --text-danger: var(--color-warning-red);
docs/design-prototype/styles.css:37:  --text-warning: var(--color-amber);
docs/design-prototype/styles.css:38:  --text-success: var(--color-emerald);
docs/design-prototype/styles.css:39:  --text-info: var(--color-cyan-spark);
docs/design-prototype/styles.css:40:  --text-on-accent: #ffffff;
docs/design-prototype/styles.css:42:  /* --- Surface tokens --- */
docs/design-prototype/styles.css:43:  --surface-canvas: var(--color-pitch-black);
docs/design-prototype/styles.css:44:  --surface-sidebar: #eef4fb;
docs/design-prototype/styles.css:45:  --surface-list: var(--color-pitch-black);
docs/design-prototype/styles.css:46:  --surface-row-hover: #e7effc;
docs/design-prototype/styles.css:47:  --surface-row-selected: #d8e7fb;
docs/design-prototype/styles.css:48:  --surface-detail: var(--color-graphite);
docs/design-prototype/styles.css:49:  --surface-popover: var(--color-deep-slate);
docs/design-prototype/styles.css:50:  --surface-field: transparent;
docs/design-prototype/styles.css:51:  --surface-field-filled: #ffffff;
docs/design-prototype/styles.css:52:  --surface-blocked: #eef2f7;
docs/design-prototype/styles.css:53:  --surface-card: var(--color-graphite);
docs/design-prototype/styles.css:54:  --surface-card-elevated: var(--color-deep-slate);
docs/design-prototype/styles.css:56:  /* --- Border tokens --- */
docs/design-prototype/styles.css:57:  --border-subtle: var(--color-charcoal-grey);
docs/design-prototype/styles.css:58:  --border-strong: var(--color-muted-ash);
docs/design-prototype/styles.css:59:  --border-selected: var(--color-aether-blue);
docs/design-prototype/styles.css:60:  --focus-ring: var(--color-neon-lime);
docs/design-prototype/styles.css:61:  --focus-ring-danger: var(--color-warning-red);
docs/design-prototype/styles.css:63:  /* --- Status tokens (Reporter-facing VOC status) --- */
docs/design-prototype/styles.css:64:  --status-reporter-received: var(--color-cyan-spark);    /* 접수됨 */
docs/design-prototype/styles.css:65:  --status-reporter-reviewing: var(--color-aether-blue);  /* 검토 중 */
docs/design-prototype/styles.css:66:  --status-reporter-assigned: var(--color-deep-violet);   /* 담당자 배정됨 */
docs/design-prototype/styles.css:67:  --status-reporter-progress: var(--color-amethyst);      /* 처리 중 */
docs/design-prototype/styles.css:68:  --status-reporter-prep: var(--color-amber);             /* 해결 준비 중 */
docs/design-prototype/styles.css:69:  --status-reporter-resolved: var(--color-emerald);       /* 해결됨 */
docs/design-prototype/styles.css:70:  --status-reporter-reopened: var(--color-warning-red);   /* 다시 처리 중 */
docs/design-prototype/styles.css:71:  --status-reporter-closed: var(--color-fog-grey);        /* 종료됨 */
docs/design-prototype/styles.css:73:  /* --- Status tokens (Internal Task status) --- */
docs/design-prototype/styles.css:74:  --status-internal-backlog: var(--color-fog-grey);
docs/design-prototype/styles.css:75:  --status-internal-todo: var(--color-storm-cloud);
docs/design-prototype/styles.css:76:  --status-internal-doing: var(--color-aether-blue);
docs/design-prototype/styles.css:77:  --status-internal-review: var(--color-amethyst);
docs/design-prototype/styles.css:78:  --status-internal-done: var(--color-emerald);
docs/design-prototype/styles.css:79:  --status-internal-released: var(--color-cyan-spark);
docs/design-prototype/styles.css:80:  --status-internal-reopened: var(--color-warning-red);
docs/design-prototype/styles.css:82:  /* --- Severity / signal tokens --- */
docs/design-prototype/styles.css:83:  --severity-low: var(--color-storm-cloud);
docs/design-prototype/styles.css:84:  --severity-medium: var(--color-amber);
docs/design-prototype/styles.css:85:  --severity-high: #f08a4a;
docs/design-prototype/styles.css:86:  --severity-critical: var(--color-warning-red);
docs/design-prototype/styles.css:87:  --confidence-low: var(--color-storm-cloud);
docs/design-prototype/styles.css:88:  --confidence-medium: var(--color-cyan-spark);
docs/design-prototype/styles.css:89:  --confidence-high: var(--color-emerald);
docs/design-prototype/styles.css:91:  /* --- Layout tokens --- */
docs/design-prototype/styles.css:92:  --sidebar-width: 240px;
docs/design-prototype/styles.css:93:  --sidebar-width-collapsed: 56px;
docs/design-prototype/styles.css:94:  --rail-width: 52px;
docs/design-prototype/styles.css:95:  --detail-panel-width: 440px;
docs/design-prototype/styles.css:96:  --toolbar-height: 50px;
docs/design-prototype/styles.css:97:  --topbar-height: 50px;
docs/design-prototype/styles.css:98:  --row-height-compact: 44px;
docs/design-prototype/styles.css:99:  --row-height-default: 60px;
docs/design-prototype/styles.css:100:  --row-height-expanded: 96px;
docs/design-prototype/styles.css:101:  --badge-height: 20px;
docs/design-prototype/styles.css:102:  --icon-size-sm: 12px;
docs/design-prototype/styles.css:103:  --icon-size-md: 16px;
docs/design-prototype/styles.css:104:  --icon-size-lg: 20px;
docs/design-prototype/styles.css:106:  /* --- Spacing (DESIGN.md scale) --- */
docs/design-prototype/styles.css:107:  --spacing-4: 4px;
docs/design-prototype/styles.css:108:  --spacing-8: 8px;
docs/design-prototype/styles.css:109:  --spacing-12: 12px;
docs/design-prototype/styles.css:110:  --spacing-16: 16px;
docs/design-prototype/styles.css:111:  --spacing-20: 20px;
docs/design-prototype/styles.css:112:  --spacing-24: 24px;
docs/design-prototype/styles.css:113:  --spacing-28: 28px;
docs/design-prototype/styles.css:114:  --spacing-32: 32px;
docs/design-prototype/styles.css:115:  --spacing-36: 36px;
docs/design-prototype/styles.css:116:  --spacing-40: 40px;
docs/design-prototype/styles.css:117:  --spacing-48: 48px;
docs/design-prototype/styles.css:118:  --spacing-64: 64px;
docs/design-prototype/styles.css:120:  /* --- Radius --- */
docs/design-prototype/styles.css:121:  --radius-sm: 2px;
docs/design-prototype/styles.css:122:  --radius-md: 6px;
docs/design-prototype/styles.css:123:  --radius-lg: 8px;
docs/design-prototype/styles.css:124:  --radius-xl: 12px;
docs/design-prototype/styles.css:125:  --radius-pill: 9999px;
docs/design-prototype/styles.css:127:  /* --- Shadows --- */
docs/design-prototype/styles.css:128:  --shadow-sm: rgba(16, 24, 40, 0.06) 0px 2px 4px 0px;
docs/design-prototype/styles.css:129:  --shadow-md: rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset;
docs/design-prototype/styles.css:130:  --shadow-subtle: rgb(213, 224, 244) 0px 0px 0px 1px inset;
docs/design-prototype/styles.css:131:  --shadow-subtle-2: rgba(20, 40, 160, 0.10) 0px 0px 0px 1px;
docs/design-prototype/styles.css:132:  --shadow-xl: rgba(20, 40, 160, 0.12) 0px 12px 36px 0px;
docs/design-prototype/styles.css:133:  --shadow-focus: 0 0 0 2px #ffffff, 0 0 0 4px var(--color-neon-lime);
docs/design-prototype/styles.css:135:  /* --- Typography --- */
docs/design-prototype/styles.css:136:  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
docs/design-prototype/styles.css:137:  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
docs/design-prototype/styles.css:139:  --text-caption: 10px;
docs/design-prototype/styles.css:140:  --text-tiny: 11px;
docs/design-prototype/styles.css:141:  --text-xs: 12px;
docs/design-prototype/styles.css:142:  --text-sm: 13px;
docs/design-prototype/styles.css:143:  --text-body: 14px;
docs/design-prototype/styles.css:144:  --text-md: 15px;
docs/design-prototype/styles.css:145:  --text-lg: 17px;
docs/design-prototype/styles.css:146:  --text-xl: 20px;
docs/design-prototype/styles.css:147:  --text-heading: 24px;
docs/design-prototype/styles.css:148:  --text-heading-lg: 32px;
docs/design-prototype/styles.css:149:  --text-display: 48px;
docs/design-prototype/styles.css:151:  --leading-tight: 1.2;
docs/design-prototype/styles.css:152:  --leading-normal: 1.4;
docs/design-prototype/styles.css:153:  --leading-relaxed: 1.6;
docs/design-prototype/styles.css:155:  --tracking-tight: -0.22px;
docs/design-prototype/styles.css:156:  --tracking-normal: -0.13px;
docs/design-prototype/styles.css:157:  --tracking-wide: 0.04em;
docs/design-prototype/styles.css:174:  font-family: var(--font-sans);
docs/design-prototype/styles.css:175:  font-size: var(--text-body);
docs/design-prototype/styles.css:176:  line-height: var(--leading-normal);
docs/design-prototype/styles.css:177:  letter-spacing: var(--tracking-normal);
docs/design-prototype/styles.css:178:  color: var(--text-primary);
docs/design-prototype/styles.css:179:  background: var(--surface-canvas);
docs/design-prototype/styles.css:192:  color: var(--text-primary);
docs/design-prototype/styles.css:194:    radial-gradient(circle at 20% 0%, rgba(20, 40, 160, 0.08), transparent 32%),
docs/design-prototype/styles.css:195:    var(--surface-canvas);
docs/design-prototype/styles.css:199:  color: var(--text-secondary);
docs/design-prototype/styles.css:207:.runtime-fallback--overlay {
docs/design-prototype/styles.css:215:  border: 1px solid var(--border-strong);
docs/design-prototype/styles.css:217:  box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:220:.runtime-fallback--overlay pre {
docs/design-prototype/styles.css:226:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:227:  font-size: var(--text-xs);
docs/design-prototype/styles.css:236:  letter-spacing: var(--tracking-tight);
docs/design-prototype/styles.css:241:  color: var(--text-secondary);
docs/design-prototype/styles.css:250:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:252:  color: var(--text-primary);
docs/design-prototype/styles.css:253:  background: var(--surface-raised);
docs/design-prototype/styles.css:284:  background: #b8c4d6;
docs/design-prototype/styles.css:285:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:286:  border: 2px solid var(--surface-canvas);
docs/design-prototype/styles.css:289:  background: #94a3b8;
docs/design-prototype/styles.css:297:  grid-template-columns: var(--rail-width) var(--sidebar-width) 1fr;
docs/design-prototype/styles.css:299:  background: var(--surface-canvas);
docs/design-prototype/styles.css:304:  grid-template-columns: var(--rail-width) var(--sidebar-width) 1fr var(--detail-panel-width);
docs/design-prototype/styles.css:309:  grid-template-columns: var(--rail-width) var(--sidebar-width) 1fr;
docs/design-prototype/styles.css:312:/* Pack 12 — Panel fullscreen.
docs/design-prototype/styles.css:317:  grid-template-columns: var(--rail-width) var(--sidebar-width) 0 1fr;
docs/design-prototype/styles.css:335:  background: var(--surface-popover);
docs/design-prototype/styles.css:336:  border: 1px solid var(--border-strong);
docs/design-prototype/styles.css:339:  box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:341:  font-size: var(--text-sm);
docs/design-prototype/styles.css:342:  color: var(--text-primary);
docs/design-prototype/styles.css:345:.toast.tone-success { box-shadow: inset 0 0 0 1px rgba(39,166,68,0.4), var(--shadow-xl); }
docs/design-prototype/styles.css:346:.toast.tone-warn    { box-shadow: inset 0 0 0 1px rgba(255,193,74,0.4), var(--shadow-xl); }
docs/design-prototype/styles.css:347:.toast.tone-danger  { box-shadow: inset 0 0 0 1px rgba(255,90,95,0.4), var(--shadow-xl); }
docs/design-prototype/styles.css:356:  background: var(--surface-popover);
docs/design-prototype/styles.css:357:  border: 1px solid var(--border-strong);
docs/design-prototype/styles.css:359:  box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:370:  color: var(--text-muted);
docs/design-prototype/styles.css:378:  font-size: var(--text-sm);
docs/design-prototype/styles.css:379:  color: var(--text-primary);
docs/design-prototype/styles.css:382:.popover-item:hover { background: var(--surface-row-hover); }
docs/design-prototype/styles.css:386:  box-shadow: inset 0 0 0 1px var(--border-strong);
docs/design-prototype/styles.css:390:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:392:  color: var(--text-on-accent);
docs/design-prototype/styles.css:397:  box-shadow: inset 0 0 0 1px var(--border-strong);
docs/design-prototype/styles.css:404:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:407:  height: 1px; background: var(--border-subtle); margin: 4px 0;
docs/design-prototype/styles.css:415:  font-size: var(--text-xs);
docs/design-prototype/styles.css:416:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:417:  background: rgba(20, 40, 160,0.14);
docs/design-prototype/styles.css:418:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:428:/* --- Global rail (system selector) --- */
docs/design-prototype/styles.css:434:  background: #e7f0ff;
docs/design-prototype/styles.css:435:  border-right: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:441:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:442:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:443:  color: var(--text-on-accent);
docs/design-prototype/styles.css:454:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:457:  color: var(--text-muted);
docs/design-prototype/styles.css:465:  background: var(--color-graphite);
docs/design-prototype/styles.css:466:  color: var(--text-primary);
docs/design-prototype/styles.css:469:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:470:  color: var(--text-primary);
docs/design-prototype/styles.css:479:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:480:  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
docs/design-prototype/styles.css:486:  background: var(--border-subtle);
docs/design-prototype/styles.css:492:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:493:  background: var(--color-aether-blue);
docs/design-prototype/styles.css:501:/* --- Sidebar --- */
docs/design-prototype/styles.css:503:  background: var(--surface-sidebar);
docs/design-prototype/styles.css:504:  border-right: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:513:  min-height: var(--topbar-height);
docs/design-prototype/styles.css:515:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:521:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:522:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:525:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:527:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:536:  font-size: var(--text-sm);
docs/design-prototype/styles.css:538:  color: var(--text-primary);
docs/design-prototype/styles.css:542:  font-size: var(--text-caption);
docs/design-prototype/styles.css:543:  color: var(--text-muted);
docs/design-prototype/styles.css:549:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:556:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:557:  background: var(--color-graphite);
docs/design-prototype/styles.css:558:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:563:.scope-switcher:hover { background: var(--color-deep-slate); }
docs/design-prototype/styles.css:567:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:568:  background: var(--color-aether-blue);
docs/design-prototype/styles.css:577:  font-size: var(--text-sm);
docs/design-prototype/styles.css:579:  color: var(--text-primary);
docs/design-prototype/styles.css:586:  color: var(--text-muted);
docs/design-prototype/styles.css:597:  font-size: var(--text-caption);
docs/design-prototype/styles.css:600:  letter-spacing: var(--tracking-wide);
docs/design-prototype/styles.css:601:  color: var(--text-disabled);
docs/design-prototype/styles.css:610:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:611:  color: var(--text-muted);
docs/design-prototype/styles.css:612:  font-size: var(--text-sm);
docs/design-prototype/styles.css:619:  background: var(--color-graphite);
docs/design-prototype/styles.css:620:  color: var(--text-primary);
docs/design-prototype/styles.css:623:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:624:  color: var(--text-primary);
docs/design-prototype/styles.css:627:.nav-item.active .nav-icon { color: var(--text-primary); }
docs/design-prototype/styles.css:633:  color: var(--text-muted);
docs/design-prototype/styles.css:646:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:647:  background: var(--color-charcoal-grey);
docs/design-prototype/styles.css:648:  color: var(--text-muted);
docs/design-prototype/styles.css:649:  font-size: var(--text-caption);
docs/design-prototype/styles.css:656:  background: rgba(235, 87, 87, 0.15);
docs/design-prototype/styles.css:657:  color: var(--color-warning-red);
docs/design-prototype/styles.css:660:  background: rgba(20, 40, 160, 0.12);
docs/design-prototype/styles.css:661:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:665:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:680:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:695:/* --- Main region --- */
docs/design-prototype/styles.css:699:  background: var(--surface-canvas);
docs/design-prototype/styles.css:704:  height: var(--topbar-height);
docs/design-prototype/styles.css:709:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:716:  font-size: var(--text-sm);
docs/design-prototype/styles.css:717:  color: var(--text-muted);
docs/design-prototype/styles.css:720:  color: var(--text-primary);
docs/design-prototype/styles.css:730:  font-family: var(--font-mono);
docs/design-prototype/styles.css:733:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:734:  background: var(--color-charcoal-grey);
docs/design-prototype/styles.css:735:  color: var(--text-muted);
docs/design-prototype/styles.css:736:  border: 1px solid var(--color-muted-ash);
docs/design-prototype/styles.css:775:  font-size: var(--text-xl);
docs/design-prototype/styles.css:777:  letter-spacing: var(--tracking-tight);
docs/design-prototype/styles.css:779:  color: var(--text-primary);
docs/design-prototype/styles.css:782:  font-size: var(--text-sm);
docs/design-prototype/styles.css:783:  color: var(--text-muted);
docs/design-prototype/styles.css:795:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:796:  background: var(--surface-canvas);
docs/design-prototype/styles.css:804:  min-height: var(--toolbar-height);
docs/design-prototype/styles.css:823:    var(--surface-canvas) 12px,
docs/design-prototype/styles.css:824:    var(--surface-canvas) 100%
docs/design-prototype/styles.css:835:  background: rgba(20, 40, 160, 0.16);
docs/design-prototype/styles.css:852:  background: var(--surface-popover);
docs/design-prototype/styles.css:853:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:855:  box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:865:/* Live-data ping for LiveTimestamp/LiveCount (Pack 10) */
docs/design-prototype/styles.css:867:  0%   { box-shadow: 0 0 0 0   rgba(39,166,68,0.55); }
docs/design-prototype/styles.css:868:  70%  { box-shadow: 0 0 0 6px rgba(39,166,68,0);    }
docs/design-prototype/styles.css:869:  100% { box-shadow: 0 0 0 0   rgba(39,166,68,0);    }
docs/design-prototype/styles.css:876:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:883:  color: var(--text-primary);
docs/design-prototype/styles.css:887:.cmdk-input::placeholder { color: var(--text-muted); }
docs/design-prototype/styles.css:901:  color: var(--text-muted);
docs/design-prototype/styles.css:915:  color: var(--text-primary);
docs/design-prototype/styles.css:918:  background: rgba(20, 40, 160, 0.08);
docs/design-prototype/styles.css:919:  box-shadow: 0 0 0 1px rgba(20, 40, 160, 0.28) inset;
docs/design-prototype/styles.css:924:  background: var(--surface-card);
docs/design-prototype/styles.css:926:  color: var(--text-secondary);
docs/design-prototype/styles.css:929:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:936:  color: var(--text-muted);
docs/design-prototype/styles.css:940:  color: var(--text-primary);
docs/design-prototype/styles.css:948:  color: var(--text-muted);
docs/design-prototype/styles.css:959:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:960:  background: var(--surface-canvas);
docs/design-prototype/styles.css:973:  border-bottom-color: rgba(20, 40, 160, 0.5);
docs/design-prototype/styles.css:974:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:980:  background: var(--surface-popover);
docs/design-prototype/styles.css:981:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:983:  box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:997:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:998:  background: var(--surface-canvas);
docs/design-prototype/styles.css:1006:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1007:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1008:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1013:  box-shadow: 0 0 0 1px var(--color-neon-lime, currentColor) inset;
docs/design-prototype/styles.css:1021:  background: var(--color-graphite);
docs/design-prototype/styles.css:1022:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1029:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1030:  background: var(--color-graphite);
docs/design-prototype/styles.css:1040:  color: var(--text-muted);
docs/design-prototype/styles.css:1045:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:1046:  color: var(--text-primary);
docs/design-prototype/styles.css:1049:  background: rgba(20, 40, 160, 0.14);
docs/design-prototype/styles.css:1050:  color: var(--color-neon-lime);
docs/design-prototype/styles.css:1055:  color: var(--text-primary);
docs/design-prototype/styles.css:1061:  color: var(--text-disabled);
docs/design-prototype/styles.css:1064:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:1067:  font-family: var(--font-mono);
docs/design-prototype/styles.css:1075:  color: var(--color-aether-blue);
docs/design-prototype/styles.css:1083:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1084:  background: var(--surface-canvas);
docs/design-prototype/styles.css:1092:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:1093:  color: var(--text-secondary);
docs/design-prototype/styles.css:1095:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1102:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1103:  background: var(--surface-popover);
docs/design-prototype/styles.css:1107:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:1108:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1111:  color: var(--text-primary);
docs/design-prototype/styles.css:1115:.rte-link-input:focus { border-color: var(--color-neon-lime); }
docs/design-prototype/styles.css:1118:  background: var(--color-graphite);
docs/design-prototype/styles.css:1119:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1128:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1129:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1130:  color: var(--text-muted);
docs/design-prototype/styles.css:1140:.tab:hover { background: var(--color-graphite); color: var(--text-primary); }
docs/design-prototype/styles.css:1142:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:1143:  color: var(--text-primary);
docs/design-prototype/styles.css:1146:  font-size: var(--text-tiny);
docs/design-prototype/styles.css:1147:  color: var(--text-muted);
docs/design-prototype/styles.css:1150:.tab.active .tab-count { color: var(--text-secondary); }
docs/design-prototype/styles.css:1156:  background: var(--border-subtle);
docs/design-prototype/styles.css:1170:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1171:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1173:  letter-spacing: var(--tracking-normal);
docs/design-prototype/styles.css:1180:  box-shadow: var(--shadow-focus);
docs/design-prototype/styles.css:1183:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:1184:  color: var(--text-on-accent);
docs/design-prototype/styles.css:1187:.btn-primary:hover { background: #0b57d0; }
docs/design-prototype/styles.css:1188:.btn-primary:active { background: #1428a0; }
docs/design-prototype/styles.css:1191:  background: var(--color-graphite);
docs/design-prototype/styles.css:1192:  color: var(--text-primary);
docs/design-prototype/styles.css:1193:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1195:.btn-secondary:hover { background: var(--color-deep-slate); }
docs/design-prototype/styles.css:1199:  color: var(--text-secondary);
docs/design-prototype/styles.css:1202:  background: var(--color-graphite);
docs/design-prototype/styles.css:1203:  color: var(--text-primary);
docs/design-prototype/styles.css:1208:  color: var(--text-muted);
docs/design-prototype/styles.css:1211:  background: var(--color-graphite);
docs/design-prototype/styles.css:1212:  color: var(--text-primary);
docs/design-prototype/styles.css:1217:  color: var(--text-danger);
docs/design-prototype/styles.css:1218:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1221:  background: rgba(235, 87, 87, 0.1);
docs/design-prototype/styles.css:1224:.btn-lg { height: 32px; padding: 0 14px; font-size: var(--text-body); }
docs/design-prototype/styles.css:1225:.btn-sm { height: 24px; padding: 0 8px; font-size: var(--text-xs); }
docs/design-prototype/styles.css:1239:  height: var(--badge-height);
docs/design-prototype/styles.css:1241:  border-radius: var(--radius-badges, 4px);
docs/design-prototype/styles.css:1242:  font-size: var(--text-tiny);
docs/design-prototype/styles.css:1245:  background: var(--color-gunmetal);
docs/design-prototype/styles.css:1246:  color: var(--text-muted);
docs/design-prototype/styles.css:1253:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1260:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1262:  background: rgba(20, 40, 160, 0.04);
docs/design-prototype/styles.css:1263:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1269:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:1271:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1272:  color: var(--text-secondary);
docs/design-prototype/styles.css:1277:.badge-severity.severity-low { color: var(--severity-low); background: rgba(138, 143, 152, 0.1); }
docs/design-prototype/styles.css:1278:.badge-severity.severity-medium { color: var(--severity-medium); background: rgba(242, 196, 109, 0.12); }
docs/design-prototype/styles.css:1279:.badge-severity.severity-high { color: var(--severity-high); background: rgba(240, 138, 74, 0.14); }
docs/design-prototype/styles.css:1280:.badge-severity.severity-critical { color: var(--severity-critical); background: rgba(235, 87, 87, 0.14); }
docs/design-prototype/styles.css:1283:.badge-confidence.confidence-low { color: var(--confidence-low); }
docs/design-prototype/styles.css:1284:.badge-confidence.confidence-medium { color: var(--confidence-medium); }
docs/design-prototype/styles.css:1285:.badge-confidence.confidence-high { color: var(--confidence-high); }
docs/design-prototype/styles.css:1288:.badge-blocked { color: var(--text-danger); background: rgba(235, 87, 87, 0.08); }
docs/design-prototype/styles.css:1289:.badge-internal-only { color: var(--text-muted); background: rgba(138, 143, 152, 0.1); }
docs/design-prototype/styles.css:1290:.badge-public { color: var(--color-cyan-spark); background: rgba(2, 184, 204, 0.1); }
docs/design-prototype/styles.css:1310:  min-height: var(--toolbar-height);
docs/design-prototype/styles.css:1312:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1313:  background: var(--surface-canvas);
docs/design-prototype/styles.css:1332:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1334:  color: var(--text-primary);
docs/design-prototype/styles.css:1342:  min-height: var(--row-height-default);
docs/design-prototype/styles.css:1344:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1350:  min-height: var(--row-height-compact);
docs/design-prototype/styles.css:1354:  min-height: var(--row-height-expanded);
docs/design-prototype/styles.css:1358:  background: var(--surface-row-hover);
docs/design-prototype/styles.css:1361:  background: var(--surface-row-selected);
docs/design-prototype/styles.css:1370:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:1376:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:1377:  border: 1px solid var(--border-strong);
docs/design-prototype/styles.css:1382:  color: var(--text-on-accent);
docs/design-prototype/styles.css:1385:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:1386:  border-color: var(--color-neon-lime);
docs/design-prototype/styles.css:1392:  color: var(--text-muted);
docs/design-prototype/styles.css:1403:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1405:  color: var(--text-primary);
docs/design-prototype/styles.css:1414:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1415:  color: var(--text-muted);
docs/design-prototype/styles.css:1425:  background: var(--color-fog-grey);
docs/design-prototype/styles.css:1437:  font-family: var(--font-mono);
docs/design-prototype/styles.css:1438:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1439:  color: var(--text-disabled);
docs/design-prototype/styles.css:1446:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1459:  background: var(--surface-detail);
docs/design-prototype/styles.css:1460:  border-left: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1466:  height: var(--topbar-height);
docs/design-prototype/styles.css:1471:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1475:  min-height: var(--topbar-height);
docs/design-prototype/styles.css:1480:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1484:  font-family: var(--font-mono);
docs/design-prototype/styles.css:1485:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1486:  color: var(--text-muted);
docs/design-prototype/styles.css:1507:  background: color-mix(in oklch, var(--surface-detail) 94%, white);
docs/design-prototype/styles.css:1508:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1523:  color: var(--text-muted);
docs/design-prototype/styles.css:1525:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1530:  color: var(--text-secondary);
docs/design-prototype/styles.css:1533:  border-bottom-color: var(--color-neon-lime);
docs/design-prototype/styles.css:1534:  color: var(--text-primary);
docs/design-prototype/styles.css:1539:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1540:  color: var(--text-muted);
docs/design-prototype/styles.css:1548:  font-size: var(--text-tiny);
docs/design-prototype/styles.css:1551:  letter-spacing: var(--tracking-wide);
docs/design-prototype/styles.css:1552:  color: var(--text-muted);
docs/design-prototype/styles.css:1562:  font-size: var(--text-lg);
docs/design-prototype/styles.css:1564:  letter-spacing: var(--tracking-tight);
docs/design-prototype/styles.css:1565:  color: var(--text-primary);
docs/design-prototype/styles.css:1570:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1571:  color: var(--text-muted);
docs/design-prototype/styles.css:1580:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1583:  color: var(--text-muted);
docs/design-prototype/styles.css:1586:  color: var(--text-primary);
docs/design-prototype/styles.css:1594:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1598:  background: var(--surface-detail);
docs/design-prototype/styles.css:1606:  background: var(--surface-card);
docs/design-prototype/styles.css:1607:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1608:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1612:  background: var(--surface-card-elevated);
docs/design-prototype/styles.css:1613:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1616:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1617:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1625:  background: var(--surface-card);
docs/design-prototype/styles.css:1626:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1627:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1635:  box-shadow: rgb(47, 71, 120) 0px 0px 0px 1px inset;
docs/design-prototype/styles.css:1644:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1646:  color: var(--text-primary);
docs/design-prototype/styles.css:1648:  letter-spacing: var(--tracking-normal);
docs/design-prototype/styles.css:1651:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1652:  color: var(--text-muted);
docs/design-prototype/styles.css:1657:  font-size: var(--text-heading-lg);
docs/design-prototype/styles.css:1659:  letter-spacing: var(--tracking-tight);
docs/design-prototype/styles.css:1660:  color: var(--text-primary);
docs/design-prototype/styles.css:1664:.action-card-value.urgent { color: var(--text-danger); }
docs/design-prototype/styles.css:1665:.action-card-value.warn { color: var(--text-warning); }
docs/design-prototype/styles.css:1666:.action-card-value.good { color: var(--text-success); }
docs/design-prototype/styles.css:1673:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1691:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1692:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1697:.entity-node:hover { background: var(--surface-row-hover); }
docs/design-prototype/styles.css:1701:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:1706:  color: var(--text-primary);
docs/design-prototype/styles.css:1707:  background: var(--color-charcoal-grey);
docs/design-prototype/styles.css:1716:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1718:  color: var(--text-primary);
docs/design-prototype/styles.css:1724:  font-size: var(--text-caption);
docs/design-prototype/styles.css:1725:  color: var(--text-muted);
docs/design-prototype/styles.css:1729:  border: 1px dashed var(--border-strong);
docs/design-prototype/styles.css:1733:  border-color: var(--color-neon-lime);
docs/design-prototype/styles.css:1737:  border: 1px dashed var(--border-strong);
docs/design-prototype/styles.css:1738:  color: var(--text-muted);
docs/design-prototype/styles.css:1743:  background: var(--border-strong);
docs/design-prototype/styles.css:1751:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1752:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1754:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1760:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1761:  color: var(--text-primary);
docs/design-prototype/styles.css:1764:  border-left: 2px solid var(--color-aether-blue);
docs/design-prototype/styles.css:1768:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1769:  color: var(--text-secondary);
docs/design-prototype/styles.css:1776:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1777:  color: var(--text-muted);
docs/design-prototype/styles.css:1787:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1788:  background: var(--surface-field-filled);
docs/design-prototype/styles.css:1789:  color: var(--text-primary);
docs/design-prototype/styles.css:1791:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1792:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1798:  border-color: var(--color-aether-blue);
docs/design-prototype/styles.css:1806:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1807:  background: var(--surface-field-filled);
docs/design-prototype/styles.css:1808:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1809:  color: var(--text-muted);
docs/design-prototype/styles.css:1810:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1818:  color: var(--text-primary);
docs/design-prototype/styles.css:1819:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1822:.search-input input::placeholder { color: var(--text-muted); }
docs/design-prototype/styles.css:1830:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1833:.severity-indicator.severity-low { background: var(--severity-low); }
docs/design-prototype/styles.css:1834:.severity-indicator.severity-medium { background: var(--severity-medium); }
docs/design-prototype/styles.css:1835:.severity-indicator.severity-high { background: var(--severity-high); }
docs/design-prototype/styles.css:1836:.severity-indicator.severity-critical { background: var(--severity-critical); }
docs/design-prototype/styles.css:1844:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1871:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1872:  border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1873:  background: rgba(255, 255, 255, 0.01);
docs/design-prototype/styles.css:1880:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:1884:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1886:  color: var(--text-primary);
docs/design-prototype/styles.css:1890:  font-size: var(--text-tiny);
docs/design-prototype/styles.css:1891:  color: var(--text-muted);
docs/design-prototype/styles.css:1903:  background: var(--surface-card);
docs/design-prototype/styles.css:1904:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1906:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1914:  box-shadow: rgb(47, 71, 120) 0px 0px 0px 1px inset;
docs/design-prototype/styles.css:1917:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1919:  color: var(--text-primary);
docs/design-prototype/styles.css:1927:  color: var(--text-muted);
docs/design-prototype/styles.css:1928:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1931:  font-family: var(--font-mono);
docs/design-prototype/styles.css:1932:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1933:  color: var(--text-disabled);
docs/design-prototype/styles.css:1941:  background: var(--color-charcoal-grey);
docs/design-prototype/styles.css:1942:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1948:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:1949:  background: var(--color-aether-blue);
docs/design-prototype/styles.css:1951:.coverage-bar-fill.good { background: var(--color-emerald); }
docs/design-prototype/styles.css:1952:.coverage-bar-fill.warn { background: var(--color-amber); }
docs/design-prototype/styles.css:1953:.coverage-bar-fill.bad { background: var(--color-warning-red); }
docs/design-prototype/styles.css:1978:  font-size: var(--text-xs);
docs/design-prototype/styles.css:1979:  color: var(--text-muted);
docs/design-prototype/styles.css:1982:  color: var(--text-primary);
docs/design-prototype/styles.css:1986:  font-size: var(--text-sm);
docs/design-prototype/styles.css:1987:  color: var(--text-secondary);
docs/design-prototype/styles.css:1990:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:1991:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:1992:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:1995:  border-left: 2px solid var(--color-neon-lime);
docs/design-prototype/styles.css:1998:  background: rgba(49, 87, 213, 0.06);
docs/design-prototype/styles.css:1999:  border-left: 2px solid var(--color-deep-violet);
docs/design-prototype/styles.css:2002:  border-left: 2px solid var(--color-cyan-spark);
docs/design-prototype/styles.css:2009:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2010:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2011:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2016:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:2017:  background: var(--color-graphite);
docs/design-prototype/styles.css:2022:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2024:  color: var(--text-muted);
docs/design-prototype/styles.css:2028:.composer-tab:hover { color: var(--text-primary); }
docs/design-prototype/styles.css:2030:  color: var(--text-primary);
docs/design-prototype/styles.css:2031:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2033:.composer-tab.active.public { border-bottom-color: var(--color-neon-lime); }
docs/design-prototype/styles.css:2034:.composer-tab.active.reply { border-bottom-color: var(--color-cyan-spark); }
docs/design-prototype/styles.css:2035:.composer-tab.active.internal { border-bottom-color: var(--color-deep-violet); }
docs/design-prototype/styles.css:2042:  border-bottom: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:2047:  border-radius: var(--radius-sm);
docs/design-prototype/styles.css:2050:  color: var(--text-muted);
docs/design-prototype/styles.css:2054:  background: var(--color-graphite);
docs/design-prototype/styles.css:2055:  color: var(--text-primary);
docs/design-prototype/styles.css:2060:  font-size: var(--text-sm);
docs/design-prototype/styles.css:2061:  color: var(--text-secondary);
docs/design-prototype/styles.css:2066:  color: var(--text-disabled);
docs/design-prototype/styles.css:2074:  border-top: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:2075:  background: var(--color-graphite);
docs/design-prototype/styles.css:2081:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2082:  color: var(--text-muted);
docs/design-prototype/styles.css:2090:  font-size: var(--text-sm);
docs/design-prototype/styles.css:2092:  color: var(--text-secondary);
docs/design-prototype/styles.css:2103:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2104:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2105:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2106:  font-size: var(--text-sm);
docs/design-prototype/styles.css:2107:  color: var(--text-secondary);
docs/design-prototype/styles.css:2111:.ms-chip:hover { background: var(--surface-row-hover); }
docs/design-prototype/styles.css:2113:  background: rgba(20, 40, 160, 0.06);
docs/design-prototype/styles.css:2114:  box-shadow: rgba(20, 40, 160, 0.45) 0px 0px 0px 1px inset;
docs/design-prototype/styles.css:2115:  color: var(--text-primary);
docs/design-prototype/styles.css:2123:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2124:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2125:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2131:.source-radio:hover { box-shadow: rgb(47, 71, 120) 0px 0px 0px 1px inset; }
docs/design-prototype/styles.css:2133:  background: rgba(20, 40, 160, 0.04);
docs/design-prototype/styles.css:2134:  box-shadow: rgba(20, 40, 160, 0.4) 0px 0px 0px 1.5px inset;
docs/design-prototype/styles.css:2140:  border: 1.5px solid var(--border-strong);
docs/design-prototype/styles.css:2145:.source-radio-dot.on { border-color: var(--color-neon-lime); }
docs/design-prototype/styles.css:2151:  background: var(--color-neon-lime);
docs/design-prototype/styles.css:2164:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2165:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2166:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2172:.severity-pick:hover { background: var(--surface-row-hover); }
docs/design-prototype/styles.css:2176:  background: rgba(138, 143, 152, 0.08);
docs/design-prototype/styles.css:2177:  box-shadow: rgba(138, 143, 152, 0.55) 0px 0px 0px 1.5px inset;
docs/design-prototype/styles.css:2180:  background: rgba(242, 196, 109, 0.08);
docs/design-prototype/styles.css:2181:  box-shadow: rgba(242, 196, 109, 0.6) 0px 0px 0px 1.5px inset;
docs/design-prototype/styles.css:2184:  background: rgba(240, 138, 74, 0.1);
docs/design-prototype/styles.css:2185:  box-shadow: rgba(240, 138, 74, 0.65) 0px 0px 0px 1.5px inset;
docs/design-prototype/styles.css:2188:  background: rgba(235, 87, 87, 0.1);
docs/design-prototype/styles.css:2189:  box-shadow: rgba(235, 87, 87, 0.7) 0px 0px 0px 1.5px inset;
docs/design-prototype/styles.css:2192:.severity-pick[data-sev="low"][data-active="true"] .severity-pick-label { color: var(--severity-low); }
docs/design-prototype/styles.css:2193:.severity-pick[data-sev="medium"][data-active="true"] .severity-pick-label { color: var(--severity-medium); }
docs/design-prototype/styles.css:2194:.severity-pick[data-sev="high"][data-active="true"] .severity-pick-label { color: var(--severity-high); }
docs/design-prototype/styles.css:2195:.severity-pick[data-sev="critical"][data-active="true"] .severity-pick-label { color: var(--severity-critical); }
docs/design-prototype/styles.css:2200:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:2204:  font-size: var(--text-sm);
docs/design-prototype/styles.css:2206:  color: var(--text-primary);
docs/design-prototype/styles.css:2212:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2213:  color: var(--text-muted);
docs/design-prototype/styles.css:2222:/* ---- Compact form helpers ---- */
docs/design-prototype/styles.css:2229:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2231:  color: var(--text-secondary);
docs/design-prototype/styles.css:2237:  color: var(--color-warning-red);
docs/design-prototype/styles.css:2247:  background: var(--color-charcoal-grey);
docs/design-prototype/styles.css:2248:  color: var(--text-muted);
docs/design-prototype/styles.css:2253:  background: var(--color-gunmetal);
docs/design-prototype/styles.css:2254:  color: var(--text-primary);
docs/design-prototype/styles.css:2261:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2262:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2263:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2272:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2274:  color: var(--text-muted);
docs/design-prototype/styles.css:2278:.segmented-item:hover { color: var(--text-primary); }
docs/design-prototype/styles.css:2280:  background: var(--color-deep-slate);
docs/design-prototype/styles.css:2281:  color: var(--text-primary);
docs/design-prototype/styles.css:2282:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2291:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2292:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2293:  border: 1px dashed var(--border-strong);
docs/design-prototype/styles.css:2294:  color: var(--text-muted);
docs/design-prototype/styles.css:2300:  border-color: var(--color-aether-blue);
docs/design-prototype/styles.css:2301:  color: var(--text-primary);
docs/design-prototype/styles.css:2308:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2315:.similar-mini:hover { background: var(--surface-row-hover); }
docs/design-prototype/styles.css:2317:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2318:  color: var(--text-primary);
docs/design-prototype/styles.css:2326:  font-size: var(--text-caption);
docs/design-prototype/styles.css:2327:  color: var(--text-muted);
docs/design-prototype/styles.css:2328:  font-family: var(--font-mono);
docs/design-prototype/styles.css:2338:  border-radius: var(--radius-md);
docs/design-prototype/styles.css:2339:  background: var(--color-graphite);
docs/design-prototype/styles.css:2340:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2353:.mono { font-family: var(--font-mono); }
docs/design-prototype/styles.css:2354:.muted { color: var(--text-muted); }
docs/design-prototype/styles.css:2355:.faint { color: var(--text-disabled); }
docs/design-prototype/styles.css:2356:.text-xs { font-size: var(--text-xs); }
docs/design-prototype/styles.css:2357:.text-sm { font-size: var(--text-sm); }
docs/design-prototype/styles.css:2358:.text-lg { font-size: var(--text-lg); }
docs/design-prototype/styles.css:2362:  background: var(--border-subtle);
docs/design-prototype/styles.css:2379:    --sidebar-width: 212px;
docs/design-prototype/styles.css:2383:    grid-template-columns: var(--rail-width) var(--sidebar-width) minmax(0, 1fr) minmax(360px, 42vw);
docs/design-prototype/styles.css:2398:    --rail-width: 48px;
docs/design-prototype/styles.css:2399:    --topbar-height: 48px;
docs/design-prototype/styles.css:2405:    grid-template-columns: var(--rail-width) minmax(0, 1fr);
docs/design-prototype/styles.css:2409:    grid-template-columns: var(--rail-width) minmax(0, 1fr);
docs/design-prototype/styles.css:2432:    left: calc(var(--rail-width) + 8px);
docs/design-prototype/styles.css:2438:    border-radius: var(--radius-md);
docs/design-prototype/styles.css:2439:    color: var(--text-primary);
docs/design-prototype/styles.css:2440:    background: var(--surface-popover);
docs/design-prototype/styles.css:2441:    border: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:2442:    box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:2450:    background: rgba(20, 40, 160, 0.16);
docs/design-prototype/styles.css:2457:    left: var(--rail-width);
docs/design-prototype/styles.css:2460:    width: min(288px, calc(100vw - var(--rail-width) - 16px));
docs/design-prototype/styles.css:2463:    box-shadow: var(--shadow-xl);
docs/design-prototype/styles.css:2494:    border-left: 1px solid var(--border-subtle);
docs/design-prototype/styles.css:2495:    box-shadow: -18px 0 36px rgba(0, 0, 0, 0.42);
docs/design-prototype/styles.css:2580:    --rail-width: 0px;
docs/design-prototype/styles.css:2581:    --row-height-default: 56px;
docs/design-prototype/styles.css:2582:    --row-height-expanded: 88px;
docs/design-prototype/styles.css:2637:    font-size: var(--text-lg);
docs/design-prototype/styles.css:2672:    font-size: var(--text-md);
docs/design-prototype/styles.css:2721:  border-radius: var(--radius-pill);
docs/design-prototype/styles.css:2722:  background: var(--color-pitch-black);
docs/design-prototype/styles.css:2723:  box-shadow: var(--shadow-subtle);
docs/design-prototype/styles.css:2724:  font-size: var(--text-xs);
docs/design-prototype/styles.css:2725:  color: var(--text-secondary);
docs/design-prototype/styles.css:2728:  color: var(--text-primary);

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'rg -n "createRootRoute|Outlet|Router|AppShell|auth|login|TanStack|router|routeTree|alias|@fops|vite|extract|dumb|packages/ui|export|component|rule" apps/frontend/src/routes/__root.tsx apps/frontend/vite.config.ts apps/frontend/AGENTS.md' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
apps/frontend/src/routes/__root.tsx:1:import { Outlet, createRootRoute } from '@tanstack/react-router';
apps/frontend/src/routes/__root.tsx:3:export const Route = createRootRoute({
apps/frontend/src/routes/__root.tsx:4:  component: RootLayout,
apps/frontend/src/routes/__root.tsx:10:      <Outlet />
apps/frontend/AGENTS.md:6:- Use `docs/frontend/ui-design-system.md` for component behavior and layout contracts.
apps/frontend/AGENTS.md:7:- Use `docs/frontend/component-inventory.md` before creating a new shared component.
apps/frontend/AGENTS.md:18:- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/ui`.
apps/frontend/AGENTS.md:27:- Use Role Level labels: Admin, Developer, and User. Backend capability checks remain authoritative.
apps/frontend/AGENTS.md:32:- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
apps/frontend/AGENTS.md:33:- Before creating a new component, check `packages/ui`, the feature's existing components, and `docs/frontend/component-inventory.md`.
apps/frontend/AGENTS.md:34:- Use existing wrappers under `packages/ui/src/ui` before importing shadcn/Radix primitives directly.
apps/frontend/vite.config.ts:2:import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
apps/frontend/vite.config.ts:3:import react from '@vitejs/plugin-react';
apps/frontend/vite.config.ts:4:import { defineConfig } from 'vite';
apps/frontend/vite.config.ts:6:export default defineConfig({
apps/frontend/vite.config.ts:7:  plugins: [TanStackRouterVite(), react()],
apps/frontend/vite.config.ts:9:    alias: {
apps/frontend/vite.config.ts:18:      // Slice 1 #3: auth endpoints + the /me identity probe live at root.
apps/frontend/vite.config.ts:19:      '/auth': 'http://127.0.0.1:3011',

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
I have the plan’s core line anchors now. I’m checking the authority docs and backend/shared contracts next, because most real plan failures here will be contract mismatches rather than missing prose.
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
exec
/bin/zsh -lc 'rg -n "component inventory|Button|Toggle|TipTap|Rich|Dialog|Sheet|Popover|Command|Table|Badge|Textarea|Select|Tabs|Tooltip|Toast|sonner|visual contract|Neon|surface|50px|header|§ 3|## 3|§ 6|## 6" docs/frontend/specs/voc.md' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
4:> Stack: React 18 + TypeScript 5 + Tailwind 3 + shadcn/ui (production), TipTap (rich content, per ADR-0002 / ADR-0011), TanStack Router (production route shell — see `apps/frontend/src/routes/`).
13:- **Create VOC** — `/vocs?action=create` form, including attachments dropzone, MS / AA pickers, `voc-description` rich editor surface.
14:- **VOC Inbox** — `/vocs?view=inbox` list-first + RightDetailPanel, with tab filters (Untriaged / High / Unassigned / Similar / No-link), `<ListFilterButton>`, `<ListSortButton>`, bulk-select toolbar.
17:- **VOC Detail Panel** — identity, triage block, description (TipTap read render), linked-execution section, linked-entity trail, public timeline, internal timeline, three-tab composer (Public Update / Reporter Reply / Internal Comment), Reporter-facing status change block, composer preview modal, sticky next-action footer.
42:| Operational safety (rate-limit, idempotency, headers) | `docs/adr/0015-operational-safety-rate-limit-headers-migrations-idempotency.md` |
43:| Rich editor + attachment storage | `docs/adr/0002-use-wysiwyg-first-rich-content-editor.md`, `docs/adr/0011-rich-content-editor-and-attachment-storage.md` |
58:| R-VOC-INBOX | `/vocs?view=inbox` | `apps/frontend/src/features/voc/routes/InboxRoute.tsx` → `<VocInboxScreen>` | `view=inbox` | `managedSystem=:msId\|all`, `selected=:vocId`, `tab=untriaged\|high\|unassigned\|similar\|no-link`, `filter.severity=…`, `filter.reporterStatus=…`, `filter.owner=assigned\|unassigned`, `sort=createdAt:desc\|severity:asc\|status:asc` | `<VocDetailPanel>` when `selected=` resolves | Skeleton rows (10) in `<VocList>`; detail panel skeleton sections | "큐가 비었습니다" — `<EmptyState>` with `+ New VOC` CTA | Toast on list fetch fail; `<ErrorState>` row with retry | If actor has no VOC read capability for any MS in scope → render `<PermissionBlockedPanel state="blocked_not_requestable">` instead of the list |
60:| R-VOC-TRIAGE | `/vocs?view=triage` | `apps/frontend/src/features/voc/routes/TriageRoute.tsx` → `<VocTriageScreen>` | `view=triage` | `triage=unassigned\|untriaged\|high\|waiting`, `managedSystem=:msId\|all`, `selected=:vocId` | `<TriagePanel>` (always — single-pane decision flow) | Skeleton expanded rows + panel skeleton | "모든 VOC를 triage 처리했습니다" — `<TriageEmpty>` | Toast on per-action failure; rollback optimistic state | Requires VOC triage capability (Admin or same-MS Developer). Out-of-scope VOCs surface a `<PermissionBlockedPanel state="summary_visible">` peek above the queue per backend `out_of_scope_summary` envelope. |
76:## 3. Component Mapping
80:### 3.1 Detail / panel scaffolding
82:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
84:| `<DetailPanelHeader kind="voc" id … extras>` | `<DetailPanelHeader>` in `packages/ui/src/panel/` (custom — no shadcn equivalent) | none (Tailwind + `lucide-react` for icons) | `kind: 'voc' \| 'finding' \| 'task' \| ...10 kinds`, `id: string`, `onClose: () => void`, `extras?: ReactNode` | One color band per kind, bound to `--surface-card-elevated` + kind-specific accent token (voc uses `--color-aether-blue` accent stripe) |
90:| `<DetailPanelHeaderActions entityKind entityId copyHash extraMore?>` | `<DetailPanelHeaderActions>` in `packages/ui/src/panel/` | shadcn `<DropdownMenu>` for kebab, `<Tooltip>` for icon buttons | `entityKind: string` (display name), `entityId: string`, `copyHash: string` (production receives `copyUrl: string` instead), `extraMore?: MoreItem[]` | Default; "copied" toast state after clipboard write |
93:### 3.2 List + toolbar
95:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
97:| `<VocList>` + `<VocRow>` | `<VocList>` + `<VocRow>` in `features/voc/components/list/` | none (Tailwind grid, `<Checkbox>` from shadcn for row checkbox) | `vocs: VocListItem[]`, `selectedId: string \| null`, `onSelect: (id) => void`, `checked: Set<string>`, `onToggleCheck: (id) => void` | default · hover · selected · checked · permission-limited (row body replaced by `<PermissionBlockedPanel state="summary_visible">`) · skeleton · error |
98:| Bulk action bar (inline in `<VocList>`) | `<VocBulkActionBar>` in `features/voc/components/list/` | shadcn `<Button>` | `selectedIds: string[]`, `onAssign`, `onSetSeverity`, `onAddToCluster`, `onCreateFinding`, `onClear` | hidden when `selectedIds.length === 0` |
99:| `<ListToolbar tabs activeTab onTabChange action>` | `<ListToolbar>` in `packages/ui/src/toolbar/` | shadcn `<Tabs>` for tab strip | `tabs: TabDescriptor[]`, `activeTab: string`, `onTabChange`, `action?: ReactNode`, `children?: ReactNode` | default; `action` slot pinned right via `position: sticky` (per Pack 12 wiring rule) |
100:| `<ListFilterButton categories applied onChange onClear>` | `<ListFilterButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<Checkbox>` group | `categories: FilterCategory[]`, `applied: Record<string, Set<string>>`, `onChange: (cat, value, on) => void`, `onClear: () => void` | closed · open · applied (count badge) |
101:| `<ListSortButton fields value onChange>` | `<ListSortButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<RadioGroup>` | `fields: SortField[]`, `value: string` (`'<field>:<asc\|desc>'`), `onChange` | closed · open · sorted (chip on button) |
105:### 3.3 Triage queue specifics
107:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
109:| `<TriageQueueRow>` (expanded 96px row) | `<TriageRow>` in `features/voc/components/triage/` | none | `voc: TriageQueueItem`, `selected`, `onSelect` | default · selected · stale (when optimistic-removed elsewhere) |
110:| `<TriagePanel>` | `<TriagePanel>` in `features/voc/components/triage/` | shadcn `<RadioGroup>` for severity, `<Button>` ghost for cluster decision | `voc: VocDetail`, `onAct: (kind: 'confirm' \| 'finding' \| 'skip') => void` | dirty · clean · submitting (button spinner) |
111:| Severity picker grid | `<SeverityPicker>` in `features/voc/components/triage/` | shadcn `<ToggleGroup>` | `value`, `onChange`, `disabled?` | 4 options, color bar per option |
113:| Triage undo toast | `<UndoToast>` in `packages/ui/src/feedback/` | shadcn `<Toast>` from `sonner` (per `apps/frontend/AGENTS.md` "use installed libraries" rule) | `message`, `actionLabel: '실행 취소'`, `onAction`, `duration: 4000` | visible · dismissing |
115:### 3.4 Create form
117:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
120:| `<FieldLabel required tip>` | `<FieldLabel>` in `packages/ui/src/forms/` | shadcn `<Label>` + `<Tooltip>` (for `tip`) | `required?: boolean`, `tip?: string`, `children: ReactNode` | required · with-tip · default |
121:| Managed System chip selector | `<ManagedSystemPicker>` in `packages/ui/src/pickers/` (already named in `component-inventory.md`) | shadcn `<ToggleGroup>` (chip style) | `value: string`, `onChange`, `options: ManagedSystemRef[]`, `disabled?: string[]` (MSs the actor cannot submit to) | default · disabled-chip (hover tooltip with reason) |
122:| Analytics Area chip selector | `<AnalyticsAreaPicker>` in `packages/ui/src/pickers/` | shadcn `<ToggleGroup>` | `managedSystemId: string`, `value: string \| null`, `onChange`, `allowEmpty: true` (defaults to true; user may pick 없음) | default · empty-list (helper text) |
123:| Source segmented control | shadcn `<Tabs>` (segmented variant) wrapped as `<SourceContextSegmented>` in `features/voc/components/create/` | shadcn `<Tabs>` | `value: 'Direct Use' \| 'Proxy Report' \| 'Operational Discovery' \| 'Stakeholder Request'`, `onChange` | 4 options; Proxy Report expands `<ProxyContextRow>` |
125:| `<RichEditor surface="voc-description">` | `<RichEditor>` in `packages/ui/src/rich-content/` (TipTap-based per ADR-0011) | none (TipTap React) | `surface: 'voc-description' \| 'reporter-reply' \| 'public-update' \| 'internal-comment'`, `value?: TipTapDoc`, `defaultValue?: TipTapDoc`, `onChange: (doc: TipTapDoc) => void`, `placeholder?: string`, `onAttach?`, `onMention?`, `minHeight?: number`, `disabled?: boolean` | per-surface toolbar allowlist (see §5.7), focused · invalid · disabled · uploading |
126:| `<DirtyConfirmation>` modal | `<DirtyConfirmation>` in `packages/ui/src/feedback/` | shadcn `<AlertDialog>` | `open`, `onConfirm`, `onCancel`, `title?`, `message?` | open · closed |
128:### 3.5 Detail panel composers + Reporter status
130:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
132:| Composer tab strip | `<ComposerTabs>` in `features/voc/components/detail/` | shadcn `<Tabs>` | `value: 'public' \| 'reply' \| 'internal'`, `onChange` | tab-active per surface; the `internal` tab Preview button is disabled (intentional, per Pack 12 wiring) |
133:| Public-update composer body | `<PublicUpdateComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="public-update">` + `<ReporterStatusChangeBlock>` + `<ComposerFooter>` | `voc: VocDetail`, `task: TaskRef \| null`, `nextReporterStatus`, `onChangeNextStatus`, `draftDoc`, `onChangeDraftDoc`, `onPublish`, `onPreview` | dirty · clean · publishing · gated (publish disabled when `reporterStatusGate` returns a reason) |
134:| Reporter-reply composer | `<ReporterReplyComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="reporter-reply">` | `voc`, `draftDoc`, `onChange`, `onSend`, `onPreview` | dirty · clean · sending |
135:| Internal-comment composer | `<InternalCommentComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="internal-comment">` | `voc`, `draftDoc`, `onChange`, `onAdd` | dirty · clean · sending |
136:| `<ReporterStatusChangeBlock>` | `<ReporterStatusChangeBlock>` in `features/voc/components/detail/` (NOT extracted to `packages/ui` — single consumer per Pack 8 comment) | shadcn `<Select>` for picker | `voc: VocDetail`, `task: TaskRef \| null`, `nextStatus`, `onChangeStatus`, `draftDoc`, `owner: ActorRef`, `transitions: ReporterStatusTransitions` (from `GET /vocs/:id` next_states envelope) | unchanged · staged · forbidden-selected (Callout red) · linked-task-gated (Callout amber) |
139:| `<PreviewModal>` | `<PreviewModal>` in `packages/ui/src/feedback/` | shadcn `<Dialog>` (size `lg`) | `open`, `onClose`, `title`, `children` | open · closed |
141:### 3.6 Status + signal badges
143:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
145:| `<ReporterStatusBadge status>` | `<ReporterStatusBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (pill variant — `rounded-full`) | `status: ReporterFacingStatus` (8 enum values) | 8 colors via `--status-reporter-*`; **always pill-shaped** — never collapses into squared |
146:| `<InternalTaskBadge status>` | `<InternalTaskBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (squared variant — `rounded-sm`) | `status: InternalTaskStatus` (7 enum values) | 7 colors via `--status-internal-*`; **always squared** — never inherits reporter pill tokens |
147:| `<SeverityBadge severity>` | `<SeverityBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (compact chip + `<SeverityIndicator>` bar prefix) | `severity: Severity` (4 enum) | 4 colors via `--severity-*` |
148:| `<ManagedSystemPill id>` | `<ManagedSystemPill>` in `packages/ui/src/badges/` | shadcn `<Badge>` (variant outline + 12px color mark) | `id: string` (resolves to `{ name, color, mark }` via `useManagedSystem(id)`) | 4 MSs in MVP fixtures; unknown id renders muted "Unknown MS" |
149:| `<OutlineBadge>` | `<OutlineBadge>` in `packages/ui/src/badges/` | shadcn `<Badge variant="outline">` | `children`, `color?` | default |
150:| `<EntityIconBadge type size>` | `<EntityIconBadge>` in `packages/ui/src/badges/` | none | `type: 'voc' \| 'finding' \| 'task' \| 'request' \| 'evidence' \| 'survey' \| 'outcome'`, `size?: number` | 7 letter glyphs |
152:### 3.7 Permission, linking, hover preview
154:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
163:### 3.8 Command palette (⌘K)
165:| Prototype surface | Production component | shadcn/ui base | Props | State variants |
167:| `<CommandMenu>` | `<CommandMenu>` in `apps/frontend/src/lib/command-menu/` | shadcn `<Command>` (cmdk wrapper) | `open`, `onClose`, `onNavigate`, `onScopeChange`, `commands: CommandDescriptor[]` (resolved server-side per `interaction-patterns.md` §Command menu) | open · closed · filtered · empty |
170:### 3.9 Form primitives (already in `packages/ui` per inventory)
172:`<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Combobox>`, `<Checkbox>`, `<RadioGroup>`, `<Tooltip>`, `<Popover>`, `<Dialog>`, `<Drawer>`, `<Toast>`, `<Skeleton>`. Use these directly — do not re-wrap.
186:| `description` (plain string) | `description_rich_content: rich_content` (TipTap JSON, ADR-0011) | `descriptionRichContent: TipTapDoc` | Prototype stores plain text; production stores TipTap JSON in `jsonb`. Render via `<RichContentRenderer doc={descriptionRichContent}>`. |
200:| `nextAction` (single string) | `next_actions: NextAction[]` per `docs/implementation/03-api-contracts.md` §Next Action Contract | `nextActions: NextAction[]` | Render the highest-priority `available` action in the sticky footer; surface the rest in `<DetailPanelHeaderActions>` More menu. Frontend MUST NOT infer eligibility. |
233:| `body_rich_content: TipTapDoc` (jsonb) | required | sanitized server-side per ADR-0011 |
238:**GAP:** `docs/design/15-data-contracts.md` lists VOC but does not enumerate the conversation tables. The shapes above are the minimum surface the frontend consumes; the migration spec lives in backend issue S3-001.
254:Per-file limit: **25 MB** in the prototype Create form, **50 MB** in the RichEditor footer copy. Spec aligns to **25 MB per file** as the binding limit (the larger number is prototype copy drift). Production limit lives in ADR-0011 derivative — confirm with backend before S3-006.
294:**Group by:** **NOT supported on VOC surfaces in Slice 3** (group-by lives on Tasks board). State explicitly that the prototype Sort button is single-axis Sort only.
296:### 5.2 Command palette (⌘K)
300:| Command id | Group | Verb + label | Route intent |
309:Per `docs/frontend/interaction-patterns.md` §Command menu: commands resolve via backend route-resolution endpoint when ambiguous (e.g. "Open VOC 2814" must be reachable even when the actor is on `/tasks`). Backend returns `route_intent: { route, params }` and the menu navigates via TanStack Router. Frontend MUST NOT synthesize commands the backend marked `hidden`.
317:3. Toast (`<UndoToast>`) appears with `실행 취소` action and 4-second auto-dismiss.
318:4. Mutation fires: `PATCH /vocs/:id` with the triage payload, `Idempotency-Key: <uuidv4>` header (per ADR-0015).
328:### 5.4 Detail panel header actions
335:| Expand | Toggles `useFullscreenPanel()` (panel takes columns 3-4); Esc collapses | Pure UI |
347:- Public preview reflects: VOC id, next `<ReporterStatusBadge>`, title, owner attribution, `descriptionRichContent` rendered through `<RichContentRenderer mode="reporter_visible">`, and a footer reminder ("첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다…").
350:### 5.6 Permission-blocked surfaces (VOC)
374:### 5.7 RichEditor per-surface contract
383:Backend sanitization is authoritative (ADR-0011): the editor enforces the toolbar allowlist client-side as UX guidance only. The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (added to ADR-0012 in Slice 3 #13).
389:- **Create form:** unsaved changes prompt `<DirtyConfirmation>` on navigate-away (browser back, sidebar nav click, ⌘K navigation). Save Draft button (prototype copy "초안 저장") is **NOT in Slice 3** — strip from the production form or surface as `disabledReason: 'Drafts come in Slice 5'`. Confirm with PM before S3-006.
390:- **Detail panel composers:** dirty state per surface (public / reply / internal). Switching tabs preserves each surface's draft in component state (per prototype `key={composerTab}` reset rule — production keeps drafts in a `useReducer` keyed by `(vocId, surface)`). Closing the panel with any dirty composer prompts `<DirtyConfirmation>`.
402:2. Status picker is a `<Select>` listing **current first, then allowed transitions, then forbidden transitions (disabled with `· 차단됨` suffix)**. Allowed set comes from `voc.next_reporter_states.allowed`.
405:5. Reporter preview card mirrors the reporter inbox row: VOC id · new `<ReporterStatusBadge>` · 업데이트 chip · title · owner attribution · sanitized body excerpt · public-safe footer reminder.
435:## 6. Visual Contract
439:### 6.1 Surface tokens
443:| `--surface-canvas` | `bg-surface-canvas` | `#08090a` (Pitch Black) | App canvas, main scroll background |
444:| `--surface-sidebar` | `bg-surface-sidebar` | `#0a0b0c` | Left sidebar only |
445:| `--surface-list` | `bg-surface-list` | `#08090a` | List rows base |
446:| `--surface-row-hover` | `bg-surface-row-hover` | `#131416` | Row hover (group-hover:bg-surface-row-hover) |
447:| `--surface-row-selected` | `bg-surface-row-selected` | `#1a1c20` | Row selected (`aria-selected=true`) |
448:| `--surface-detail` | `bg-surface-detail` | `#0f1011` (Graphite) | Right detail panel |
449:| `--surface-card` | `bg-surface-card` | `#0f1011` | In-panel card sections |
450:| `--surface-card-elevated` | `bg-surface-card-elevated` | `#161718` (Deep Slate) | DetailPanelHeader band, raised cards |
451:| `--surface-popover` | `bg-surface-popover` | `#161718` | Popovers, command menu, dropdowns |
452:| `--surface-field` | `bg-surface-field` | transparent | Default input bg |
453:| `--surface-field-filled` | `bg-surface-field-filled` | `#161718` | Filled / focused input bg |
454:| `--surface-blocked` | `bg-surface-blocked` | `#15161a` | PermissionBlockedPanel bg |
456:### 6.2 Text tokens
469:### 6.3 Border + focus
476:| `--focus-ring` | `ring-focus-ring` | `#e4f222` (Neon Lime) | All keyboard focus (`focus-visible:ring-2 focus-visible:ring-focus-ring`) |
479:### 6.4 Reporter-facing status (pill — `rounded-full`)
492:### 6.5 Internal task status (squared — `rounded-sm`) — referenced from VOC linked execution row, not authored here
504:### 6.6 Severity (chip + 3×16px bar)
513:### 6.7 Density + radii
526:| `--radius-lg` | `rounded-lg` | 8px | Toasts, preview modal |
530:### 6.8 Neon Lime usage rule
532:`#e4f222` (Neon Lime) is **reserved**:
534:1. Primary action button background (`<Button variant="primary">`).
538:**Forbidden uses:** status badges (reporter or internal), severity, hover row backgrounds, link text, info accents. Reviewers reject PRs that color non-action surfaces Neon Lime.
548:| Key | Where attached | Frontend surface | Hook |
581:| Request body | `{ primary_managed_system_id, title, description_rich_content: TipTapDoc, analytics_area_id?, source_context?, attachments?: AttachmentRef[] }` |
584:| Error codes (ADR-0012) | `validation.failed` (422) · `validation.unexpected_field` (422 — forbidden server-resolved field in body) · `validation.malformed_idempotency_key` (422 — Idempotency-Key header present but not UUIDv4) · `voc.severity_not_user_settable` (422) · `permission.denied` (403) · `not_found.record` (404 on referenced MS or AA) · `conflict.parent_archived` (409 if MS or AA is archived, per ADR-0019 Section A/B) · `conflict.idempotency_key_reuse` (409) · `rate_limited.actor` (429) · `rich_content.disallowed_node` (422) · `rich_content.external_image_forbidden` (422) · `attachment.unsupported_pending_storage_slice` (422 — Slice 3 only; replaced by `attachment.too_large` / `attachment.unsupported_type` when #22 attachment upload lands) |
628:| Request body (with status change) | `{ body_rich_content: TipTapDoc, next_reporter_facing_status: ReporterFacingStatus, skip_public_update: false }` |
643:| Request body | `{ body_rich_content: TipTapDoc, attachments?: AttachmentRef[] }` |
655:| Request body | `{ body_rich_content: TipTapDoc, mentions?: ActorRef[] }` |
686:| ID | Question | Blocked surfaces | Owner | When |
688:| Q1 (attachment storage) | Is the Slice 3 backend ready to accept attachment refs on `POST /vocs` (i.e. is the storage abstraction from ADR-0011 implemented), or does Slice 3 VOC ship without attachments? Frontend dropzone + `AttachmentRow` are spec'd either way; the binding decision is whether to wire the upload service in S3-006 or strip attachments to a follow-up. | Create form attachments; RichEditor Attach button on `voc-description`, `reporter-reply`, `internal-comment` | Backend lead (S3-001 prologue) | Before S3-001 migration ships |
689:| Q2 (rich content format) | Confirm TipTap JSON in `jsonb` is locked for Slice 3 (ADR-0011 says yes; verify no downstream blocker). Frontend assumes TipTap throughout; if the decision flips to Lexical or sanitized HTML, every `<RichEditor>` and `<RichContentRenderer>` site has to migrate. | All four rich-content surfaces | Frontend + backend lead | Before S3-006 component scaffold |
694:| Q-DISPLAYID (newly surfaced) | The prototype renders `VOC-2814` as the human id. Production uses UUID v7. Who renders the display slug — backend (`display_id` column) or frontend (formatter that hashes UUID prefix)? Affects URLs (`/vocs?selected=<uuid-or-slug>`), command palette ("Open VOC-2814"), copy-link semantics. | All routes (URL shape) + command palette + copy-link | Backend + Frontend lead | Before S3-002 |
695:| Q-SEVRETRIAGE (newly surfaced) | Can severity change after triage commits, or is it locked? `docs/design/04-voc-system.md:117` says "severity is assigned during triage" but does not forbid retriage. Affects `PATCH /vocs/:id` allowed-fields list and the Detail panel "변경" button next to Severity. | Detail panel Triage block | PM | Before S3-002 |
696:| Q-CONVPAGINATION (newly surfaced) | Is `conversation_timeline` inlined on `GET /vocs/:id` or always paginated via `GET /vocs/:id/conversation`? Affects panel initial load size and timeline rendering. | Detail panel public + internal timelines | Backend | Before S3-002 |
697:| Q-STATUSGATECODE (newly surfaced) | The linked-Task gate (e.g. cannot mark `resolved` until task `released`) — does the backend return `reporter_facing_status.invalid_transition` (existing in ADR-0012 enum) or a new `reporter_facing_status.gate_blocked`? Affects error-mapper i18n keys. | Public Update composer error rendering | Backend + ADR-0012 maintainer | Before S3-002 |
721:- [x] §1 header + scope present with explicit non-scope
723:- [x] §3 component mapping covers every VOC-touching surface (header, list, toolbar, triage queue + panel, create form, composers, status block, badges, permission, hover, command)
725:- [x] §5 interaction contract covers filters/sort, command palette, optimistic + undo, header actions, preview modal, permission surfaces, RichEditor allowlist, dirty save, drag/drop (explicitly none), reporter-status change, triage flow + audit events
726:- [x] §6 visual contract enumerates every cited token with Tailwind key + raw color + usage; Neon Lime rule called out
728:- [x] §8 API mapping covers POST /vocs, GET /vocs, GET /vocs/:id, PATCH /vocs/:id, POST /vocs/:id/{public-updates, reporter-replies, internal-comments} with headers, errors, idempotency, tx checks, audit events
730:- [x] §10 open questions: original 6 + 4 newly surfaced

hook: PostToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PostToolUse Completed
exec
/bin/zsh -lc 'rg -n "TipTap|StarterKit|Image|attachmentRef|mention|reporter|HTML|JSON|sanitize|visible|allowlist|MUST|SHOULD" docs/adr/0011-rich-content-editor-and-attachment-storage.md' in /Users/hyojung/Desktop/2026/FeedbackOps
exec
/bin/zsh -lc 'rg -n "ListShell|PageShell|WorkbenchShell|AppShell|50px|header|taxonomy|rail|sidebar|detail|MUST|SHOULD" docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
1:# Rich Content Editor (TipTap) and attachment storage
5:## Editor: TipTap
7:The frontend uses **TipTap** (ProseMirror-based) as the shared editor foundation. We pick TipTap because:
10:- The extension ecosystem (`@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-mention`, etc.) covers our planned features without forking.
11:- TipTap documents serialize to structured JSON, which matches `docs/implementation/01-coding-conventions.md`'s "Store rich content in structured editor documents or sanitized HTML approved by the backend contract." We store the JSON, not HTML.
13:Backend persistence is **TipTap JSON in a `jsonb` column**; the schema is versioned via a `schema_version` field inside the document so a future TipTap upgrade does not require a data migration day-one. Sanitization happens server-side using `@tiptap/html` to reject unknown nodes, attributes, and inline-style payloads.
15:The editor configuration lives in `packages/ui/src/rich-content/` so all four surfaces import the same base and pass a `mode: 'voc' | 'reporter_reply' | 'public_update' | 'internal_comment'` to gate toolbar actions, embeds, and rendering — matching the relationship in CONTEXT.md: "Each rich-content surface may restrict toolbar actions, embeds, and rendering according to visibility and safety needs."
52:Bringing Rich Table in later means enabling the TipTap table extension, adding size limits (rows × columns × cell text length), and deciding the public-facing surface restrictions — that work warrants a new ADR.
56:- TipTap is the single editor foundation; documents are stored as TipTap JSON in `jsonb`.

 succeeded in 0ms:
1:# Shell taxonomy: three route shells + 50px header rhythm
5:Pack 18 of the Open Design hi-fi prototype (`docs/design-prototype/`, 2026-05-17, refreshed through Pack 20) locked the route-layout vocabulary. Earlier packs let each screen invent its own toolbar / detail-panel / header geometry, which produced visible drift between Tasks board, VOC Triage, Survey builder, Evidence list, and Entity Links — every "list-ish" page had a slightly different toolbar height and header rhythm.
7:The design pass that landed alongside the Samsung-light palette refresh consolidates every route into one of three layout families and aligns every cross-route header — sidebar system header, list/workbench toolbar, drawer panel header, and Survey preview drawer header — onto a single 50px baseline.
9:This ADR locks the taxonomy and the rhythm so the production React + TanStack Router + shadcn implementation cannot re-fracture them.
15:Every production route MUST classify as one of:
17:- `PageShell` — page-body routes whose content is not a list or work surface. Examples: Home / Action Dashboard, Integration Action Dashboard, Coverage, Survey list (cards), Admin managed systems, Admin analytics areas, Admin settings, Roadmap, New VOC. `PageShell` exposes `title`, `subtitle`, `eyebrow`, `actions`, `back`, and `fluid` slots.
18:- `ListShell` — filter / list / detail routes. Owns the toolbar slot, an optional `beforeList` extension row, the scroll body, and an optional right detail panel. Examples: VOC inbox + detail, Tasks requests / backlog / my / inbox, Evidence highlights, Entity Links, Findings.
19:- `WorkbenchShell` — work surfaces whose body is not a simple object list. Owns the toolbar slot, an optional below-toolbar content row, the body, and an optional detail panel. Examples: Tasks board, VOC Triage console, Survey builder, Survey result.
23:### 2. 50px header rhythm
25:The following surfaces MUST share a single 50px height baseline:
27:- Sidebar system header (`<Sidebar>` top block).
28:- `ListShell` toolbar (the row owning tabs / filters / search / actions).
29:- `WorkbenchShell` toolbar (same row, different body underneath).
30:- Detail-panel drawer header (`<DetailPanelHeader>` and its analogues).
31:- Survey preview drawer header.
33:`PageShell` itself does not impose a 50px header — its layout is content-driven, not toolbar-driven — but any drawer or panel that opens on top of a `PageShell` MUST follow the 50px rule for its own header.
42:2. Pick the shell — `PageShell` / `ListShell` / `WorkbenchShell`. If unclear, mirror what the prototype's `screen-*.jsx` uses (`docs/design-prototype/screen-*.jsx`).
44:4. Verify the header height against the 50px baseline before shipping.
48:- **Production component library lock.** `packages/ui/src/layout/` MUST export exactly three shell components (`PageShell`, `ListShell`, `WorkbenchShell`) and any shared header primitive (e.g. `<ShellTitle>`). Adding a fourth shell requires an ADR amendment.
50:- **Migration cost is bounded.** Once the three shells exist in `packages/ui`, each route is a ≤2-file change (route component + one shell prop pass). Header drift cannot reappear because the 50px height lives in the shell, not in the route.
51:- **Drawer / panel discipline.** Anywhere a drawer opens — Survey preview, VOC compose, Triage panel, Findings detail — the drawer's header height inherits from the shared primitive. Per-route height overrides are disallowed.
52:- **Backlog / Survey are not exceptions.** They look different because their bodies carry richer rows; the shell underneath is unchanged. This prevents the next "make backlog its own shell" temptation from re-fracturing the taxonomy.
56:- Mobile / tablet shell behaviour. Pack 13 landed responsive scaffolding (sidebar drawer < 900px, detail-panel drill-in overlays); a future ADR will codify the touch-target + breakpoint contract.
58:- Multi-pane shells beyond detail-panel-on-right. If a route ever needs a left+center+right layout, this ADR must amend first.
62:- `docs/design-prototype/HANDOFF.md` §"Pack 18 — Route pattern shells + aligned headers" (Session 17 changelog); §"Pack 20 — Baseline QA + nested-button polish" (Session 19) confirms post-Pack-19-split visual stability.
64:- `docs/design-prototype/components.jsx` (`PageShell`, `ListShell`, `WorkbenchShell`, `ShellTitle` source-of-truth implementations — port these, do not re-derive).

hook: PostToolUse
exec
/bin/zsh -lc 'rg -n "patch|If-Match|Idempotency-Key|description|ETag|vocs/:id|router|idempotency" apps/backend/src/modules/voc/routes.ts packages/shared/src/errors/codes.ts' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
packages/shared/src/errors/codes.ts:24:  'conflict.idempotency_key_reuse',
packages/shared/src/errors/codes.ts:28:  'validation.malformed_idempotency_key',
apps/backend/src/modules/voc/routes.ts:2:// HTTP parsing + forbidden-field stripping + idempotency frame; the
apps/backend/src/modules/voc/routes.ts:19:  patchVocRequestSchema,
apps/backend/src/modules/voc/routes.ts:30:import { hashRequestBody } from '../core/idempotency/canonicalize.js';
apps/backend/src/modules/voc/routes.ts:31:import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
apps/backend/src/modules/voc/routes.ts:47:  idempotencyService: IdempotencyService;
apps/backend/src/modules/voc/routes.ts:58:  const { db, sessionService, vocService, vocReadService, idempotencyService, conversationService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/voc/routes.ts:64:      throw new HttpError('validation.failed', 'If-Match header required', {
apps/backend/src/modules/voc/routes.ts:72:    const raw = headers['idempotency-key'];
apps/backend/src/modules/voc/routes.ts:75:      throw new HttpError('validation.failed', 'Idempotency-Key header required', {
apps/backend/src/modules/voc/routes.ts:76:        fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
apps/backend/src/modules/voc/routes.ts:81:        'validation.malformed_idempotency_key',
apps/backend/src/modules/voc/routes.ts:82:        'Idempotency-Key must be a UUIDv4',
apps/backend/src/modules/voc/routes.ts:97:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:134:        // a VOC row + audit row (the loser's idempotency INSERT is
apps/backend/src/modules/voc/routes.ts:138:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:140:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:146:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:147:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:155:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
apps/backend/src/modules/voc/routes.ts:162:  // PATCH /vocs/:id — Slice 3 #14 triage-commit route.
apps/backend/src/modules/voc/routes.ts:166:    url: '/vocs/:id',
apps/backend/src/modules/voc/routes.ts:173:      // 1. Idempotency-Key header.
apps/backend/src/modules/voc/routes.ts:174:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:176:      // 2. If-Match header (optimistic concurrency).
apps/backend/src/modules/voc/routes.ts:186:      // guard but is then rejected by patchVocRequestSchema.strict() as an
apps/backend/src/modules/voc/routes.ts:194:          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id`, {
apps/backend/src/modules/voc/routes.ts:201:      const parsed = patchVocRequestSchema.safeParse(rawBody);
apps/backend/src/modules/voc/routes.ts:210:      // refetch (new If-Match value) is NOT deduplicated against the original
apps/backend/src/modules/voc/routes.ts:211:      // request — different If-Match semantically represents a different intent.
apps/backend/src/modules/voc/routes.ts:214:      // idempotency contract: a client that retries the same intent with a
apps/backend/src/modules/voc/routes.ts:215:      // fresh If-Match (e.g. after a 409 stale_write → refetch → retry)
apps/backend/src/modules/voc/routes.ts:216:      // produces a different hash → 409 conflict.idempotency_key_reuse instead
apps/backend/src/modules/voc/routes.ts:218:      // Idempotency-Key for each distinct If-Match value. ADR-0015 is silent
apps/backend/src/modules/voc/routes.ts:219:      // on whether If-Match is "part of the body" for hashing purposes; this
apps/backend/src/modules/voc/routes.ts:228:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:230:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:236:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:237:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:254:        // 7. Record idempotency result and return 200.
apps/backend/src/modules/voc/routes.ts:255:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 200, envelope);
apps/backend/src/modules/voc/routes.ts:262:  // ── PATCH /vocs/:id/description — Slice 3 #17 Reporter pre-triage edit ───
apps/backend/src/modules/voc/routes.ts:270:    url: '/vocs/:id/description',
apps/backend/src/modules/voc/routes.ts:279:      // 1. Idempotency-Key header.
apps/backend/src/modules/voc/routes.ts:280:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:282:      // 2. If-Match header (optimistic concurrency).
apps/backend/src/modules/voc/routes.ts:297:      // See C10 note on PATCH /vocs/:id — case-sensitive; .strict() catches
apps/backend/src/modules/voc/routes.ts:302:          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id/description`, {
apps/backend/src/modules/voc/routes.ts:316:      // 5. Idempotency frame (same pattern as PATCH /vocs/:id).
apps/backend/src/modules/voc/routes.ts:317:      // ifMatch included in hash — different If-Match = different intent.
apps/backend/src/modules/voc/routes.ts:318:      const hash = hashRequestBody({ vocId, ifMatch, route: 'voc.description_edit', ...rawBody });
apps/backend/src/modules/voc/routes.ts:321:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:323:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:329:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:330:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:346:        // 7. Record idempotency result and return 200.
apps/backend/src/modules/voc/routes.ts:347:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 200, envelope);
apps/backend/src/modules/voc/routes.ts:393:  // ── GET /vocs/:id — detail + ETag (Slice 3 #15 C3) ───────────────────────
apps/backend/src/modules/voc/routes.ts:396:    url: '/vocs/:id',
apps/backend/src/modules/voc/routes.ts:422:      // (comma-separated ETags) and wildcard '*'. Exact string compare misses these.
apps/backend/src/modules/voc/routes.ts:442:  // ── GET /vocs/:id/conversation — paginated conversation (Slice 3 #15 C3) ──
apps/backend/src/modules/voc/routes.ts:445:    url: '/vocs/:id/conversation',
apps/backend/src/modules/voc/routes.ts:482:  // ── POST /vocs/:id/public-updates — Slice 3 #16 C4 ───────────────────────
apps/backend/src/modules/voc/routes.ts:486:    url: '/vocs/:id/public-updates',
apps/backend/src/modules/voc/routes.ts:493:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:513:      // idempotency replay across routes).
apps/backend/src/modules/voc/routes.ts:517:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:519:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:523:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:524:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:533:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
apps/backend/src/modules/voc/routes.ts:540:  // ── POST /vocs/:id/reporter-replies — Slice 3 #16 C4 ─────────────────────
apps/backend/src/modules/voc/routes.ts:544:    url: '/vocs/:id/reporter-replies',
apps/backend/src/modules/voc/routes.ts:551:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:572:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:574:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:578:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:579:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:588:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
apps/backend/src/modules/voc/routes.ts:595:  // ── POST /vocs/:id/internal-comments — Slice 3 #16 C4 ────────────────────
apps/backend/src/modules/voc/routes.ts:599:    url: '/vocs/:id/internal-comments',
apps/backend/src/modules/voc/routes.ts:606:      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
apps/backend/src/modules/voc/routes.ts:627:          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
apps/backend/src/modules/voc/routes.ts:629:        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
apps/backend/src/modules/voc/routes.ts:633:            'conflict.idempotency_key_reuse',
apps/backend/src/modules/voc/routes.ts:634:            'Idempotency-Key reused with different request body',
apps/backend/src/modules/voc/routes.ts:643:        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,90p' packages/shared/src/errors/codes.ts" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
// ADR-0012 stable error codes. Authoritative list lives in this file; both
// apps import from `@fops/shared`. Slice 1 ships only the codes the auth path
// emits — additional codes are added by their owning slice in lockstep with
// the i18n catalog (when that lands).

import { z } from 'zod';

export const ERROR_CODES = [
  // auth.* → 401
  'auth.session_invalid',
  'auth.session_required',
  'auth.session_expired',
  // permission.* → 403
  'auth.workspace_mismatch',
  'permission.denied',
  // rate_limited.* → 429
  'rate_limited.actor',
  'rate_limited.ip',
  // validation.* → 422
  'validation.failed',
  'validation.malformed_request',
  'validation.unknown_capability',
  // conflict.* → 409
  'conflict.idempotency_key_reuse',
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
  // validation.* → 422 (continued)
  'validation.malformed_idempotency_key',
  'validation.sensitive_reason_required',
  'validation.immutable_field',
  // conflict.* → 409 (Slice 2 #10/#11)
  'conflict.duplicate_slug',
  'conflict.parent_archived',
  // conflict.* → 409 (ADR-0019 Section A — archived row is itself
  // immutable; distinct from `conflict.parent_archived` which rejects
  // because the referenced parent is archived).
  'conflict.record_archived',
  // not_found.* → 404
  'not_found.record',
  // internal.* → 500
  'internal.unexpected',
  // validation.* / voc.* / rich_content.* / attachment.* → 422 (Slice 3 #13)
  'voc.severity_not_user_settable',
  'validation.unexpected_field',
  'rich_content.disallowed_node',
  'rich_content.external_image_forbidden',
  'attachment.unsupported_pending_storage_slice',
  // conflict.* → 409 (Slice 3 #14 — optimistic concurrency)
  'conflict.stale_write',
  // voc.* → 422 (Slice 3 #14 — forbidden field on PATCH)
  'voc.reporter_status_via_public_update_only',
  // permission.* → 403 (Slice 3 #14 — MS-scope required)
  'permission.scope_required',
  // reporter_facing_status.* → 422 (Slice 3 #16 — transition validation + gate)
  'reporter_facing_status.invalid_transition',
  'reporter_facing_status.gate_blocked',
  // conflict.* → 409 (Slice 3 #17 — Reporter edit blocked by committed triage)
  'conflict.triage_already_committed',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * ADR-0012 response envelope. `detail` and `requestable_permission` are
 * optional and code-specific; the shape itself is universal.
 */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  requestable_permission?: {
    permission: string;
    managed_system_id?: string;
    reason_required?: boolean;
  };
}

hook: PostToolUse
exec
/bin/zsh -lc "sed -n '1,45p' apps/frontend/src/routes/__root.tsx && sed -n '1,45p' apps/frontend/vite.config.ts" in /Users/hyojung/Desktop/2026/FeedbackOps
exec
/bin/zsh -lc "sed -n '160,235p' apps/backend/src/modules/voc/routes.ts && sed -n '270,325p' apps/backend/src/modules/voc/routes.ts" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-full bg-surface-canvas text-text-primary">
      <Outlet />
    </div>
  );
}
import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3010,
    proxy: {
      '/api': 'http://127.0.0.1:3011',
      '/health': 'http://127.0.0.1:3011',
      // Slice 1 #3: auth endpoints + the /me identity probe live at root.
      '/auth': 'http://127.0.0.1:3011',
      '/me': 'http://127.0.0.1:3011',
    },
  },
});

 succeeded in 0ms:
  });

  // PATCH /vocs/:id — Slice 3 #14 triage-commit route.
  // TODO(#14 follow-up): triage rate-limit bucket per spec (60/min vs shared mutation 10/min)
  app.route({
    method: 'PATCH',
    url: '/vocs/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // 1. Idempotency-Key header.
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);

      // 2. If-Match header (optimistic concurrency).
      const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);

      const params = req.params as { id: string };
      const vocId = params.id;
      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 3. Strip forbidden fields before Zod parse.
      // C10 (case-insensitivity note): the check uses `f in rawBody` which is
      // case-sensitive. A client sending e.g. `Cluster_Decision` bypasses this
      // guard but is then rejected by patchVocRequestSchema.strict() as an
      // unrecognized_keys error → validation.failed (generic), rather than the
      // precise validation.unexpected_field per-field error produced here.
      // This is acceptable — fuzzy casing is a client bug, not a spec contract.
      // The .strict() fallback ensures the field is still rejected.
      for (const f of FORBIDDEN_PATCH_FIELDS) {
        if (f in rawBody) {
          const code = FORBIDDEN_PATCH_FIELD_ERROR_CODES[f];
          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id`, {
            fields: [{ path: [f], code: 'unexpected_field' }],
          });
        }
      }

      // 4. Schema validation.
      const parsed = patchVocRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      // 5. Idempotency frame (same pattern as POST /vocs).
      // F6: include ifMatch in the hash so that a retry after a client-side
      // refetch (new If-Match value) is NOT deduplicated against the original
      // request — different If-Match semantically represents a different intent.
      //
      // C4 (hash-semantic note): Including ifMatch in the hash shifts the
      // idempotency contract: a client that retries the same intent with a
      // fresh If-Match (e.g. after a 409 stale_write → refetch → retry)
      // produces a different hash → 409 conflict.idempotency_key_reuse instead
      // of a cache replay. The client must therefore generate a fresh
      // Idempotency-Key for each distinct If-Match value. ADR-0015 is silent
      // on whether If-Match is "part of the body" for hashing purposes; this
      // is a #14-local decision. If a real client trips on the 409, revisit
      // with a body-only secondary hash that emits a distinct hint field
      // (e.g. detail.hint: 'if_match_changed') so the client can distinguish
      // "reused key for different intent" from "same intent, new concurrency
      // token". Filed as a follow-up concern; no action needed until then.
      const hash = hashRequestBody({ vocId, ifMatch, ...rawBody });
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
        );
        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
    url: '/vocs/:id/description',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig
      ? { config: { rateLimit: (rateLimitConfig.reporterEdit ?? rateLimitConfig.mutation) as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // 1. Idempotency-Key header.
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);

      // 2. If-Match header (optimistic concurrency).
      const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);

      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 3. Strip forbidden fields before Zod parse for precise per-field errors.
      // See C10 note on PATCH /vocs/:id — case-sensitive; .strict() catches
      // any case variants as validation.failed (unrecognized_keys).
      for (const f of FORBIDDEN_EDIT_DESCRIPTION_FIELDS) {
        if (f in rawBody) {
          const code = FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES[f];
          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id/description`, {
            fields: [{ path: [f], code: 'unexpected_field' }],
          });
        }
      }

      // 4. Schema validation.
      const parsed = editDescriptionRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      // 5. Idempotency frame (same pattern as PATCH /vocs/:id).
      // ifMatch included in hash — different If-Match = different intent.
      const hash = hashRequestBody({ vocId, ifMatch, route: 'voc.description_edit', ...rawBody });
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
        );
        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body };

hook: PostToolUse
hook: PostToolUse
exec
/bin/zsh -lc "sed -n '370,388p' docs/frontend/specs/voc.md && sed -n '580,586p' docs/frontend/specs/voc.md && sed -n '435,538p' docs/frontend/specs/voc.md" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
  key: 'linkedFinding' | 'execution' | 'linkedVoc' | 'source'
): PermissionDecision | null;
```

### 5.7 RichEditor per-surface contract

| Surface | Allowed toolbar actions | Footer hint | Surface warning |
|---|---|---|---|
| `voc-description` | Bold, Italic, Underline, Code, List, Link, Attach | "본인이 직접 겪은 일을 기준으로 적어주세요. 첨부 파일은 25 MB 이하." | none |
| `reporter-reply` | Bold, Italic, Link, Attach | "공개 타임라인에 기록되며 리포터에게 알림이 발송됩니다." | "리포터에게 보이는 메시지입니다. 내부 도구/티켓 ID는 노출하지 않는 게 안전합니다." |
| `public-update` | Bold, Italic, List | "Reporter-facing status가 변경됩니다. 공개 안전한 표현인지 한 번 더 확인하세요." | "리포터에게 노출됩니다. 첨부 · 외부 링크 · @멘션은 사용할 수 없습니다." |
| `internal-comment` | Bold, Italic, Code, List, Link, @Mention, Attach | "팀원에게만 보입니다. 코드 블록 · @멘션을 자유롭게 사용하세요." | none |

Backend sanitization is authoritative (ADR-0011): the editor enforces the toolbar allowlist client-side as UX guidance only. The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (added to ADR-0012 in Slice 3 #13).

Attachment uploads from inside the editor and from the Create form dropzone share the same backend interface (per ADR-0011 §Inline Attachments). The frontend abstraction: `useAttachmentUpload({ vocId?: string, scope: 'voc' | 'comment' })`.

### 5.8 Dirty-save patterns

| Headers | `Content-Type: application/json`, `Idempotency-Key: <uuidv4>` (required from frontend — prevents double-submit on Create), session cookie (`fops_session`, HttpOnly + SameSite=Lax — set by `POST /auth/mock-login` or production OIDC handler) |
| Request body | `{ primary_managed_system_id, title, description_rich_content: TipTapDoc, analytics_area_id?, source_context?, attachments?: AttachmentRef[] }` |
| Forbidden fields | `reporter_id`, `severity`, `reporter_facing_status`, `triage_state`, `owner_user_id`, `owner_team_id`, `display_id` (per `packages/shared/src/vocs/create-request.ts FORBIDDEN_CREATE_FIELDS`) — client validation drops them before send |
| Success response | `201 Created` with full VOC envelope including server-resolved `reporter_id`, `triage_state: 'untriaged'`, `reporter_facing_status: 'received'`, `next_actions`, `permission_decisions` |
| Error codes (ADR-0012) | `validation.failed` (422) · `validation.unexpected_field` (422 — forbidden server-resolved field in body) · `validation.malformed_idempotency_key` (422 — Idempotency-Key header present but not UUIDv4) · `voc.severity_not_user_settable` (422) · `permission.denied` (403) · `not_found.record` (404 on referenced MS or AA) · `conflict.parent_archived` (409 if MS or AA is archived, per ADR-0019 Section A/B) · `conflict.idempotency_key_reuse` (409) · `rate_limited.actor` (429) · `rich_content.disallowed_node` (422) · `rich_content.external_image_forbidden` (422) · `attachment.unsupported_pending_storage_slice` (422 — Slice 3 only; replaced by `attachment.too_large` / `attachment.unsupported_type` when #22 attachment upload lands) |
| Idempotency (ADR-0015) | Required from client; same key + same body returns the stored 201 verbatim; same key + different body returns `409 conflict.idempotency_key_reuse` |
| tx-scoped checks (ADR-0019 Section E pattern) | Service `createVoc` runs in a single tx; `SELECT … FOR UPDATE` on the parent MS row (and AA row, when present) to serialize against archive transactions. Per `apps/backend/AGENTS.md` Layer Rules: mutation service receives `Tx` not `Pool`. |
## 6. Visual Contract

Tailwind config lives in `apps/frontend/tailwind.config.ts`. **CSS custom properties from `docs/design-prototype/styles.css` port verbatim**; Tailwind config exposes them as kebab-case theme keys.

### 6.1 Surface tokens

| Semantic token | Tailwind key | Raw color | Usage rule |
|---|---|---|---|
| `--surface-canvas` | `bg-surface-canvas` | `#08090a` (Pitch Black) | App canvas, main scroll background |
| `--surface-sidebar` | `bg-surface-sidebar` | `#0a0b0c` | Left sidebar only |
| `--surface-list` | `bg-surface-list` | `#08090a` | List rows base |
| `--surface-row-hover` | `bg-surface-row-hover` | `#131416` | Row hover (group-hover:bg-surface-row-hover) |
| `--surface-row-selected` | `bg-surface-row-selected` | `#1a1c20` | Row selected (`aria-selected=true`) |
| `--surface-detail` | `bg-surface-detail` | `#0f1011` (Graphite) | Right detail panel |
| `--surface-card` | `bg-surface-card` | `#0f1011` | In-panel card sections |
| `--surface-card-elevated` | `bg-surface-card-elevated` | `#161718` (Deep Slate) | DetailPanelHeader band, raised cards |
| `--surface-popover` | `bg-surface-popover` | `#161718` | Popovers, command menu, dropdowns |
| `--surface-field` | `bg-surface-field` | transparent | Default input bg |
| `--surface-field-filled` | `bg-surface-field-filled` | `#161718` | Filled / focused input bg |
| `--surface-blocked` | `bg-surface-blocked` | `#15161a` | PermissionBlockedPanel bg |

### 6.2 Text tokens

| Semantic token | Tailwind key | Raw color | Usage |
|---|---|---|---|
| `--text-primary` | `text-text-primary` | `#f7f8f8` | Body, titles |
| `--text-secondary` | `text-text-secondary` | `#d0d6e0` | Subtitles, secondary labels |
| `--text-muted` | `text-text-muted` | `#8a8f98` | Meta, timestamps |
| `--text-disabled` | `text-text-disabled` | `#62666d` | Disabled |
| `--text-danger` | `text-text-danger` | `#eb5757` | Errors, "Owner 없음" |
| `--text-warning` | `text-text-warning` | `#f2c46d` | Warnings |
| `--text-success` | `text-text-success` | `#27a644` | Success |
| `--text-info` | `text-text-info` | `#02b8cc` | Info |

### 6.3 Border + focus

| Semantic token | Tailwind key | Raw color | Usage |
|---|---|---|---|
| `--border-subtle` | `border-border-subtle` | `#23252a` (Charcoal Grey) | Default 1px dividers |
| `--border-strong` | `border-border-strong` | `#323334` | Inputs, popover edges |
| `--border-selected` | `border-border-selected` | `#5e6ad2` (Aether Blue) | Row selected ring |
| `--focus-ring` | `ring-focus-ring` | `#e4f222` (Neon Lime) | All keyboard focus (`focus-visible:ring-2 focus-visible:ring-focus-ring`) |
| `--focus-ring-danger` | `ring-focus-ring-danger` | `#eb5757` | Destructive focus |

### 6.4 Reporter-facing status (pill — `rounded-full`)

| Status | Token | Tailwind class | Raw |
|---|---|---|---|
| `received` (접수됨) | `--status-reporter-received` | `bg-status-reporter-received/15 text-status-reporter-received` | `#02b8cc` |
| `reviewing` (검토 중) | `--status-reporter-reviewing` | same | `#5e6ad2` |
| `assigned` (담당자 배정됨) | `--status-reporter-assigned` | same | `#6366f1` |
| `progress` (처리 중) | `--status-reporter-progress` | same | `#8b5cf6` |
| `prep` (해결 준비 중) | `--status-reporter-prep` | same | `#f2c46d` |
| `resolved` (해결됨) | `--status-reporter-resolved` | same | `#27a644` |
| `reopened` (다시 처리 중) | `--status-reporter-reopened` | same | `#eb5757` |
| `closed` (종료됨) | `--status-reporter-closed` | same | `#62666d` |

### 6.5 Internal task status (squared — `rounded-sm`) — referenced from VOC linked execution row, not authored here

| Status | Token | Raw |
|---|---|---|
| `backlog` | `--status-internal-backlog` | `#62666d` |
| `todo` | `--status-internal-todo` | `#8a8f98` |
| `doing` | `--status-internal-doing` | `#5e6ad2` |
| `review` | `--status-internal-review` | `#8b5cf6` |
| `done` | `--status-internal-done` | `#27a644` |
| `released` | `--status-internal-released` | `#02b8cc` |
| `reopened` | `--status-internal-reopened` | `#eb5757` |

### 6.6 Severity (chip + 3×16px bar)

| Severity | Token | Tailwind | Raw |
|---|---|---|---|
| `low` | `--severity-low` | `bg-severity-low/15 text-severity-low` | `#8a8f98` |
| `medium` | `--severity-medium` | same | `#f2c46d` |
| `high` | `--severity-high` | same | `#f08a4a` |
| `critical` | `--severity-critical` | same | `#eb5757` |

### 6.7 Density + radii

| Token | Tailwind | Value | Usage |
|---|---|---|---|
| `--row-height-compact` | `h-row-compact` | 44px | List dense mode (not used in Slice 3 VOC) |
| `--row-height-default` | `h-row-default` | 60px | VOC Inbox / My rows |
| `--row-height-expanded` | `h-row-expanded` | 96px | Triage Console rows |
| `--sidebar-width` | `w-sidebar` | 240px | Sidebar |
| `--sidebar-width-collapsed` | `w-sidebar-collapsed` | 56px | Collapsed sidebar |
| `--rail-width` | `w-rail` | 52px | Global rail (Slice 3 keeps the prototype's rail) |
| `--detail-panel-width` | `w-detail-panel` | 440px | Right detail panel (`min 360, max 520` per ui-design-system.md — Tailwind utility `min-w-[360px] max-w-[520px]`) |
| `--radius-sm` | `rounded-sm` | 2px | Tags |
| `--radius-md` | `rounded-md` | 6px | Default buttons, inputs, cards |
| `--radius-lg` | `rounded-lg` | 8px | Toasts, preview modal |
| `--radius-pill` | `rounded-full` | 9999px | Reporter status badge, MS pill |
| `--focus-ring` shadow | `shadow-focus` | `0 0 0 2px var(--color-pitch-black), 0 0 0 4px var(--color-neon-lime)` | keyboard focus ring on all interactive |

### 6.8 Neon Lime usage rule

`#e4f222` (Neon Lime) is **reserved**:

1. Primary action button background (`<Button variant="primary">`).
2. Focus ring (always).
3. The Reporter-facing-status-change accent stripe in `<ReporterStatusChangeBlock>` (its title color + 4% bg).

**Forbidden uses:** status badges (reporter or internal), severity, hover row backgrounds, link text, info accents. Reviewers reject PRs that color non-action surfaces Neon Lime.

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '90,108p' .review/SLICE-3-18-PLAN.md && sed -n '52,60p' .review/SLICE-3-18-PLAN.md" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:

**Dependencies install:**
```bash
pnpm --filter @fops/frontend add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline @tiptap/extension-placeholder
pnpm --filter @fops/ui add @tiptap/core @tiptap/pm @tiptap/html
```

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

**Dependencies install:**
```bash
# apps/frontend
pnpm --filter @fops/frontend add sonner cmdk @tailwindcss/typography
pnpm --filter @fops/frontend add @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-avatar @radix-ui/react-slot
# packages/ui (owner of shadcn primitives)
pnpm --filter @fops/ui add class-variance-authority tailwind-merge clsx lucide-react @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-avatar @radix-ui/react-slot
```

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba .review/SLICE-3-18-PLAN.md | sed -n '52,75p;90,106p;119,130p;144,177p;208,239p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
    52	
    53	**Dependencies install:**
    54	```bash
    55	# apps/frontend
    56	pnpm --filter @fops/frontend add sonner cmdk @tailwindcss/typography
    57	pnpm --filter @fops/frontend add @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-avatar @radix-ui/react-slot
    58	# packages/ui (owner of shadcn primitives)
    59	pnpm --filter @fops/ui add class-variance-authority tailwind-merge clsx lucide-react @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-toggle-group @radix-ui/react-select @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-avatar @radix-ui/react-slot
    60	```
    61	
    62	**Files:**
    63	- Rewrite: `packages/ui/src/styles/tokens.css` — verbatim port from `docs/design-prototype/styles.css` (~140 lines, all `--color-*` + layout + spacing + radius + shadow + typography vars).
    64	- Rewrite: `packages/ui/src/styles/semantic.css` — re-derive semantic tokens against new raw colors; remove shadcn HSL remap that conflicts with hex format.
    65	- Rewrite: `packages/ui/tailwind.preset.ts` — kebab-case keys (`surface-canvas`, `text-primary`, `severity-high`, etc.) mapped to `var(--…)` without `<alpha-value>`. Add spacing + radius + boxShadow extends.
    66	- Rewrite: `packages/ui/src/components/Button.tsx` — shadcn CVA Button, variants `default|secondary|destructive|outline|ghost|link`. Keep `primary|subtle` as aliases for backwards-compat (primary→default, subtle→ghost). Keep `size: sm|md|lg`. Drop `loading` prop unless trivially preserved.
    67	- Create: 15 shadcn primitives in `packages/ui/src/components/shadcn/`: `button.tsx` (re-export Button), `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toggle-group.tsx`, `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `tooltip.tsx`, `popover.tsx`, `tabs.tsx`, `skeleton.tsx`, `avatar.tsx`, `badge.tsx`. Each = standard shadcn CVA wrapper.
    68	- Modify: `packages/ui/src/index.ts` — re-export 15 shadcn primitives + cn + Button (now shadcn) + existing pickers.
    69	- Rewrite: `packages/ui/src/components/ManagedSystemPicker.tsx` — replace native `<select>` with shadcn ToggleGroup (chip style per spec §3.4) keeping `PickerOption[]` + `onChange(value: string|null)` dumb-prop contract.
    70	- Rewrite: `packages/ui/src/components/AnalyticsAreaPicker.tsx` — same pattern.
    71	- Modify: `apps/frontend/src/features/admin/permissions/request-access-button.tsx:115` — `variant="primary"` → `variant="default"` (or leave with primary alias).
    72	- Modify: `apps/frontend/src/styles.css` — keep `@import "@fops/ui/styles/tokens.css"` + `semantic.css` + tailwind directives.
    73	- Create: `packages/ui/__tests__/shadcn-smoke.test.tsx` — render each primitive once asserting no throw.
    74	
    75	**Dispatch (Sonnet):**
    90	
    91	**Dependencies install:**
    92	```bash
    93	pnpm --filter @fops/frontend add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline @tiptap/extension-placeholder
    94	pnpm --filter @fops/ui add @tiptap/core @tiptap/pm @tiptap/html
    95	```
    96	
    97	**Files:**
    98	- Create: `packages/ui/src/rich-content/extensions/attachmentRef.ts` — TipTap Node `{ name: 'attachmentRef', group: 'block', attrs: { id, name, sizeBytes, mimeType }, parseHTML/renderHTML/addNodeView }`.
    99	- Create: `packages/ui/src/rich-content/extensions/mention.ts` — TipTap Node `{ name: 'mention', group: 'inline', inline: true, attrs: { actor_id, label } }`.
   100	- Create: `packages/ui/src/rich-content/RichEditor.tsx` — props `{ surface: string, value?, defaultValue?, onChange, placeholder?, disabled?, minHeight?, toolbar?: ReactNode }`. Extensions: `StarterKit.configure({ image: false })` + Link + Underline + Placeholder + attachmentRef + mention. Returns editor instance via render-prop for toolbar.
   101	- Create: `packages/ui/src/rich-content/RichContentRenderer.tsx` — props `{ doc: TipTapDoc, mode: 'reporter_visible'|'internal' }`. Uses `generateHTML` from `@tiptap/html` with same extension set. `reporter_visible` strips mention nodes pre-render.
   102	- Modify: `packages/ui/src/index.ts` — export RichEditor, RichContentRenderer, attachmentRef, mention, types.
   103	- Create: `apps/frontend/src/routes/dev-rich-editor.tsx` — temporary demo route (keep behind `import.meta.env.DEV` guard or delete in Final). Renders RichEditor + RichContentRenderer side by side, with surface picker + mode toggle.
   104	- Create: `packages/ui/__tests__/rich-content.test.tsx` — controlled value round-trips through onChange; reporter_visible strips mentions; internal preserves; attachmentRef + mention attrs round-trip TipTap doc → HTML → TipTap doc.
   105	
   106	**Dispatch (Sonnet):**
   119	## C3 — sonner Toaster + apiClient + errorMapper + idempotency hook
   120	
   121	**Goal:** `<Toaster>` mounted in `__root.tsx`. `apiClient`, `errorMapper`, `useIdempotencyKey` land in `apps/frontend/src/lib/api/`. All Slice 3 ADR-0012 codes covered with Korean copy.
   122	
   123	**Files:**
   124	- Create: `apps/frontend/src/lib/api/errorMapper.ts` — function mapping `{ code, detail }` to `{ tone: 'error'|'warning'|'info', message: string, action?: { label, run } }`. Catalog covers: validation.failed, voc.severity_not_user_settable, voc.reporter_status_via_public_update_only, validation.unexpected_field, rich_content.disallowed_node, rich_content.external_image_forbidden, attachment.unsupported_pending_storage_slice, conflict.stale_write, conflict.triage_already_committed, conflict.parent_archived, conflict.record_archived, conflict.idempotency_key_reuse, not_found.record, permission.denied, permission.scope_required, reporter_facing_status.invalid_transition, reporter_facing_status.gate_blocked, rate_limited.actor. Korean copy.
   125	- Create: `apps/frontend/src/lib/api/client.ts` — `apiClient(method, path, { body?, idempotencyKey?, ifMatch?, signal? })`. Auto-mint Idempotency-Key UUIDv4 on POST/PATCH/DELETE when not supplied. Attach `Authorization` from session store. Parse JSON. Non-2xx → throw `ApiError extends Error { code, detail, status, requestId }`. 304 → return `{ status: 304, etag }`.
   126	- Create: `apps/frontend/src/lib/api/useIdempotencyKey.ts` — `useIdempotencyKey()` returns stable UUIDv4 per render-tree until consumed; `markConsumed()` mints fresh.
   127	- Create: `apps/frontend/src/lib/api/types.ts` — `ApiErrorEnvelope` matching BE `errors/envelope.ts`.
   128	- Modify: `apps/frontend/src/routes/__root.tsx` — mount `<Toaster position="bottom-center" />` from `sonner`.
   129	- Create: `apps/frontend/src/lib/api/__tests__/errorMapper.test.ts` — enumerate every code in catalog.
   130	- Create: `apps/frontend/src/lib/api/__tests__/client.test.ts` — mock fetch: POST mints Idempotency-Key, GET omits, Authorization attached, 422 throws ApiError, 304 returns ETag.
   144	## C4 — AppShell + useFullscreenPanel hook
   145	
   146	**Goal:** `<AppShell>` mounts Rail/Sidebar/Main/DetailPanelSlot. 50px header rhythm enforced (ADR-0020). Sidebar collapse persists to localStorage. `useFullscreenPanel` hook ready for #20 to consume.
   147	
   148	**Files:**
   149	- Create: `apps/frontend/src/lib/layout/AppShell.tsx` — flex row Rail(52) + Sidebar(240/56) + Main(flex-1) + DetailPanelSlot(440 conditional). Headers 50px.
   150	- Create: `apps/frontend/src/lib/layout/AppRail.tsx` — 52px vertical, workspace switcher placeholder + lucide-react utility icons.
   151	- Create: `apps/frontend/src/lib/layout/AppSidebar.tsx` — 240px nav list. Slice 3 entries: Inbox, My VOCs, Triage, + New VOC. Collapse button writes `localStorage.appSidebarCollapsed`.
   152	- Create: `apps/frontend/src/lib/layout/DetailPanelSlot.tsx` — fixed 440 right column. min 360 / max 520. Hidden when no content registered via `useDetailPanelSlot()`.
   153	- Create: `apps/frontend/src/lib/layout/useDetailPanelSlot.ts` — context-based slot register/clear hook.
   154	- Create: `apps/frontend/src/lib/panel/useFullscreenPanel.ts` — `[isFullscreen, toggle]`. Esc collapses. Route change clears.
   155	- Create: `apps/frontend/src/lib/layout/__tests__/AppShell.test.tsx` — Rail/Sidebar/Main present; sidebar collapse toggle writes localStorage; DetailPanelSlot collapses when empty.
   156	- Create: `apps/frontend/src/lib/panel/__tests__/useFullscreenPanel.test.tsx` — toggle flips boolean; Esc dispatches collapse; route change clears (mock router).
   157	
   158	**Dispatch (Sonnet):**
   159	- Read first: `docs/design-prototype/app.jsx`, `docs/adr/0020-*.md`, `docs/frontend/specs/voc.md` §6.7.
   160	- Constraint: do not wire any route to AppShell yet — C5 owns route mounting.
   161	- Constraint: AppRail content stays placeholder (entries land per-feature per AGENTS.md two-consumer rule).
   162	- Verification: typecheck + test.
   163	
   164	**Commit:** `feat(slice3 #18): AppShell (Rail+Sidebar+Main+DetailPanelSlot) + useFullscreenPanel`
   165	
   166	---
   167	
   168	## C5 — /vocs route shell
   169	
   170	**Goal:** TanStack file-route `/vocs` mounts AppShell with 4 sidebar entries. Zod search schema validates query params. Placeholder main keyed off `view`/`action`. routeTree regen clean.
   171	
   172	**Files:**
   173	- Create: `apps/frontend/src/routes/vocs.tsx` — `createFileRoute('/vocs')` with validateSearch zod. Component renders `<AppShell>` + sidebar items linking to `?view=inbox|my|triage` + `?action=create`. Main = `<p>VOC routes land in #19/#20/#21 — current view: {view ?? action}</p>`.
   174	- Modify: `apps/frontend/src/routes/__root.tsx` — wrap children with `<AppShell>` for authed routes (or wrap inside vocs.tsx only — decide in dispatch).
   175	- Auto-regen: `apps/frontend/src/routeTree.gen.ts` (TanStackRouterVite plugin handles on dev).
   176	- Create: `apps/frontend/src/routes/__tests__/vocs.test.tsx` — navigating to `/vocs?view=inbox` resolves; invalid `?view=foo` rejected by zod; sidebar `+ New VOC` href = `/vocs?action=create`.
   177	- Delete: `apps/frontend/src/routes/dev-rich-editor.tsx` IF it was added in C2 and is no longer needed (or keep behind DEV flag).
   208	2. Playwright MCP: screenshot `/vocs?view=inbox` + `/vocs?action=create` + prototype `screen-voc.jsx` + `screen-voc-create.jsx`. Embed in final report.
   209	3. Cycle 1: `codex review --base develop - <<'EOF' …` brief. Output → `.review/SLICE-3-18-REVIEW-CYCLE-1-codex.md`.
   210	4. Reinforce gaps via Sonnet dispatch (narrow file set per finding).
   211	5. Cycle 2: dispatch Opus subagent (general-purpose model=opus) with adversarial brief. Output → `.review/SLICE-3-18-REVIEW-CYCLE-2.md`.
   212	6. Reinforce gaps via Sonnet.
   213	7. CHECKPOINT 4: static HTML report — ship summary, follow-ups table, diff stats, test counts. AskUserQuestion: "최종 OK?"
   214	8. `git push -u origin feature/18-fe-prologue` (agent allowed per orchestration §1).
   215	9. `gh pr create --base develop --title "feat(slice3 #18): FE prologue — shadcn + TipTap + Pack 17 tokens + AppShell + /vocs shell" --body @.review/SLICE-3-18-PR-BODY.md`.
   216	10. After user merge OK: `gh pr merge --squash --delete-branch`. Do NOT close issue (orchestration §2).
   217	11. Sync memory: write `project_slice3_18_pr.md`, update MEMORY.md.
   218	12. Sync llmwiki: append #18 PR commit to relevant pages (rich-content-sanitizer, shell-taxonomy, bounded-context-voc).
   219	
   220	---
   221	
   222	## Cross-chunk invariants
   223	
   224	- Every chunk ends with `pnpm typecheck` green.
   225	- No chunk touches files outside its declared file set without re-dispatch.
   226	- Sonnet dispatches read AGENTS.md hierarchy first (`apps/frontend/AGENTS.md` mandatory).
   227	- Tests added per chunk run live, not deferred.
   228	- `git add -A` BANNED — explicit file paths only (per memory `feedback_orchestration`).
   229	
   230	## Out of scope (lands in #19/#20/#21)
   231	
   232	VOC list / row / toolbar / filter / sort, DetailPanel components, badge primitives, EntityHoverPreview, ComposerTabs, triage queue, severity picker, real attachment UI, mobile layout, AppRail content, CommandMenu wiring (cmdk installed only).
   233	
   234	## Risks
   235	
   236	- Pack 17 token swap may break Slice 1/2 admin pages visually (admin uses semantic tokens → should auto-light-render but verify in C1 checkpoint).
   237	- TipTap `generateHTML` from `@tiptap/html` requires same extension set on render side → ensure renderer imports custom extensions, not just StarterKit.
   238	- TanStack Router file routes regen — ensure vite plugin runs during typecheck CI (currently dev-only?).
   239	- shadcn HSL CSS vars conflict with hex tokens — semantic.css must explicitly remap, not inherit shadcn defaults.

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba .review/SLICE-3-18-PLAN.md | sed -n '1,15p;29,43p;80,83p;109,113p;138,140p;194,198p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
     1	# Slice 3 #18 — FE Prologue Implementation Plan
     2	
     3	**Goal:** Land shadcn baseline + TipTap RichEditor + sonner + Pack-17 light tokens + AppShell + `/vocs` route shell so #19/#20/#21 can build VOC surfaces.
     4	
     5	**Architecture:** 6 chunks (C0-C5) dispatched sequentially. Each chunk = one Sonnet subagent dispatch with single Goal + narrow file set. Main session orchestrates, integrates between chunks, runs typecheck, dispatches next. 4 visual checkpoints between chunks (playground/report HTML + AskUserQuestion).
     6	
     7	**Tech Stack:** React 19, TanStack Router 1.170, TipTap 2, shadcn/ui + Radix, Tailwind 3, sonner, cmdk, Zod, react-hook-form, lucide-react. CVA + tailwind-merge for variants.
     8	
     9	**Locked decisions (2026-05-20 user confirm):**
    10	- Q1=A: Pack 17 (Samsung-light) verbatim port. ADR-0016 supersede via new ADR-0021. hex format (drop R G B triples).
    11	- Q2=A: shadcn at `packages/ui/src/components/shadcn/`, re-exported from `packages/ui/src/index.ts`.
    12	- Q3=A: Existing `Button.tsx` replaced by shadcn CVA Button. variant primary→default alias. 1 caller migrated.
    13	- Q4=A: 6 chunks + 4 checkpoints (C1, C2, C4+C5 merged, Final).
    14	- 2026-05-20: DESIGN.md already updated to Pack 17 light values (this session).
    15	
    29	## C0 — ADR-0021 + token-format prep + branch
    30	
    31	**Goal:** Land ADR-0021 (Pack 17 Light System) superseding ADR-0016. Update ADR-0016 frontmatter to `superseded-by: 0021`. No code changes yet.
    32	
    33	**Files:**
    34	- Create: `docs/adr/0021-pack-17-samsung-light-design-system.md`
    35	- Modify: `docs/adr/0016-frontend-color-tokens.md` (or whichever ADR locks dark palette — locate first) — add supersede marker.
    36	
    37	**Tasks:**
    38	1. Locate existing dark-palette ADR (likely 0016). `ls docs/adr/ | grep -i color\|token\|design`.
    39	2. Write ADR-0021 with: context (Pack 17 prototype refresh + Samsung-blue accent), decision (verbatim port from `docs/design-prototype/styles.css` to `packages/ui/src/styles/tokens.css` + `semantic.css`, hex format, drop `<alpha-value>` Tailwind composition), consequences (Slice 1/2 surfaces auto re-render via tokens, Button variants remapped, focus ring tinted Samsung-blue).
    40	3. Add `supersedes: 0016` to ADR-0021 frontmatter and `superseded-by: 0021` to ADR-0016.
    41	4. Commit: `docs(slice3 #18): ADR-0021 Pack 17 Samsung-light supersedes ADR-0016`.
    42	
    43	**Dispatch:** Haiku subagent (doc-only). 1 file create + 1 file edit.
    80	
    81	**CHECKPOINT 1** — playground HTML: prototype components vs impl components, token side-by-side, Button variant matrix. Pair AskUserQuestion: "토큰 + shadcn baseline OK?"
    82	
    83	**Commit:** `feat(slice3 #18): Pack 17 tokens + shadcn baseline + pickers on ToggleGroup`
   109	- Constraint: editor must NOT register Image extension (StarterKit image: false).
   110	- Constraint: no API calls. Demo route uses local state only.
   111	- Verification: `pnpm --filter @fops/ui test`, `pnpm --filter @fops/frontend dev`, manual visit `/dev-rich-editor`.
   112	
   113	**CHECKPOINT 2** — playground HTML: RichEditor surface toggle (4 surfaces), mode toggle, mention/attachment node demo, prototype rich-editor.jsx screenshot side-by-side. AskUserQuestion: "에디터 UX prototype 일치?"
   138	**Commit:** `feat(slice3 #18): sonner Toaster + apiClient + errorMapper + useIdempotencyKey`
   139	
   140	(No checkpoint — not visual.)
   194	- Verification: `pnpm --filter @fops/frontend dev`, navigate `/vocs?view=inbox`, `/vocs?action=create`. `pnpm typecheck && test`.
   195	
   196	**CHECKPOINT 3 (C4+C5 merged)** — playground HTML: AppShell layout with collapse toggle, fullscreen toggle, 50px header overlay, prototype `screen-voc.jsx` side-by-side, /vocs route screenshot. AskUserQuestion: "셸 정렬 OK?"
   197	
   198	**Commit:** `feat(slice3 #18): /vocs route shell + zod search schema + AppShell mount`

hook: PostToolUse
hook: PostToolUse Completed
codex
# PLAN Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0 (blocks execution): 2 findings
- P1 (must fix before PR): 6 findings
- P2 (should fix during chunk): 3 findings
- P3 (nice-to-have / follow-up issue): 0 findings

## Findings

### P0-1: Hex token plan breaks Tailwind opacity utilities
**File:line:** `.review/SLICE-3-18-PLAN.md:65`  
**Issue:** The plan maps Tailwind colors to `var(--…)` and explicitly drops `<alpha-value>`, while the VOC visual contract still requires classes like `bg-status-reporter-received/15` and `bg-severity-high/15` (`docs/frontend/specs/voc.md:479`, `docs/frontend/specs/voc.md:504`). Tailwind 3 cannot derive `/15` opacity from an opaque hex CSS var.  
**Why it matters:** Status/severity chips and any translucent token utility silently render wrong or not at all. This is not just a token-format migration; it changes the utility contract used by Slice 3 surfaces.  
**Suggested fix:** Add a concrete Tailwind v3 strategy before implementation: either define explicit alpha tokens/classes (`--severity-high-bg`, etc.) or use a verified CSS Color 4/Tailwind-compatible mapping. Add a token snapshot test freezing token name + hex + opacity utility output.

### P0-2: Shell plan violates ADR-0020’s required component taxonomy
**File:line:** `.review/SLICE-3-18-PLAN.md:146`  
**Issue:** C4 builds only `AppShell` in `apps/frontend/src/lib/layout/`, but ADR-0020 requires every route to classify as `PageShell`, `ListShell`, or `WorkbenchShell` and says `packages/ui/src/layout/` must export exactly those three shell components (`docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:15`, `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:48`).  
**Why it matters:** The plan reintroduces the fourth-shell drift the ADR exists to prevent. `/vocs?view=inbox` and `/vocs?view=triage` need different shell families, not one generic app frame.  
**Suggested fix:** Rewrite C4 around `packages/ui/src/layout/{PageShell,ListShell,WorkbenchShell}.tsx` plus shared 50px header primitives. If an app frame is still needed, make it a private route frame that composes the three shells, not the shell API.

### P1-1: Route mounting is left undecided inside the dispatch
**File:line:** `.review/SLICE-3-18-PLAN.md:174`  
**Issue:** C5 says to wrap `__root.tsx` with `AppShell` for authed routes “or wrap inside vocs.tsx only — decide in dispatch.” Existing root is a simple global wrapper with `<Outlet />` (`apps/frontend/src/routes/__root.tsx:3`).  
**Why it matters:** This is an architectural decision, not implementation detail. Root wrapping can break login/admin surfaces; route-local wrapping can fail the issue body’s “authed routes” shell expectation.  
**Suggested fix:** Decide in the plan. Prefer an authenticated layout route or explicit route-group wrapper, then classify admin pages as `PageShell` and VOC list/triage as `ListShell`/`WorkbenchShell`.

### P1-2: TipTap dependencies are installed in the wrong workspace
**File:line:** `.review/SLICE-3-18-PLAN.md:93`  
**Issue:** `RichEditor.tsx` lives in `packages/ui`, but `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-underline`, and `@tiptap/extension-placeholder` are installed only in `apps/frontend`.  
**Why it matters:** `@fops/ui` will import packages it does not declare. Workspace builds can pass locally by hoisting and fail in CI/package isolation.  
**Suggested fix:** Move all TipTap runtime deps used by `packages/ui/src/rich-content/*` into `@fops/ui` dependencies. Keep only app-owned deps in `apps/frontend`.

### P1-3: Button replacement may break an existing public prop
**File:line:** `.review/SLICE-3-18-PLAN.md:66`  
**Issue:** The plan says “Drop `loading` prop unless trivially preserved.” Current `Button` exposes `loading?: boolean`, disables while loading, and sets `aria-busy` (`packages/ui/src/components/Button.tsx:12`, `packages/ui/src/components/Button.tsx:42`).  
**Why it matters:** This is an exported `packages/ui` contract. Dropping it because shadcn does not have it is a regression.  
**Suggested fix:** Preserve `loading` in the CVA Button wrapper and add a regression test for disabled + `aria-busy`.

### P1-4: shadcn primitive list is internally inconsistent and misses spec-needed bases
**File:line:** `.review/SLICE-3-18-PLAN.md:67`  
**Issue:** The plan says “15 shadcn primitives” but lists 17. It also does not resolve spec references to `DropdownMenu` for detail actions and `Command` for the command palette (`docs/frontend/specs/voc.md:90`, `docs/frontend/specs/voc.md:167`).  
**Why it matters:** A worker can implement the wrong count and still think it followed the plan. Missing primitives get pushed into #19/#20, defeating the FE prologue purpose.  
**Suggested fix:** Replace “15” with the exact locked list. Add `DropdownMenu` if detail header actions are expected in Slice 3, and explicitly state whether `Command` wrapper is deferred or included.

### P1-5: apiClient idempotency is not tied to If-Match semantics
**File:line:** `.review/SLICE-3-18-PLAN.md:125`  
**Issue:** The backend includes `If-Match` in the idempotency hash and warns that a fresh `If-Match` requires a fresh key (`apps/backend/src/modules/voc/routes.ts:214`). The plan exposes `ifMatch?` and a stable `useIdempotencyKey`, but does not define when the key is consumed/refreshed after stale-write refetch.  
**Why it matters:** PATCH retry flows can produce `409 conflict.idempotency_key_reuse` even when the user is doing the correct refetch-and-resubmit flow.  
**Suggested fix:** Add client semantics: mutation hooks must mint a new idempotency key when `If-Match` changes. Test PATCH with same key + changed `ifMatch` avoidance.

### P1-6: errorMapper coverage is incomplete against the shared code enum
**File:line:** `.review/SLICE-3-18-PLAN.md:124`  
**Issue:** The catalog omits shared codes the base client can see, including `validation.malformed_idempotency_key`, `rate_limited.ip`, auth session codes, and `internal.unexpected` (`packages/shared/src/errors/codes.ts:8`, `packages/shared/src/errors/codes.ts:15`, `packages/shared/src/errors/codes.ts:28`, `packages/shared/src/errors/codes.ts:38`).  
**Why it matters:** The test only enumerates “every code in catalog” (`.review/SLICE-3-18-PLAN.md:129`), so missing codes will not fail.  
**Suggested fix:** Generate the mapper coverage test from `ERROR_CODES`. Provide specific Korean copy for Slice 3 codes and a sane fallback for generic platform codes.

### P2-1: C1 is too large for one dispatch
**File:line:** `.review/SLICE-3-18-PLAN.md:51`  
**Issue:** C1 combines token replacement, Tailwind preset rewrite, shadcn dependency installation, 17 primitives, Button migration, picker rebuilds, exports, and smoke tests.  
**Why it matters:** This is the highest-risk chunk and has multiple unrelated failure modes. Review and rollback will be messy.  
**Suggested fix:** Split C1 into C1a tokens/Tailwind snapshot, C1b shadcn baseline/Button, C1c picker rebuild + existing app migration.

### P2-2: C3 has no toast UX checkpoint
**File:line:** `.review/SLICE-3-18-PLAN.md:140`  
**Issue:** The plan says no checkpoint because C3 is “not visual,” but it mounts Sonner and defines Korean error copy. Toast position, tone, and action styling are user-visible.  
**Why it matters:** Toasts can be technically mounted but visually inconsistent with Pack 17.  
**Suggested fix:** Add a small C3 checkpoint or include it in C4 with forced success/error/rate-limit/idempotency toasts.

### P2-3: Test plan does not enforce failure-first or token fidelity
**File:line:** `.review/SLICE-3-18-PLAN.md:73`  
**Issue:** C1 only adds a shadcn smoke test. There is no failing-first token test, no snapshot for prototype token names/hex pairs, and no check that Tailwind keys exist for every required semantic token.  
**Why it matters:** The hardest part of #18 is not “components render”; it is preserving the design-token contract while replacing ADR-0016.  
**Suggested fix:** Add tests that compare `docs/design-prototype/styles.css` token names/values against `packages/ui/src/styles/*`, and assert generated Tailwind theme keys for surfaces/text/status/severity/density.

## Quality call
This plan is not executable as-is. The shell architecture and Tailwind hex/opacity strategy need to be fixed before dispatching workers; otherwise the implementation will either violate ADR-0020 or produce a token system that cannot satisfy the visual contract. With the P0/P1 fixes, the plan becomes executable.

## What I did NOT review
- I did not run frontend builds or tests.
- I did not inspect every existing Slice 1/2 route visually.
- I did not validate exact Korean copy quality beyond checking coverage risk.
- I did not verify GitHub issue comments beyond `gh issue view 18` body context.
hook: Stop
hook: Stop Completed
tokens used
92,934
# PLAN Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0 (blocks execution): 2 findings
- P1 (must fix before PR): 6 findings
- P2 (should fix during chunk): 3 findings
- P3 (nice-to-have / follow-up issue): 0 findings

## Findings

### P0-1: Hex token plan breaks Tailwind opacity utilities
**File:line:** `.review/SLICE-3-18-PLAN.md:65`  
**Issue:** The plan maps Tailwind colors to `var(--…)` and explicitly drops `<alpha-value>`, while the VOC visual contract still requires classes like `bg-status-reporter-received/15` and `bg-severity-high/15` (`docs/frontend/specs/voc.md:479`, `docs/frontend/specs/voc.md:504`). Tailwind 3 cannot derive `/15` opacity from an opaque hex CSS var.  
**Why it matters:** Status/severity chips and any translucent token utility silently render wrong or not at all. This is not just a token-format migration; it changes the utility contract used by Slice 3 surfaces.  
**Suggested fix:** Add a concrete Tailwind v3 strategy before implementation: either define explicit alpha tokens/classes (`--severity-high-bg`, etc.) or use a verified CSS Color 4/Tailwind-compatible mapping. Add a token snapshot test freezing token name + hex + opacity utility output.

### P0-2: Shell plan violates ADR-0020’s required component taxonomy
**File:line:** `.review/SLICE-3-18-PLAN.md:146`  
**Issue:** C4 builds only `AppShell` in `apps/frontend/src/lib/layout/`, but ADR-0020 requires every route to classify as `PageShell`, `ListShell`, or `WorkbenchShell` and says `packages/ui/src/layout/` must export exactly those three shell components (`docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:15`, `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:48`).  
**Why it matters:** The plan reintroduces the fourth-shell drift the ADR exists to prevent. `/vocs?view=inbox` and `/vocs?view=triage` need different shell families, not one generic app frame.  
**Suggested fix:** Rewrite C4 around `packages/ui/src/layout/{PageShell,ListShell,WorkbenchShell}.tsx` plus shared 50px header primitives. If an app frame is still needed, make it a private route frame that composes the three shells, not the shell API.

### P1-1: Route mounting is left undecided inside the dispatch
**File:line:** `.review/SLICE-3-18-PLAN.md:174`  
**Issue:** C5 says to wrap `__root.tsx` with `AppShell` for authed routes “or wrap inside vocs.tsx only — decide in dispatch.” Existing root is a simple global wrapper with `<Outlet />` (`apps/frontend/src/routes/__root.tsx:3`).  
**Why it matters:** This is an architectural decision, not implementation detail. Root wrapping can break login/admin surfaces; route-local wrapping can fail the issue body’s “authed routes” shell expectation.  
**Suggested fix:** Decide in the plan. Prefer an authenticated layout route or explicit route-group wrapper, then classify admin pages as `PageShell` and VOC list/triage as `ListShell`/`WorkbenchShell`.

### P1-2: TipTap dependencies are installed in the wrong workspace
**File:line:** `.review/SLICE-3-18-PLAN.md:93`  
**Issue:** `RichEditor.tsx` lives in `packages/ui`, but `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-underline`, and `@tiptap/extension-placeholder` are installed only in `apps/frontend`.  
**Why it matters:** `@fops/ui` will import packages it does not declare. Workspace builds can pass locally by hoisting and fail in CI/package isolation.  
**Suggested fix:** Move all TipTap runtime deps used by `packages/ui/src/rich-content/*` into `@fops/ui` dependencies. Keep only app-owned deps in `apps/frontend`.

### P1-3: Button replacement may break an existing public prop
**File:line:** `.review/SLICE-3-18-PLAN.md:66`  
**Issue:** The plan says “Drop `loading` prop unless trivially preserved.” Current `Button` exposes `loading?: boolean`, disables while loading, and sets `aria-busy` (`packages/ui/src/components/Button.tsx:12`, `packages/ui/src/components/Button.tsx:42`).  
**Why it matters:** This is an exported `packages/ui` contract. Dropping it because shadcn does not have it is a regression.  
**Suggested fix:** Preserve `loading` in the CVA Button wrapper and add a regression test for disabled + `aria-busy`.

### P1-4: shadcn primitive list is internally inconsistent and misses spec-needed bases
**File:line:** `.review/SLICE-3-18-PLAN.md:67`  
**Issue:** The plan says “15 shadcn primitives” but lists 17. It also does not resolve spec references to `DropdownMenu` for detail actions and `Command` for the command palette (`docs/frontend/specs/voc.md:90`, `docs/frontend/specs/voc.md:167`).  
**Why it matters:** A worker can implement the wrong count and still think it followed the plan. Missing primitives get pushed into #19/#20, defeating the FE prologue purpose.  
**Suggested fix:** Replace “15” with the exact locked list. Add `DropdownMenu` if detail header actions are expected in Slice 3, and explicitly state whether `Command` wrapper is deferred or included.

### P1-5: apiClient idempotency is not tied to If-Match semantics
**File:line:** `.review/SLICE-3-18-PLAN.md:125`  
**Issue:** The backend includes `If-Match` in the idempotency hash and warns that a fresh `If-Match` requires a fresh key (`apps/backend/src/modules/voc/routes.ts:214`). The plan exposes `ifMatch?` and a stable `useIdempotencyKey`, but does not define when the key is consumed/refreshed after stale-write refetch.  
**Why it matters:** PATCH retry flows can produce `409 conflict.idempotency_key_reuse` even when the user is doing the correct refetch-and-resubmit flow.  
**Suggested fix:** Add client semantics: mutation hooks must mint a new idempotency key when `If-Match` changes. Test PATCH with same key + changed `ifMatch` avoidance.

### P1-6: errorMapper coverage is incomplete against the shared code enum
**File:line:** `.review/SLICE-3-18-PLAN.md:124`  
**Issue:** The catalog omits shared codes the base client can see, including `validation.malformed_idempotency_key`, `rate_limited.ip`, auth session codes, and `internal.unexpected` (`packages/shared/src/errors/codes.ts:8`, `packages/shared/src/errors/codes.ts:15`, `packages/shared/src/errors/codes.ts:28`, `packages/shared/src/errors/codes.ts:38`).  
**Why it matters:** The test only enumerates “every code in catalog” (`.review/SLICE-3-18-PLAN.md:129`), so missing codes will not fail.  
**Suggested fix:** Generate the mapper coverage test from `ERROR_CODES`. Provide specific Korean copy for Slice 3 codes and a sane fallback for generic platform codes.

### P2-1: C1 is too large for one dispatch
**File:line:** `.review/SLICE-3-18-PLAN.md:51`  
**Issue:** C1 combines token replacement, Tailwind preset rewrite, shadcn dependency installation, 17 primitives, Button migration, picker rebuilds, exports, and smoke tests.  
**Why it matters:** This is the highest-risk chunk and has multiple unrelated failure modes. Review and rollback will be messy.  
**Suggested fix:** Split C1 into C1a tokens/Tailwind snapshot, C1b shadcn baseline/Button, C1c picker rebuild + existing app migration.

### P2-2: C3 has no toast UX checkpoint
**File:line:** `.review/SLICE-3-18-PLAN.md:140`  
**Issue:** The plan says no checkpoint because C3 is “not visual,” but it mounts Sonner and defines Korean error copy. Toast position, tone, and action styling are user-visible.  
**Why it matters:** Toasts can be technically mounted but visually inconsistent with Pack 17.  
**Suggested fix:** Add a small C3 checkpoint or include it in C4 with forced success/error/rate-limit/idempotency toasts.

### P2-3: Test plan does not enforce failure-first or token fidelity
**File:line:** `.review/SLICE-3-18-PLAN.md:73`  
**Issue:** C1 only adds a shadcn smoke test. There is no failing-first token test, no snapshot for prototype token names/hex pairs, and no check that Tailwind keys exist for every required semantic token.  
**Why it matters:** The hardest part of #18 is not “components render”; it is preserving the design-token contract while replacing ADR-0016.  
**Suggested fix:** Add tests that compare `docs/design-prototype/styles.css` token names/values against `packages/ui/src/styles/*`, and assert generated Tailwind theme keys for surfaces/text/status/severity/density.

## Quality call
This plan is not executable as-is. The shell architecture and Tailwind hex/opacity strategy need to be fixed before dispatching workers; otherwise the implementation will either violate ADR-0020 or produce a token system that cannot satisfy the visual contract. With the P0/P1 fixes, the plan becomes executable.

## What I did NOT review
- I did not run frontend builds or tests.
- I did not inspect every existing Slice 1/2 route visually.
- I did not validate exact Korean copy quality beyond checking coverage risk.
- I did not verify GitHub issue comments beyond `gh issue view 18` body context.
