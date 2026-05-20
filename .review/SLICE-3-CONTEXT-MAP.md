# SLICE-3 CONTEXT MAP

**Generated:** 2026-05-21 · **Branch tip:** `develop @ c6f620e` · **Open issues count:** 22

Single source for "where are we right now" across Slice 3. Refresh when status changes materially. NOT a substitute for `CONTEXT.md` (domain language) or `AGENTS.md` (engineering rules).

---

## §1 · Slice 3 progress

### Closed (12 issues, in dep order)

| # | Title | PR | Commit | Date |
|---|---|---|---|---|
| 12 | VOC foundation (mig 0010+0011) | — | (on main, pre-rule) | 2026-05-17 |
| 13 | POST /vocs Reporter Create | — | (on main, pre-rule) | 2026-05-18 |
| 14 | PATCH /vocs/:id triage commit | #36 | 982247d | 2026-05-18 |
| 15 | GET /vocs (list + detail + conversation) | #37 | f1c0672 | 2026-05-19 |
| 16 | POST conversation routes (public-update / reporter-reply / internal-comment) | #39 | 0a76f85 | 2026-05-19 |
| 23 | Sanitizer attr allowlist | #40 | 5b4d3f4 | 2026-05-19 |
| 24 | Sanitizer DoS caps (maxDepth / maxNodes / maxMarks) | #46 | 97ec078 | 2026-05-19 |
| 17 | PATCH /vocs/:id/description Reporter pre-triage edit (**BE EXIT**) | #47 | e6577eb | 2026-05-20 |
| 18 | FE prologue (Pack 17 + shadcn + TipTap + AppFrame + 3-shell + apiClient) | #48 | 7cb181a | 2026-05-20 |
| 52 | lib/api consolidation (4-domain split) | #53 | 2acb21d | 2026-05-20 |
| 50 | apiClient rate-limit headers + errorMapper inline wait | #54 | 510630f | 2026-05-20 |
| 19 | VOC Create UI `/vocs?action=create` | #56 | c6f620e | 2026-05-20 |

### Open — Slice 3 milestone (3 remaining)

| # | Title | Deps | Status |
|---|---|---|---|
| **20** | VOC Inbox + My VOCs + Detail panel (read-only) | #15, #18 ✓ | **NEXT** — PLAN in `.review/SLICE-3-20-PLAN.md` |
| 21 | Triage console + composers + status change + Reporter pre-triage edit modal | #14/#16/#17/#20 | blocked by #20 |
| 22 | Attachment storage slice (MinIO + POST /attachments + retroactive wire) | independent | can run in parallel late |

### Open — follow-ups (already filed)

P0/P1/P2 sanitizer + render: #41, #42, #43, #44, #45
P1 BE drift: #25, #26, #27 · P2: #28 · P3: #29-#34
P2 FE follow-ups: #49 (RichEditor surface constraint), #51 (ChipPicker extract), **#55 (#19 visual polish)**

---

## §2 · Module ownership map (post-Slice 3 BE + FE foundation)

### `apps/backend/src/`
- `modules/voc/` — POST/GET/PATCH /vocs, conversation routes, edit-description (Slice 3 BE complete)
- `modules/admin/` — managed-systems + analytics-areas (Slice 2)
- `lib/errors.ts:60` — `detail.fields = Array<{ path, code }>` shape (REFERENCED IN FE)
- `lib/sanitizer/` — TipTap surface enforcement (rich_content.*, attr allowlist, DoS caps)
- `server.ts:156` — `@fastify/rate-limit` emitting x-ratelimit-* + retry-after headers
- 558 tests pass (186 + 372 skipped)

### `packages/shared/src/`
- `vocs/` — create-request, list-item, list-query, detail, conversation*, patch-request, edit-description-request, internal-comment-request, public-update-request, reporter-reply-request
- `errors/codes.ts` — ADR-0012 ErrorEnvelope + ERROR_CODES enum
- `enums/audit-events.ts` — voc event keys (ADR-0008)
- `permissions/` — capability schemas (Slice 1)
- 236 tests pass

### `packages/ui/src/` (Pack 17 light · ADR-0021)
- `layout/` — PageShell / ListShell / WorkbenchShell (ADR-0020 lock)
- `components/` — Button, ManagedSystemPicker, AnalyticsAreaPicker, shadcn/* (input/textarea/label/select/checkbox/radio-group/toggle-group/card/dialog/alert-dialog/alert/tooltip/hover-card/popover/sheet/tabs/skeleton/avatar/badge/dropdown-menu/combobox)
- `rich-content/` — RichEditor (surface enum + render-prop toolbar), RichContentRenderer, AttachmentRef + Mention extensions
- `forms/FieldLabel` (#19)
- `feedback/DirtyConfirmation` (#19)
- 174 tests pass

### `apps/frontend/src/`
- `routes/` — `__root.tsx` (Toaster), `login.tsx`, `_authed.tsx` (auth guard + AppFrame mount), `_authed/admin/*`, `_authed/vocs.tsx` (per-view shell selector)
- `features/voc/` — `routes/CreateRoute.tsx`, `components/create/{VocCreateScreen, SourceContextSegmented, AttachmentDropzone, ReporterCard, SeverityDisclaimerCard, VocDescriptionToolbar, rich-toolbar-voc-description}`, `hooks/useVocCreateMutation`
- `features/admin/permissions/` — permission-state-view, request-access-button, use-permission-check (Slice 1)
- `lib/api/` — single barrel: client (apiClient + ApiResponse w/ rateLimit), types (ApiError + RateLimitInfo), errorMapper, useIdempotencyKey, auth, permissions, managed-systems, analytics-areas
- `lib/auth/useMe.ts` — react-query /me wrapper (#19)
- `lib/layout/` — AppFrame, AppSidebar
- `lib/panel/` — useFullscreenPanel
- 108 tests pass

### Total: **1076 tests** across 4 packages

---

## §3 · Key contracts locked

| Contract | Source | Value |
|---|---|---|
| **`validation.failed` detail shape** | `apps/backend/src/lib/errors.ts:60` | `detail.fields = Array<{ path: Array<string\|number>, code: string }>` (NOT `field_errors`) |
| **`x-ratelimit-reset` semantics** | `apps/backend/src/server.ts:159` | unix epoch seconds (fastify-rate-limit default) |
| **`retry-after` semantics** | same | delta-seconds |
| **`detail.retry_after_seconds`** | `apps/backend/src/server.ts:154` | populated for `rate_limited.actor` (and `.ip`) — FE errorMapper renders inline |
| **TipTap surface enum** | `packages/ui/src/rich-content/RichEditor.tsx:17-21` | `voc-description \| reporter-reply \| public-update \| internal-comment` |
| **RichEditor toolbar** | same:32 | render-prop `(editor) => ReactNode`; no default toolbar |
| **useBlocker (TanStack Router v1)** | `node_modules/@tanstack/react-router/.../useBlocker.d.ts` | `{ shouldBlockFn, withResolver: true } → { status: 'idle' \| 'blocked', proceed?, reset? }` |
| **Idempotency-Key auto-mint** | `apps/frontend/src/lib/api/client.ts` | POST/PATCH/DELETE only; PUT excluded |
| **vocSearchSchema (URL)** | `apps/frontend/src/routes/_authed/vocs.tsx:12` | `.strict()` with explicit `filter.*` dot-keys |
| **Mock-login seed** | `apps/backend/src/seed/` | `mock-user-1` (User) / `mock-admin-1` (Admin) — used for CP1 |
| **Vite dev proxy** | `apps/frontend/vite.config.ts` | `/managed-systems /analytics-areas /vocs /permission-requests` w/ bypass for HTML nav |
| **Frontend port** | same | 3010 (IPv6 localhost) |
| **Backend port** | `apps/backend/src/config.ts` | 3011 |
| **Postgres** | dev | localhost:5434 (`fops_app` / `fops_migrate`) |

---

## §4 · Design baselines (`docs/design-prototype/screenshots/final-baselines/`)

| Page baseline | Status |
|---|---|
| `voc-new.png` | impl shipped #19; visual diff → #55 |
| `voc-inbox-detail.png` | impl pending #20 |
| `voc-inbox-detail-full.png` | impl pending #20 |
| `voc-triage-console.png` | impl pending #21 |
| `voc-clusters.png` | Slice 4+ |
| `admin-managed-systems.png` | impl shipped Slice 2 |
| `admin-analytics-areas.png` | impl shipped Slice 2 |
| `admin-permissions.png` | impl shipped Slice 1 |
| (others: tasks/surveys/integration/home) | Slice 4+/5+ |

Per [[feedback_pixel_diff_per_page]]: every page-level FE issue runs CP2 pixel-diff against its baseline before PR.

---

## §5 · ADR status (21 total)

Stable + actively enforced:
- ADR-0001 to ADR-0019 — locked
- **ADR-0020** Shell taxonomy (3 shells + 50px header) — locked Pack 18 / Slice 3 #18
- **ADR-0021** Pack 17 Samsung light design system — supersedes ADR-0016 (was "dark WCAG"), locked Slice 3 #18

---

## §6 · `.review/` layout (post-archive)

```
.review/
├── SLICE-3-19-*  (just-merged ref; archived next session)
├── SLICE-3-20-PLAN.{md,html}  (active)
├── SLICE-3-CONTEXT-MAP.md  (this file)
└── archive/
    ├── slice-1-2/
    ├── slice-3-backend/   (#14-#17, #23, #24)
    ├── slice-3-fe-foundation/  (#18)
    └── next-session/
```

---

## §7 · Memory layout (post-consolidation 2026-05-21)

```
memory/
├── MEMORY.md  (index)
├── user_workflow.md  (caveman + Korean + single-issue)
├── feedback_workflow.md  (SINGLE source: git/tier/REV/confirm/sizing)
├── feedback_pixel_diff_per_page.md  (page-level CP rule)
├── reference_authority_order.md
├── reference_gh_cli.md
├── repo_agents_md.md
├── project_design_prototype.md
├── project_llmwiki_setup.md
├── project_slice2_done.md
├── project_slice3_*_done.md (×11 — per-issue summaries)
├── project_slice3_backend_issues.md  (issue roster)
└── project_slice3_prologue.md
```

5 old workflow memos consolidated into `feedback_workflow.md` (see file for details).

---

## §8 · Recurring patterns to remember

1. **Per-issue feature branch** from `develop`. squash-merge. agent does full flow per user delegation.
2. **REV cycle order**: codex (cycle 1) → fix → Opus self (cycle 2). Page-level adds CP-pixel before REV-1.
3. **HTML confirms** as files via `SendUserFile`. Playground (interactive) vs report (static).
4. **State recommendation** in every multi-choice ask.
5. **Sanitizer is authoritative** for rich content. FE delegates sanitization to BE.
6. **`exactOptionalPropertyTypes`** is on — conditional include for optional return props, don't spread `undefined`.
7. **`verbatimModuleSyntax`** is on — use `import type` for type-only.

---

## §9 · Next 3 actions

1. **#20 PLAN review** with user — wait for sign-off on `.review/SLICE-3-20-PLAN.html`.
2. **#20 C0 inline** — branch + recon (deps already complete; check what's new vs #19 baseline).
3. **#20 C1 Sonnet** — `@fops/ui` badges (7 components + token mapping).

Then page through C2-C13 + CP1/CP2 + REV-1 (codex) + REV-2 + PR.
