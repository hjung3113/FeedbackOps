# PROTOTYPE-TO-PACK17.md

Cross-reference between `docs/design-prototype/styles.css` (Pack 20 prototype, light-theme,
`#1428a0` Samsung-blue palette) and Pack 17 / ADR-0021 implementation surface (`@fops/ui`
exports, semantic tokens in `packages/ui/src/styles/tokens.css`, Tailwind utilities in
`packages/ui/tailwind.preset.ts`).

**Read this doc before implementing any Slice 3 VOC surface.** It exists so the
implementation chunk briefs can drop “translate this class to a Pack 17 token” questions
entirely.

Rules of engagement
- **Token NAMES are preserved across dark→light invert (per ADR-0021).** Prototype CSS
  vars and Pack 17 token names match 1:1 even though pixel values differ. Never invent
  new token names.
- **Components MUST consume semantic tokens.** Never reference `--color-*` raw vars in
  routes/components — go through Tailwind utilities (`bg-surface-*`, `text-text-*`,
  `border-border-*`) or shadcn `--background/--foreground/...` aliases.
- **Spacing/typography pixel values listed here are quoted verbatim from styles.css.**
  Use them literally; do not re-derive.
- **Tailwind utilities only in JSX**, except for the explicit ad-hoc patterns in §4.
  No raw hex anywhere outside this document and the prototype.

---

## §1 Raw color tokens

Every raw `--color-*` declared in prototype `:root` maps 1:1 to the same-named token in
`packages/ui/src/styles/tokens.css`. Values invert dark→light but **names are stable**.
Tailwind exposes these names only indirectly: through accent/severity/status utilities
listed in §2. Prefer semantic utilities over raw color vars in JSX.

| Prototype hex (styles.css) | Pack 17 token name | Pack 17 hex (light invert) | Tailwind utility (semantic, not raw) |
|---|---|---|---|
| `#f3f7fe` | `--color-pitch-black` | `#f3f7fe` | `bg-surface-canvas` (via `--surface-canvas`) |
| `#fbfdff` | `--color-graphite` | `#fbfdff` | `bg-surface-card` / `bg-surface-detail` |
| `#edf3fb` | `--color-deep-slate` | `#edf3fb` | `bg-surface-popover` / `bg-surface-card-elevated` |
| `#cbd6e6` | `--color-charcoal-grey` | `#cbd6e6` | `border-border-subtle` / `border-border-default` |
| `#b8c4d6` | `--color-muted-ash` | `#b8c4d6` | `border-border-strong` |
| `#94a3b8` | `--color-gunmetal` | `#94a3b8` | — (use `text-text-disabled` if for text) |
| `#101828` | `--color-porcelain` | `#101828` | `text-text-primary` |
| `#374151` | `--color-light-steel` | `#374151` | `text-text-secondary` |
| `#687386` | `--color-storm-cloud` | `#687386` | `text-text-muted` / `text-severity-low` / `text-status-internal-todo` |
| `#98a2b3` | `--color-fog-grey` | `#98a2b3` | `text-text-disabled` / `text-status-reporter-closed` / `text-status-internal-backlog` |
| `#e5e5e6` | `--color-alabaster` | `#e5e5e6` | — (rarely used) |
| `#1428a0` | `--color-neon-lime` | `#1428a0` | `text-accent-primary` / `bg-accent-primary` / `focus-ring` (Samsung blue; name historical per ADR-0021) |
| `#1428a0` | `--color-aether-blue` | `#1428a0` | alias of `--color-neon-lime`; same utility — prefer `accent-primary` |
| `#008d4c` | `--color-forest-green` | `#008d4c` | — (rare; use `text-accent-success` / `--color-emerald`) |
| `#00a9e0` | `--color-cyan-spark` | `#00a9e0` | `text-accent-info` / `text-status-reporter-received` / `text-confidence-medium` |
| `#18a86b` | `--color-emerald` | `#18a86b` | `text-accent-success` / `text-status-reporter-resolved` / `text-status-internal-done` / `text-confidence-high` |
| `#d92d3a` | `--color-warning-red` | `#d92d3a` | `text-accent-danger` / `text-text-danger` / `text-severity-critical` / `text-status-reporter-reopened` / `focus-ring-danger` |
| `#3157d5` | `--color-deep-violet` | `#3157d5` | `text-status-reporter-assigned` |
| `#6a8dff` | `--color-amethyst` | `#6a8dff` | `text-status-reporter-progress` / `text-status-internal-review` |
| `#a56300` | `--color-amber` | `#a56300` | `text-accent-warn` / `text-text-warning` / `text-severity-medium` / `text-status-reporter-prep` |
| `#f08a4a` (only in `--severity-high`) | `--severity-high` | `#f08a4a` | `text-severity-high` / `bg-severity-high` |

Notes
- The prototype freely uses raw hex inline (`rgba(20, 40, 160, 0.04)` = aether-blue @ 4%).
  These ad-hoc patterns are catalogued in §4. **In Pack 17, replace with
  `bg-accent-primary/5` (or `/4` if matching exactly via arbitrary)** — see §4 row 1.
- Prototype `rgba(235, 87, 87, ...)` does NOT map to a single named color (`87, 87` was
  the dark-pack legacy red). In Pack 17, use `bg-accent-danger/X` (warning-red is now
  `217, 45, 58`) — the prototype hex is intentionally not preserved.
- Prototype `rgba(94, 106, 210, ...)` was the dark-pack aether-blue. In Pack 17 use
  `bg-accent-primary/X` instead.

---

## §2 Semantic surfaces / text / borders

CSS variable names and shadcn aliases are stable across packs. The Tailwind preset
(`packages/ui/tailwind.preset.ts`) is the source of utility names. **Use these utilities
in route/component JSX — never `var(--surface-*)` inline.**

### Surfaces

| Prototype `var(--…)` / class | Pack 17 Tailwind utility | Pack 17 value |
|---|---|---|
| `var(--surface-canvas)` | `bg-surface-canvas` | `#f3f7fe` |
| `var(--surface-sidebar)` | `bg-surface-sidebar` | `#eef4fb` |
| `var(--surface-list)` | `bg-surface-list` | `#f3f7fe` (= canvas) |
| `var(--surface-row-hover)` | `bg-surface-row-hover` | `#e7effc` |
| `var(--surface-row-selected)` | `bg-surface-row-selected` | `#d8e7fb` |
| `var(--surface-detail)` | `bg-surface-detail` | `#fbfdff` |
| `var(--surface-popover)` | `bg-surface-popover` | `#edf3fb` |
| `var(--surface-field)` | `bg-surface-field` | `transparent` |
| `var(--surface-field-filled)` | `bg-surface-field-filled` | `#ffffff` |
| `var(--surface-blocked)` | `bg-surface-blocked` | `#eef2f7` |
| `var(--surface-card)` | `bg-surface-card` | `#fbfdff` |
| `var(--surface-card-elevated)` | `bg-surface-card-elevated` | `#edf3fb` |
| (Slice 1/2 alias `--surface-raised`) | `bg-surface-raised` | `#fbfdff` (= card) — **prefer `bg-surface-card`** |

### Text

| Prototype `var(--…)` | Pack 17 Tailwind utility | Pack 17 value |
|---|---|---|
| `var(--text-primary)` | `text-text-primary` | `#101828` |
| `var(--text-secondary)` | `text-text-secondary` | `#374151` |
| `var(--text-muted)` | `text-text-muted` | `#687386` |
| `var(--text-disabled)` | `text-text-disabled` | `#98a2b3` |
| `var(--text-danger)` | `text-text-danger` | `#d92d3a` |
| `var(--text-warning)` | `text-text-warning` | `#a56300` |
| `var(--text-success)` | `text-text-success` | `#18a86b` |
| `var(--text-info)` | `text-text-info` | `#00a9e0` |
| `var(--text-on-accent)` | `text-text-on-accent` | `#ffffff` |
| utility class `.muted` (proto) | `text-text-muted` | — |
| utility class `.faint` (proto) | `text-text-disabled` | — |

### Borders + focus

| Prototype `var(--…)` | Pack 17 Tailwind utility | Pack 17 value |
|---|---|---|
| `var(--border-subtle)` | `border-border-subtle` | `#cbd6e6` |
| `var(--border-strong)` | `border-border-strong` | `#b8c4d6` |
| `var(--border-selected)` | `border-border-selected` | `#1428a0` |
| `var(--focus-ring)` | `ring-focus-ring` / `outline-focus-ring` | `#1428a0` |
| `var(--focus-ring-danger)` | `ring-focus-ring-danger` | `#d92d3a` |
| (Slice 1/2 alias `--border-default`) | `border-border-default` | `#cbd6e6` (= subtle) — **prefer `border-border-subtle`** |

### Accents / status / severity / confidence

All listed in `tailwind.preset.ts`. Available utility prefixes:
`accent-primary | accent-info | accent-warn | accent-danger | accent-success`,
`status-reporter-{received|reviewing|assigned|progress|prep|resolved|reopened|closed}`,
`status-internal-{backlog|todo|doing|review|done|released|reopened}`,
`severity-{low|medium|high|critical}`, `confidence-{low|medium|high}`. All support
`bg-`, `text-`, `border-`, `ring-` prefixes AND alpha modifiers (`/10`, `/15` etc.) via
`rgb(var(--X) / <alpha-value>)` channel format.

### shadcn aliases

shadcn primitives use the standard `--background / --foreground / --primary / --muted / --border / --ring / --destructive` etc. aliases (`semantic.css`). These map to the same Pack 17 raw colors. **When a shadcn primitive is the right choice (Input, Select, Dialog, Popover, Tabs, etc.), use it** — its internal styling already lands on Pack 17 tokens.

---

## §3 Class-to-component mapping

The prototype uses imperative CSS classes. The implementation uses `@fops/ui` primitives
+ Tailwind utilities. **Each row tells Sonnet exactly which primitive to reach for and
quotes the values to reproduce.** “Values” column quotes the relevant styles.css block
verbatim.

### 3.1 Badges

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.badge` | inline-flex span (no primitive — base shape) | `height: 20px (--badge-height); padding: 0 6px; gap: 4px; border-radius: 4px; font-size: 11px (--text-tiny); font-weight: 500; letter-spacing: 0.01em; white-space: nowrap` | Generic shape only; tone always comes from a specific primitive below. Tailwind: `inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium tracking-[0.01em] whitespace-nowrap`. |
| `.badge-dot` | inline span before content | `width: 6px; height: 6px; border-radius: 9999px; background: currentColor` | Tailwind: `w-1.5 h-1.5 rounded-pill bg-current shrink-0`. |
| `.badge.badge-reporter` | `ReporterStatusBadge` | pill shape: `border-radius: 9999px; padding: 0 8px; background: rgba(20,40,160,0.04); box-shadow: var(--shadow-subtle)`. dot is 6×6 | Use `<ReporterStatusBadge status={voc.reporterStatus} />`. Component renders dot + Korean label colored by `text-status-reporter-*`. |
| `.badge.badge-internal` | `InternalTaskBadge` | `border-radius: 2px (--radius-sm); background: transparent; box-shadow: var(--shadow-subtle); color: var(--text-secondary)` | Use `<InternalTaskBadge status={task.status} />`. |
| `.badge.badge-severity.severity-{level}` | `SeverityBadge` | `.badge-severity { padding: 0 6px }`. Per-level bg+fg: low `rgba(138,143,152,0.10) / var(--severity-low)`; medium `rgba(242,196,109,0.12) / var(--severity-medium)`; high `rgba(240,138,74,0.14) / var(--severity-high)`; critical `rgba(235,87,87,0.14) / var(--severity-critical)` | Use `<SeverityBadge severity={voc.severity} />`. Pack 17 implementation uses `bg-severity-{level}/10..15` with `text-severity-{level}`. |
| `.badge.badge-confidence.confidence-{level}` | `OutlineBadge` (text-only) or plain badge | `color: var(--confidence-{level})`, transparent bg, no shadow | If a dedicated primitive is missing, render a generic `.badge` shape with `text-confidence-{level}`. |
| `.badge.badge-public` | inline badge | `color: var(--color-cyan-spark); background: rgba(2,184,204,0.10)` | Pack 17: `bg-accent-info/10 text-accent-info`. Used as a “Public timeline” marker in panel section title actions. |
| `.badge.badge-internal-only` | inline badge | `color: var(--text-muted); background: rgba(138,143,152,0.10)` | Pack 17: `bg-text-muted/10 text-text-muted`. |
| `.badge.badge-blocked` | inline badge | `color: var(--text-danger); background: rgba(235,87,87,0.08)` | Pack 17: `bg-accent-danger/10 text-text-danger`. |
| (outline / kind chip) | `OutlineBadge` | shape only — `box-shadow: inset 0 0 0 1px var(--border-subtle)` 1px outline ring | Use `<OutlineBadge>{voc.sourceContext}</OutlineBadge>` for source context, trail node `type`, etc. |
| (manage-system pill) | `ManagedSystemPill` | wraps ms color mark + name in pill | Use `<ManagedSystemPill id={voc.managedSystem} />`. Do not hand-roll. |
| (entity icon chip) | `EntityIconBadge` | small monogram tile (VOC/F/T/E iconography) | Use `<EntityIconBadge type={"voc"|"finding"|"task"|"evidence"|...} />`. |

### 3.2 Indicators

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.severity-indicator.severity-{level}` | `SeverityIndicator` | `width: 3px; height: 16px; border-radius: 9999px; background: var(--severity-{level})` | Use `<SeverityIndicator severity={voc.severity} />`. **The 3px×16px pill is load-bearing** for row gutter alignment — do not change. |

### 3.3 Buttons

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.btn` (base) | `Button` (from `@fops/ui`) | `display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; height: 28px; border-radius: 6px (--radius-md); font-size: 13px (--text-sm); font-weight: 500; letter-spacing: -0.13px; white-space: nowrap` | Always `<Button variant=... size=... />`. Never hand-roll. |
| `.btn-primary` | `<Button variant="primary">` | `background: var(--color-neon-lime); color: var(--text-on-accent); font-weight: 600`. Hover `#0b57d0`, active `#1428a0` | Tailwind: `bg-accent-primary text-text-on-accent font-semibold hover:bg-[#0b57d0] active:bg-[#1428a0]`. Component handles. |
| `.btn-secondary` | `<Button variant="secondary">` | `background: var(--color-graphite); color: var(--text-primary); box-shadow: var(--shadow-subtle)`. Hover `var(--color-deep-slate)` | Tailwind: `bg-surface-card text-text-primary shadow-subtle hover:bg-surface-popover`. |
| `.btn-subtle` | `<Button variant="subtle">` | transparent bg, `color: var(--text-secondary)`; hover bg=graphite, color=primary | `bg-transparent text-text-secondary hover:bg-surface-card hover:text-text-primary`. |
| `.btn-ghost` | `<Button variant="ghost">` | transparent bg, `color: var(--text-muted)`; hover bg=graphite, color=primary | `bg-transparent text-text-muted hover:bg-surface-card hover:text-text-primary`. |
| `.btn-danger` | `<Button variant="danger">` | transparent bg, `color: var(--text-danger)`, `box-shadow: var(--shadow-subtle)`. Hover bg `rgba(235,87,87,0.10)` → Pack 17 `bg-accent-danger/10` | |
| `.btn-lg` | `size="lg"` | `height: 32px; padding: 0 14px; font-size: 14px (--text-body)` | |
| `.btn` (default) | `size="md"` | `height: 28px; padding: 0 10px; font-size: 13px` | |
| `.btn-sm` | `size="sm"` | `height: 24px; padding: 0 8px; font-size: 12px (--text-xs)` | |
| `.btn-icon` | `size="icon"` (or `iconOnly` prop) | `width: 28px; padding: 0` (sm: 24px; lg: 32px) | |
| `.btn-block` | className `w-full` | `width: 100%` | Used in panel footer primary CTA. |
| `.btn-disabled` | `disabled` attr | `opacity: 0.4; pointer-events: none` | Native disabled — let Button handle. |
| Focus ring: `.btn:focus-visible` | `Button` builtin | `box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--color-neon-lime)` (= `var(--shadow-focus)`) | Already inside `Button`. |

### 3.4 Tabs

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.tabs` | `ListToolbar tabs={…}` (for inbox tabs) **or** shadcn `<Tabs>` (for in-panel tabs) | container: `display: flex; align-items: center; gap: 2px` | The list-toolbar inbox tabs come from `<ListToolbar tabs={VOC_TABS} activeTab=… onTabChange=… />`. |
| `.tab` | rendered by `ListToolbar` (or shadcn `TabsTrigger`) | `padding: 5px 10px; border-radius: 6px; font-size: 13px; color: var(--text-muted); font-weight: 500; gap: 6px; height: 28px; white-space: nowrap` | |
| `.tab:hover` | builtin | bg `var(--color-graphite)` (`hover:bg-surface-card`), color primary | |
| `.tab.active` | builtin | `background: var(--color-deep-slate); color: var(--text-primary)` (`bg-surface-popover text-text-primary`) | |
| `.tab .tab-count` | builtin | `font-size: 11px (--text-tiny); color: var(--text-muted); tabular-nums`; active: `color: var(--text-secondary)` | |
| `.composer-tabs` | within panel composer (use shadcn `<Tabs>` or hand-built triplet) | `display: flex; border-bottom: 1px solid var(--border-subtle); background: var(--color-graphite)` | The composer uses 3 tabs (`public / reply / internal`) with **color-coded underline**. |
| `.composer-tab` | tab trigger | `flex: 1; padding: 8px 10px; font-size: 12px (--text-xs); font-weight: 500; color: var(--text-muted); text-align: center; border-bottom: 1px solid transparent` | |
| `.composer-tab.active` | active trigger | `color: var(--text-primary); background: var(--color-pitch-black)` | |
| `.composer-tab.active.public` | per-tab underline | `border-bottom-color: var(--color-neon-lime)` (`border-b-accent-primary`) | |
| `.composer-tab.active.reply` | per-tab underline | `border-bottom-color: var(--color-cyan-spark)` (`border-b-accent-info`) | |
| `.composer-tab.active.internal` | per-tab underline | `border-bottom-color: var(--color-deep-violet)` (`border-b-status-reporter-assigned`) | |

### 3.5 Detail panel

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `aside.detail-panel` | `WorkbenchShell` detail slot (ADR-0020) | `background: var(--surface-detail); border-left: 1px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden` | Always inside a WorkbenchShell; never hand-roll the aside. Width = `var(--detail-panel-width)` = 440px (Tailwind: `w-detail-panel`). |
| `.panel-header` | `DetailPanelHeader` | `height: 50px (--topbar-height); padding: 0 12px 0 20px; gap: 8px; border-bottom: 1px solid var(--border-subtle)` | `<DetailPanelHeader kind="voc" id={voc.id} onClose={onClose} extras={…}/>`. |
| `.panel-id` | inside header | `font-family: monospace; font-size: 12px (--text-xs); color: var(--text-muted)` | Built into header. |
| `.panel-header-actions` | `DetailPanelHeaderActions` | `margin-left: auto; gap: 4px` | `<DetailPanelHeaderActions entityKind="VOC" entityId={…} copyHash={…} />`. |
| `.panel-scroll` | scroll container | **`padding: 28px 24px 32px`** | The vertical rhythm of the entire panel hangs on these three numbers. Tailwind: `pt-7 pr-6 pb-8 pl-6 overflow-y-auto flex-1`. |
| `.panel-section-nav` | panel anchor nav (sticky) | `position: sticky; top: 0; padding: 6px 24px 8px; background: color-mix(in oklch, var(--surface-detail) 94%, white); border-bottom: 1px solid var(--border-subtle); overflow-x: auto` | If a primitive is missing, render inline; uses `bg-surface-detail/95` (close enough). |
| `.panel-section-nav-button` | nav item | `padding: 6px 10px; border-bottom: 2px solid transparent; color: var(--text-muted); font-size: 12px; font-weight: 500`. Active: `border-bottom-color: var(--color-neon-lime); color: var(--text-primary)` | |
| `.panel-section-nav-count` | count pill in nav | `padding: 1px 5px; border-radius: 10px; background: var(--color-pitch-black); color: var(--text-muted); font-size: 10px (--text-caption)` | |
| `.panel-section` | wrapping `<div>` | **`margin-bottom: 32px`** (`mb-8`); last child `mb-0` | Every section in `VocDetailPanel` is a `.panel-section`. |
| `.panel-section-title` | `PanelSectionTitle` | `font-size: 11px (--text-tiny); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em (--tracking-wide); color: var(--text-muted); margin: 0 0 14px; display: flex; align-items: center; gap: 6px` | `<PanelSectionTitle action={…}>Triage</PanelSectionTitle>`. The `action` prop renders right-aligned (e.g. badge or btn). |
| `.panel-title-block` | `PanelTitleBlock` | **`margin-bottom: 24px`** | `<PanelTitleBlock title={voc.title}>{badges/meta…}</PanelTitleBlock>`. |
| `.panel-title` | inside `PanelTitleBlock` | `font-size: 17px (--text-lg); font-weight: 600; letter-spacing: -0.22px (--tracking-tight); margin: 0 0 6px; line-height: 1.35` | |
| `.panel-subtitle` | inside `PanelTitleBlock` | `font-size: 12px (--text-xs); color: var(--text-muted)` | |
| `.panel-footer` | sticky footer below scroll | `border-top: 1px solid var(--border-subtle); padding: 16px 20px; display: flex; gap: 8px; background: var(--surface-detail)` | Render directly below `panel-scroll` inside the aside. |

### 3.6 Field rows / form labels

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.field-row` | `FieldRow` | `display: grid; grid-template-columns: 120px 1fr; align-items: start; gap: 12px; padding: 8px 0; font-size: 13px (--text-sm)` | `<FieldRow label="Owner">…</FieldRow>`. Label column is fixed 120px. |
| `.field-label` | rendered by FieldRow | `color: var(--text-muted)` | |
| `.field-value` | rendered by FieldRow | `color: var(--text-primary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap` | |
| `.form-field-label` | `FieldLabel` (for create form) | `display: block; font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: -0.05px` | `<FieldLabel required tip="…">Title</FieldLabel>`. Already supports `required` (red asterisk) and `tip` (HelpTip on hover). |
| `.field-label-compact` | optional FieldLabel mode | `font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; display: inline-flex; gap: 4px` | Not currently exposed by `FieldLabel`; if needed, raise via a `density="compact"` prop. |
| `.field-required` | inside FieldLabel | `color: var(--color-warning-red); font-weight: 700; margin-left: -2px` | Handled by `required` prop. |
| `.field-help` | inside FieldLabel | `width: 14px; height: 14px; border-radius: 50%; background: var(--color-charcoal-grey); color: var(--text-muted); display: inline-grid; place-items: center` | Handled by `tip` prop. |

### 3.7 Inputs

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.input` | shadcn `<Input>` | `height: 28px; padding: 0 10px; border-radius: 6px; background: var(--surface-field-filled); color: var(--text-primary); border: 1px solid transparent; box-shadow: var(--shadow-subtle); font-size: 13px`. Focus: `border-color: var(--color-aether-blue)` | shadcn Input already lands on these tokens. **Do not use `<input className="input">`**. |
| `.search-input` | `SearchInput` | `display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 28px; border-radius: 6px; background: var(--surface-field-filled); box-shadow: var(--shadow-subtle); min-width: 200px` | `<SearchInput placeholder="필터, 키워드…" />`. Already inside `ListToolbar` children. |

### 3.8 Object rows (Inbox list)

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.object-row` | `VocInboxRow` (feature-side; not in @fops/ui) — render as `<div>` w/ tokens | `display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; min-height: 60px (--row-height-default); padding: 10px 20px; border-bottom: 1px solid var(--border-subtle); cursor: pointer` | Hover: `bg-surface-row-hover`; selected: `bg-surface-row-selected` + 2px `var(--color-neon-lime)` left bar. |
| `.object-row.compact` | density variant | `min-height: 44px (--row-height-compact); padding: 6px 20px` | |
| `.object-row.expanded` | density variant | `min-height: 96px (--row-height-expanded); padding: 14px 20px` | |
| `.object-row.selected::before` | selected indicator | `position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--color-neon-lime)` | Tailwind: `before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-accent-primary`. |
| `.row-checkbox` | shadcn `<Checkbox>` (or hand-roll) | `width: 14px; height: 14px; border-radius: 2px; border: 1px solid var(--border-strong); background: transparent`. Checked: `bg-accent-primary border-accent-primary` | Prefer shadcn Checkbox; size override `w-3.5 h-3.5`. |
| `.row-icon` | inline lucide icon | `width: 16px (--icon-size-md); color: var(--text-muted)` | |
| `.row-body` | inner stack | `display: flex; flex-direction: column; min-width: 0; gap: 2px` | `flex flex-col min-w-0 gap-0.5`. |
| `.row-title` | inner | `font-size: 13px; font-weight: 500; color: var(--text-primary); display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis` | |
| `.row-meta` | inner | `font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap` | |
| `.row-meta .dot` | separator | `width: 2px; height: 2px; border-radius: 50%; background: var(--color-fog-grey)` | `w-0.5 h-0.5 rounded-full bg-text-disabled`. |
| `.row-trailing` | inner | `display: flex; align-items: center; gap: 8px; flex-shrink: 0` | |
| `.row-id` | inner | `font-family: var(--font-mono); font-size: 12px; color: var(--text-disabled); font-variant-numeric: tabular-nums` | Tailwind: `font-mono text-xs text-text-disabled tabular-nums`. |
| `.row-avatar` | use `UserAvatar size="sm"` | `width: 20px; height: 20px; border-radius: 9999px` | |

### 3.9 Cards

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.card` | shadcn `<Card>` or `bg-surface-card rounded-md shadow-subtle p-5` | `background: var(--surface-card); border-radius: 6px; box-shadow: var(--shadow-subtle); padding: 20px` | |
| `.card-elevated` | `bg-surface-card-elevated shadow-subtle` | `background: var(--surface-card-elevated); box-shadow: var(--shadow-subtle)` | |
| `.card-nested` | `bg-surface-canvas rounded-md p-3` | `background: var(--color-pitch-black); border-radius: 6px; padding: 12px` | Used inside detail panel sub-cards (e.g. trail action panel). |
| `.action-card` | `bg-surface-card rounded-md shadow-subtle p-5 flex flex-col gap-4` | `background: var(--surface-card); border-radius: 6px; box-shadow: var(--shadow-subtle); padding: 20px; display: flex; flex-direction: column; gap: 16px` | Used on Home/Integration; not VOC-specific. |
| `.action-card-header` | `.flex.items-start.justify-between.gap-3` | gap: 12px | |
| `.action-card-title` | `text-sm font-medium text-text-primary` | `font-size: 13px; font-weight: 500; letter-spacing: -0.13px` | |
| `.action-card-reason` | `text-xs text-text-muted leading-[1.5]` | `font-size: 12px; line-height: 1.5` | |
| `.action-card-value` | `text-[32px] font-semibold tabular-nums tracking-tight` | `font-size: 32px (--text-heading-lg); font-weight: 600; letter-spacing: -0.22px; line-height: 1` | `.urgent → text-text-danger; .warn → text-text-warning; .good → text-text-success`. |
| `.action-card-footer` | `pt-3.5 border-t border-border-subtle` | `padding-top: 14px; border-top: 1px solid var(--border-subtle); margin-top: 4px` | |

### 3.10 Composer

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.composer` | wrapper div | `border-radius: 6px; background: var(--color-pitch-black); box-shadow: var(--shadow-subtle); overflow: hidden` | Tailwind: `rounded-md bg-surface-canvas shadow-subtle overflow-hidden`. |
| `.composer-tabs` | header (see 3.4) | `display: flex; border-bottom: 1px solid var(--border-subtle); background: var(--color-graphite)` | |
| `.composer-toolbar` | optional RTE toolbar | `display: flex; gap: 2px; padding: 4px 6px; border-bottom: 1px solid var(--border-subtle)` | If using `<RichEditor>`, the toolbar is internal — do not render this class. |
| `.composer-tool` | toolbar button | `width: 22px; height: 22px; border-radius: 2px; color: var(--text-muted)`; hover `bg-surface-card text-text-primary` | |
| `.composer-body` | RichEditor body | `padding: 14px 14px 18px; min-height: 96px; font-size: 13px; color: var(--text-secondary); line-height: 1.55` | Use `<RichEditor surface="…" minHeight={84} />`; minHeight prop already wired. |
| `.composer-footer` | footer row | `display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border-subtle); background: var(--color-graphite)` | Tailwind: `flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border-subtle bg-surface-card`. |
| `.composer-status-row` | inside footer | `display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted)` | |
| Per-tab underline | see 3.4 `composer-tab.active.{public|reply|internal}` | accent-primary / accent-info / deep-violet | |

### 3.11 Timeline (public + internal)

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.timeline` | wrapper | `display: flex; flex-direction: column; gap: 16px` | |
| `.timeline-item` | row | `display: grid; grid-template-columns: 22px 1fr; gap: 10px` | 22px = avatar size. |
| `.timeline-item-body` | inner | `display: flex; flex-direction: column; gap: 4px; min-width: 0` | |
| `.timeline-meta` | meta line | `display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted)` | `strong` inside: `color: var(--text-primary); font-weight: 500`. |
| `.timeline-content` | bubble | `font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding: 12px 14px; border-radius: 6px; background: var(--color-pitch-black); box-shadow: var(--shadow-subtle)` | |
| `.timeline-content.public-update` | variant | adds `border-left: 2px solid var(--color-neon-lime)` (`border-l-2 border-accent-primary`) | |
| `.timeline-content.reporter-reply` | variant | adds `border-left: 2px solid var(--color-cyan-spark)` (`border-l-2 border-accent-info`) | |
| `.timeline-content.internal` | variant | `background: rgba(49,87,213,0.06); border-left: 2px solid var(--color-deep-violet)` → `bg-status-reporter-assigned/10 border-l-2 border-status-reporter-assigned` | |
| `<Avatar size="sm" />` (proto) | `<UserAvatar size="sm" />` | 18×18 / 9px font | |

### 3.12 Severity picker (create form)

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.severity-grid` | wrapper | `display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px` | |
| `.severity-pick` | row | `display: grid; grid-template-columns: 4px 1fr auto; gap: 10px; padding: 8px 12px; border-radius: 6px; background: var(--color-pitch-black); box-shadow: var(--shadow-subtle)` | Per-severity active style — full inset ring + tinted bg, see §4 row 6. |
| `.severity-pick-bar` | left bar | `width: 4px; height: 100%; border-radius: 9999px` | Filled with the severity color. |
| `.severity-pick-label` | center label | `font-size: 13px; font-weight: 600; text-transform: capitalize; color: var(--text-primary); margin-bottom: 3px; letter-spacing: -0.1px` | Active state: color becomes `text-severity-{level}`. |
| `.severity-pick-meta` | meta line | `font-size: 12px; color: var(--text-muted); line-height: 1.45` | |

### 3.13 Managed-system & source pickers

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.ms-chip` | `ManagedSystemPicker` (mostly) or chip | `display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: var(--color-pitch-black); box-shadow: var(--shadow-subtle); font-size: 13px; color: var(--text-secondary)` | Active (`data-active="true"`): see §4 row 2. |
| `.source-radio` | source radio card | `display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 6px; background: var(--color-pitch-black); box-shadow: var(--shadow-subtle); text-align: left; width: 100%` | Active: `bg-accent-primary/5` + 1.5px inset accent ring at 40% alpha. |
| `.source-radio-dot` | radio dot | `width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--border-strong); margin-top: 3px` | `.on { border-color: var(--color-neon-lime) }`; inner dot `inset: 2px; background: var(--color-neon-lime)`. |

### 3.14 Segmented control

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.segmented` | shadcn `<ToggleGroup>` or hand-roll | `display: inline-flex; padding: 2px; background: var(--color-pitch-black); border-radius: 6px; box-shadow: var(--shadow-subtle); gap: 2px` | Prefer `ToggleGroup` (already exported). |
| `.segmented-item` | `<ToggleGroupItem>` | `display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 4px; font-size: 12px; font-weight: 500; color: var(--text-muted)` | Active: `bg-surface-popover text-text-primary shadow-subtle`. |

### 3.15 Linked-entity trail

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.entity-trail` | `LinkedEntityTrail` | `display: flex; flex-direction: column; gap: 2px` | `<LinkedEntityTrail nodes={…} selectedKey=… onNodeClick=… />`. |
| `.entity-node` | inner | `display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; padding: 10px 12px; border-radius: 6px; background: var(--color-pitch-black)` | Hover: `bg-surface-row-hover`. |
| `.entity-node-icon` | inner | `width: 18px; height: 18px; border-radius: 2px; font-size: 9px; font-weight: 700; color: var(--text-primary); background: var(--color-charcoal-grey)` | Placeholder variant: transparent bg + 1px dashed border-strong. |
| `.entity-node-body` | inner | `display: flex; flex-direction: column; gap: 2px; min-width: 0` | |
| `.entity-node-title` | inner | `font-size: 12px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis` | |
| `.entity-node-meta` | inner | `font-size: 10px (--text-caption); color: var(--text-muted)` | |
| `.entity-node.placeholder-node` | inner | `background: transparent; border: 1px dashed var(--border-strong)`. Hover: `border-color: var(--color-neon-lime)` | |
| `.entity-trail-connector` | inner | `width: 1px; height: 8px; background: var(--border-strong); margin-left: 19px` | Connector between nodes (vertical hairline). |

### 3.16 Evidence highlight

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.evidence` | wrapper | `border-radius: 6px; background: var(--color-pitch-black); padding: 14px 16px; box-shadow: var(--shadow-subtle); display: flex; flex-direction: column; gap: 10px` | |
| `.evidence-quote` | quote | `font-size: 13px; color: var(--text-primary); line-height: 1.5; padding-left: 12px; border-left: 2px solid var(--color-aether-blue)` | Tailwind: `pl-3 border-l-2 border-accent-primary text-text-primary`. |
| `.evidence-summary` | summary | `font-size: 13px; color: var(--text-secondary); line-height: 1.5` | |
| `.evidence-meta` | meta | `display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap` | |

### 3.17 Popovers / cmdk / filter chips

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.popover` | shadcn `<Popover>` content | `background: var(--surface-popover); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-xl); min-width: 220px; padding: 6px; max-height: 70vh; overflow-y: auto` | Use shadcn Popover; styling already lands on these tokens. |
| `.popover-section-title` | inside popover | `font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); padding: 8px 8px 4px` | |
| `.popover-item` | inside | `display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 4px; font-size: 13px; color: var(--text-primary)`. Hover: `bg-surface-row-hover` | |
| `.popover-item .check-box` | check | `width: 14px; height: 14px; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--border-strong)`. Checked: `bg-accent-primary text-text-on-accent` | |
| `.popover-item .radio-dot` | radio | `width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--border-strong)`. Inner dot: `7px circle bg-accent-primary` | |
| `.popover-divider` | divider | `height: 1px; background: var(--border-subtle); margin: 4px 0` | |
| `.filter-chip` | applied filter pill (above list) | `padding: 2px 8px; font-size: 12px; border-radius: 9999px; background: rgba(20,40,160,0.14); color: var(--color-neon-lime); display: inline-flex; gap: 4px` | `bg-accent-primary/15 text-accent-primary`. Rendered by `ListFilterButton` when filters applied. |
| `.filter-chip .x` | close marker | `width: 12px; height: 12px; opacity: 0.7` | |
| `.cmdk-backdrop` | shadcn `<Dialog>` overlay | `background: rgba(20,40,160,0.16); backdrop-filter: blur(4px); padding-top: 14vh; z-index: 500` | |
| `.cmdk-panel` | dialog content | `width: 640px; max-height: 72vh; background: var(--surface-popover); border: 1px solid var(--border-subtle); border-radius: 10px; box-shadow: var(--shadow-xl)` | |
| `.cmdk-input-row` | header | `padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); gap: 10px` | |
| `.cmdk-item` | row | `display: grid; grid-template-columns: 22px 56px 1fr auto; gap: 10px; padding: 7px 10px; border-radius: 6px` | Active: `bg-accent-primary/10 ring-1 ring-accent-primary/30 inset` (see §4 row 8). |

### 3.18 Avatar

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.avatar` | `UserAvatar` (default) | `width: 22px; height: 22px; border-radius: 9999px; font-size: 10px; font-weight: 600; color: white` | `<UserAvatar user={…} />` default. |
| `.avatar-sm` | `<UserAvatar size="sm">` | `width: 18px; height: 18px; font-size: 9px` | |
| `.avatar-lg` | `<UserAvatar size="lg">` | `width: 28px; height: 28px; font-size: 12px` | |
| `.rail-avatar` | inside global rail | `width: 36px; height: 36px; border-radius: 9999px; background: var(--color-aether-blue); color: white; font-size: 12px; font-weight: 600` | Used only in the global rail (shell). |

### 3.19 Toolbar (list)

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.toolbar` | `ListToolbar` | `display: flex; align-items: center; gap: 8px; padding: 0 20px; border-bottom: 1px solid var(--border-subtle); background: var(--surface-canvas); position: sticky; top: 0; z-index: 2; min-height: 50px (--toolbar-height); white-space: nowrap; overflow-x: auto` | `<ListToolbar tabs={…} action={…}>{children}</ListToolbar>`. |
| `.toolbar-action` | `action` prop slot | sticky-right; `position: sticky; right: 12px; padding-left: 12px; background: linear-gradient(to right, transparent 0, var(--surface-canvas) 12px, var(--surface-canvas) 100%)` | Internal to `ListToolbar`. Pass the primary CTA via `action={<Button … />}`. |
| `.toolbar-spacer` | inline | `flex: 1` | `<div className="flex-1" />` if needed. |
| `.toolbar-divider` | inline | `width: 1px; height: 16px; background: var(--border-subtle); margin: 0 4px` | `<span className="w-px h-4 bg-border-subtle mx-1" />`. Common between sub-action groups. |

### 3.20 Toolbar kicker (V1 inline identity — WorkbenchShell without ShellHeader)

Used when a high-density WorkbenchShell route omits the `toolbar` prop on `WorkbenchShell`
and provides route identity inline as a left-edge kicker. Pattern approved in ADR-0020
§Amendment (2026-05-21). Reference: `.review/TRIAGE-LAYOUT-VARIANTS.html §V1 .kicker`.

| Prototype element | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.kicker` (V1 wrapper) | `<div data-testid="triage-kicker">` inline in toolbar | `display: inline-flex; align-items: center; gap: 6px; padding-right: 10px; margin-right: 8px; border-right: 1px solid var(--border-subtle); height: 22px` | Tailwind: `inline-flex items-center gap-1.5 pr-2.5 mr-1 h-[22px] border-r border-border-subtle`. First child of the toolbar flex container. |
| `.kicker-label` (console part) | `<span data-testid="triage-kicker-console">` | `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted)` | Tailwind: `text-xs font-medium uppercase tracking-[0.04em] text-text-muted`. Brief uses task-spec tracking (0.04em); prototype uses 0.06em — task spec wins (see deviation log). |
| dot separator | `<span aria-hidden="true">·</span>` | separates label from name | Tailwind: `text-[10px] text-text-muted`. `aria-hidden="true"` — decorative. |
| `.kicker-name` (route name) | `<span data-testid="triage-kicker-name">` | `font-size: 13px; font-weight: 600; color: var(--text-secondary); letter-spacing: -0.13px` | Tailwind: `text-[13px] font-semibold text-text-secondary`. |

### 3.21 Kanban / board (not VOC, but listed per brief)

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.board` | wrapper | `display: flex; gap: 12px; padding: 20px 24px 24px; overflow-x: auto; overflow-y: hidden` | |
| `.board-column` | column | `flex: 0 0 280px; border-radius: 6px; border: 1px solid var(--border-subtle)` | |
| `.board-column-header` | header | `display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle)` | |
| `.board-column-title` | | `font-size: 12px; font-weight: 600; color: var(--text-primary)` | |
| `.board-column-count` | | `font-size: 11px; color: var(--text-muted); tabular-nums` | |
| `.board-card` | | `background: var(--surface-card); border-radius: 6px; padding: 12px 12px 14px; box-shadow: var(--shadow-subtle); display: flex; flex-direction: column; gap: 10px` | |

### 3.21 Coverage bar

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.coverage-bar` | wrapper | `height: 4px; background: var(--color-charcoal-grey); border-radius: 9999px; overflow: hidden` | |
| `.coverage-bar-fill` | fill | `height: 100%; border-radius: 9999px; background: var(--color-aether-blue)` | `.good → bg-accent-success; .warn → bg-accent-warn; .bad → bg-accent-danger`. |

### 3.22 Misc primitives

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.kbd` | inline `<kbd>` | `font-family: monospace; font-size: 10px; padding: 1px 5px; border-radius: 2px; background: var(--color-charcoal-grey); color: var(--text-muted); border: 1px solid var(--color-muted-ash); line-height: 1.4` | Tailwind: `font-mono text-[10px] px-1.5 py-px rounded-sm bg-border-subtle text-text-muted border border-border-strong leading-[1.4]`. |
| `.toast` | shadcn `<Sonner>` / `<Toast>` (whichever wired) | `background: var(--surface-popover); border: 1px solid var(--border-strong); border-radius: 6px; padding: 10px 14px; box-shadow: var(--shadow-xl); font-size: 13px` | Tone variants add inset 1px ring: success/warn/danger. |
| `.dropzone-compact` | wrapper | `display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 6px; background: var(--color-pitch-black); border: 1px dashed var(--border-strong); color: var(--text-muted); width: 100%`. Hover: `border-color: var(--color-aether-blue); color: var(--text-primary)` | |
| `.divider` | inline | `height: 1px; background: var(--border-subtle); margin: 12px 0` | `<hr className="h-px bg-border-subtle my-3" />` or in-flow `border-t border-border-subtle`. |
| `.create-action-bar` | sticky bottom row | `display: flex; align-items: center; gap: 8px; margin-top: 20px; padding: 14px 16px; border-radius: 6px; background: var(--color-graphite); box-shadow: var(--shadow-subtle)` | |

### 3.23 Shell

| Prototype class | → Pack 17 | Values to preserve | Notes |
|---|---|---|---|
| `.app-shell` | `WorkbenchShell` / `ListShell` / `PageShell` (ADR-0020) | `display: grid; grid-template-columns: var(--rail-width) var(--sidebar-width) 1fr` — with optional `var(--detail-panel-width)` | Choose shell per route taxonomy. Never hand-roll the grid. |
| `.app-shell.with-panel` | `WorkbenchShell` (when detail slot non-empty) | adds detail panel column 440px | The shell handles `with-panel` automatically via `useDetailPanelSlot()`. |
| `.global-rail` | rendered by `WorkbenchShell` chrome | `width: 52px; padding: 10px 8px; background: #e7f0ff; border-right: 1px solid var(--border-subtle); gap: 4px; flex-direction: column` | App-level; not VOC-specific. |
| `.sidebar` | rendered by shell | `width: 240px; background: var(--surface-sidebar); border-right: 1px solid var(--border-subtle)` | |
| `.nav-item` | inside sidebar | `display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 2px; color: var(--text-muted); font-size: 13px; font-weight: 400`. Active: `bg-surface-popover text-text-primary font-medium` | |
| `.nav-section` | sidebar group title | `margin: 14px 8px 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-disabled)` | |
| `.nav-count` | nav badge | `min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9999px; background: var(--color-charcoal-grey); color: var(--text-muted); font-size: 10px; font-weight: 600; tabular-nums`. `.urgent → bg-accent-danger/15 text-accent-danger; .accent → bg-accent-primary/12 text-accent-primary` | |
| `.main-region` | shell main column | `display: flex; flex-direction: column; background: var(--surface-canvas)` | |
| `.topbar` | shell top bar (`ShellHeader`) | `height: 50px; padding: 0 20px; gap: 12px; border-bottom: 1px solid var(--border-subtle)` | Use `<ShellHeader>`. |
| `.main-scroll` | scroll container | `flex: 1; overflow-y: auto` | |
| `.main-padded` | padded content region | **`padding: 28px 32px 36px`** | Use for PageShell content area; not in WorkbenchShell list body. |
| `.page-header` | header row | `justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px` | |
| `.page-title` | | `font-size: 20px (--text-xl); font-weight: 600; letter-spacing: -0.22px; margin: 0 0 4px` | |
| `.page-subtitle` | | `font-size: 13px; color: var(--text-muted); margin: 0` | |

---

## §4 Common inline-style patterns

The prototype JSX repeatedly hand-rolls a small set of styles. Use the Pack 17 equivalent
in the right column. Where the prototype uses a raw rgba with specific alpha, the Pack 17
column gives the **closest semantic utility + alpha modifier**; the actual computed pixel
value may differ by 1–2% — that is intentional under ADR-0021.

| # | Prototype inline style | Intent | Pack 17 equivalent |
|---|---|---|---|
| 1 | `style={{ background: 'rgba(20, 40, 160, 0.04)', boxShadow: 'inset 0 0 0 1px rgba(20, 40, 160, 0.18)' }}` | Subtle aether-blue tinted card (Reporter-facing status block) | `bg-accent-primary/5 ring-1 ring-inset ring-accent-primary/20` (or `shadow-[inset_0_0_0_1px_rgb(var(--color-aether-blue)_/_0.18)]`) |
| 2 | `.ms-chip[data-active="true"] { background: rgba(20,40,160,0.06); box-shadow: rgba(20,40,160,0.45) 0 0 0 1px inset }` | Active managed-system chip | `bg-accent-primary/8 ring-1 ring-inset ring-accent-primary/45` |
| 3 | `.source-radio[data-active="true"] { background: rgba(20,40,160,0.04); box-shadow: rgba(20,40,160,0.4) 0 0 0 1.5px inset }` | Active source radio card | `bg-accent-primary/5 ring-[1.5px] ring-inset ring-accent-primary/40` |
| 4 | `style={{ background: 'rgba(20,40,160,0.14)', color: 'var(--color-neon-lime)' }}` (filter chip) | Active filter chip | `bg-accent-primary/15 text-accent-primary` |
| 5 | `style={{ background: 'rgba(20,40,160,0.16)', color: 'var(--color-neon-lime)' }}` (badge update) | "변경 예정" emphasis badge | `bg-accent-primary/15 text-accent-primary` |
| 6 | `.severity-pick[data-sev="X"][data-active="true"] { background: rgba(<sev>,0.08); box-shadow: rgba(<sev>,0.55) 0 0 0 1.5px inset }` | Per-severity active picker | `bg-severity-{low|medium|high|critical}/10 ring-[1.5px] ring-inset ring-severity-{level}/55` |
| 7 | `style={{ background: 'rgba(94, 106, 210, 0.10)', color: 'var(--color-aether-blue)' }}` (similar badge) | "N similar" pill | `bg-accent-primary/10 text-accent-primary` |
| 8 | `.cmdk-item.active { background: rgba(20,40,160,0.08); box-shadow: 0 0 0 1px rgba(20,40,160,0.28) inset }` | Active command palette row | `bg-accent-primary/8 ring-1 ring-inset ring-accent-primary/30` |
| 9 | `.entity-ref:hover { border-bottom-color: rgba(20,40,160,0.5); color: var(--color-neon-lime) }` | Inline entity-ref hover underline | `hover:border-b-accent-primary/50 hover:text-accent-primary border-b border-dashed border-transparent` |
| 10 | `.btn-danger:hover { background: rgba(235,87,87,0.10) }` (legacy 87,87 red) | Danger button hover | `hover:bg-accent-danger/10` (pixel-different but semantically correct) |
| 11 | `.badge-blocked { background: rgba(235,87,87,0.08); color: var(--text-danger) }` | "Owner 필요" / blocked badge | `bg-accent-danger/10 text-text-danger` |
| 12 | `style={{ color: 'var(--color-warning-red)', background: 'rgba(235,87,87,0.08)' }}` (Owner needed) | "Owner 필요" inline badge | Same as row 11; use `<OutlineBadge tone="danger">` if available, else `bg-accent-danger/10 text-accent-danger` |
| 13 | `.timeline-content.internal { background: rgba(49,87,213,0.06); border-left: 2px solid var(--color-deep-violet) }` | Internal note bubble | `bg-status-reporter-assigned/8 border-l-2 border-status-reporter-assigned` |
| 14 | `style={{ background: 'rgba(94,106,210,0.12)', padding: 10, borderRadius: 6 }}` (owner reply bubble) | Owner reply bubble in preview modal | `bg-accent-primary/10 p-2.5 rounded-md` |
| 15 | `style={{ background: 'var(--color-pitch-black)', borderRadius: 6, boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}` (Reporter preview frame) | Reporter preview card frame | `bg-surface-canvas rounded-md ring-1 ring-inset ring-border-subtle` |
| 16 | `style={{ padding: 14, background: 'var(--color-pitch-black)', borderRadius: 8, boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}` | Larger preview frame (modal body) | `p-3.5 bg-surface-canvas rounded-lg ring-1 ring-inset ring-border-subtle` |
| 17 | `style={{ background: 'rgba(2,184,204,0.10)', color: 'var(--color-cyan-spark)' }}` (`.badge-public`) | Public timeline marker | `bg-accent-info/10 text-accent-info` |
| 18 | `style={{ background: 'rgba(138,143,152,0.10)', color: 'var(--text-muted)' }}` (`.badge-internal-only`) | Internal-only marker | `bg-text-muted/12 text-text-muted` |
| 19 | `box-shadow: rgb(47,71,120) 0px 0px 0px 1px inset` (card hover) | Card hover ring (dark-pack residue) | `hover:ring-1 hover:ring-inset hover:ring-border-strong` |
| 20 | `style={{ background: 'rgba(255,193,74,0.4) inset, var(--shadow-xl) }}` (toast warn) | Toast-tone-warn outline | `ring-1 ring-inset ring-accent-warn/40 shadow-xl` |
| 21 | `style={{ color: 'var(--color-cyan-spark)' }}` (linked-finding row id) | Linked-finding hyperlink color | `text-accent-info` |
| 22 | `style={{ color: 'var(--color-amber)' }}` (No area meta) | "No area" warning text inline | `text-accent-warn` |
| 23 | `style={{ borderTop: '1px solid var(--border-subtle)' }}` | Section divider inline | `border-t border-border-subtle` |
| 24 | Korean text emphasis: `<strong style={{ color: 'var(--text-secondary)' }}>` | Emphasized name in muted meta line | `<strong className="text-text-secondary font-medium">` |
| 25 | `color-mix(in oklch, var(--surface-detail) 94%, white)` (panel-section-nav bg) | Sticky panel nav background | `bg-surface-detail/95` (approximation; if pixel-exact needed, declare an arbitrary class). |

---

## §5 Layout & rhythm cheatsheet

Quoted directly from styles.css. Use these literals; do not re-derive.

**Detail panel**
- `.panel-scroll` padding: **`28px 24px 32px`** (top, x, bottom). Tailwind: `pt-7 px-6 pb-8`.
- `.panel-section` margin-bottom: **`32px`** (`mb-8`); last child `mb-0`.
- `.panel-section-title` margin-bottom: **`14px`** (`mb-3.5`).
- `.panel-title-block` margin-bottom: **`24px`** (`mb-6`).
- `.panel-title` size 17px / weight 600 / tracking -0.22px / leading 1.35.
- `.panel-subtitle` size 12px / `text-text-muted`.
- `.field-row` padding: **`8px 0`** vertical; grid `120px 1fr`; gap 12px.
- `.panel-header` height **`50px`** (`--topbar-height`); padding **`0 12px 0 20px`**.
- `.panel-footer` padding: **`16px 20px`**; border-top subtle; sits inside `aside.detail-panel` after `panel-scroll`.
- `.panel-section-nav` sticky; padding **`6px 24px 8px`**.

**Page (PageShell)**
- `.main-padded` padding: **`28px 32px 36px`** (`pt-7 px-8 pb-9`). Constrained variant caps at `max-width: 1600px`.
- `.page-header` margin-bottom **`24px`**; gap 16px; aligns flex-end.
- `.page-title` size **`20px`** / weight 600 / tracking **`-0.22px`**; margin `0 0 4px`.
- `.page-subtitle` size 13px / `text-text-muted`.

**Toolbar (list)**
- `.toolbar` min-height **`50px`** (`--toolbar-height`); padding **`0 20px`**; gap **`8px`**; sticky top; `z-index: 2`; border-bottom subtle.
- `.toolbar-action` sticky right at `right: 12px`; padding-left 12px; gradient mask.
- `.toolbar-divider` 1px × 16px; margin `0 4px`.
- `.tab` height **`28px`**; padding **`5px 10px`**; gap 6px; radius 6px.

**Object rows (Inbox)**
- Default `min-height: 60px` (`--row-height-default`); padding **`10px 20px`**.
- Compact `44px`; padding **`6px 20px`**.
- Expanded `96px`; padding **`14px 20px`**.
- Border-bottom: 1px `var(--border-subtle)`.
- Selected: 2px left bar `--color-neon-lime`.
- Hover: `--surface-row-hover`; selected: `--surface-row-selected`.

**Composer**
- `.composer-body` `padding: 14px 14px 18px; min-height: 96px` (use `<RichEditor minHeight={84} />` to match the prototype VOC composer call site).
- `.composer-footer` `padding: 10px 12px`; bg `--color-graphite`.
- `.composer-tab` padding `8px 10px`.

**Forms (Create)**
- `.form-field-label` margin-bottom **`8px`**.
- `.form-block` no margin (rhythm is provided by `<FormDivider />` between blocks).
- `.severity-grid` 2-col grid, gap 8px; `.severity-pick` padding `8px 12px`, radius 6px.
- `.ms-chip` padding `6px 10px`, radius 6px, gap 8px.
- `.source-radio` padding `14px 16px`, radius 6px.
- `.dropzone-compact` padding `10px 14px`, dashed `--border-strong`.
- Create form grid: `gridTemplateColumns: 'minmax(0, 1fr) 320px'`, gap 28px (per `screen-voc-create.jsx`).

**Radius scale** (`tailwind.preset.ts`)
- `rounded-sm` = 2px (`--radius-sm`)
- `rounded-md` = 6px (`--radius-md`) — **default**
- `rounded-lg` = 8px (`--radius-lg`)
- `rounded-xl` = 12px (`--radius-xl`)
- `rounded-pill` = 9999px

**Shadows** (`tailwind.preset.ts`)
- `shadow-sm` `rgba(16,24,40,0.06) 0 2px 4px`
- `shadow-md` `rgba(20,40,160,0.06) 0 0 12px inset`
- `shadow-subtle` `rgb(213,224,244) 0 0 0 1px inset`
- `shadow-subtle-2` `rgba(20,40,160,0.10) 0 0 0 1px`
- `shadow-xl` `rgba(20,40,160,0.12) 0 12px 36px`
- `shadow-focus` `0 0 0 2px #fff, 0 0 0 4px var(--color-neon-lime)`

**Typography scale**
- `--text-caption` 10px / `--text-tiny` 11px / `--text-xs` 12px / `--text-sm` 13px / `--text-body` 14px / `--text-md` 15px / `--text-lg` 17px / `--text-xl` 20px / `--text-heading` 24px / `--text-heading-lg` 32px / `--text-display` 48px.
- Leading: tight 1.2 / normal 1.4 / relaxed 1.6.
- Tracking: tight -0.22px / normal -0.13px / wide 0.04em.

**Layout tokens** (`--…-width` and `--…-height`)
- Sidebar 240px; sidebar-collapsed 56px; rail 52px; detail-panel 440px; toolbar 50px; topbar 50px.
- Tailwind: `w-sidebar w-rail w-detail-panel h-toolbar h-topbar h-row-compact h-row-default h-row-expanded`.

**Icon sizes**
- `--icon-size-sm` 12px / `--icon-size-md` 16px / `--icon-size-lg` 20px.
- Row icons: 16px. Section-title icons: 10–12px. In-button icons: 11px (sm) / 12–14px (md/lg).

---

## §6 Quoting rule for chunk briefs

Sonnet, when you receive an implementation chunk brief that depends on a VOC surface,
this is the procedure that is **non-negotiable**:

1. **Open the prototype JSX for the surface** before writing any code. The canonical
   sources are:
   - `docs/design-prototype/screen-voc.jsx` (Inbox row, Inbox list, Detail panel,
     Composer, Trail action card, Reporter status change block, Composer previews,
     Inbox toolbar, VOC screen wrapper).
   - `docs/design-prototype/screen-voc-create.jsx` (Create form, Severity picker,
     Managed-system chip grid, Analytics area chips, Attachments dropzone,
     Similar-VOC mini cards, Create action bar).
   - Companion screens for related primitives: `components.jsx`, `entity-preview.jsx`,
     `rich-editor.jsx`, `affordances.jsx`, `shell.jsx`.

2. **Quote the relevant prototype JSX block verbatim** inside your chunk brief
   (or your scratchpad — but it must be in the artefact you submit for review). Quote
   the entire JSX subtree you intend to reproduce, plus the surrounding 2–3 lines of
   context. This is the source of truth for **structure**.

3. **Translate every prototype class → Pack 17 primitive** via §3 of this document.
   - If the row in §3 names a `@fops/ui` component, **use that component**. Never
     hand-roll a primitive that already exists.
   - If §3 says "shadcn `<Input>`" or "shadcn `<Popover>`", use the shadcn primitive —
     `packages/ui/src/index.ts` exports them as-is.
   - If §3 has no row (e.g. niche utility), translate the CSS literally using the
     spacing/typography values quoted in §5 + Tailwind utilities from `tailwind.preset.ts`.

4. **Translate every inline `style={…}` block** using §4. For each pattern you encounter
   in the prototype that does not appear in §4, **stop and flag it** in your brief
   under an "Inline style not in PROTOTYPE-TO-PACK17 §4" subsection so the doc can be
   extended.

5. **Reproduce spacing/typography to within 1px**. Quote the values from §5. Pixel diffs
   greater than 1px against the prototype screenshot are a regression.

6. **Tailwind utility classes only.** No raw hex strings (`bg-[#1428a0]` etc.) and no raw
   px outside the spacing scale, with these explicit exceptions where the prototype
   itself uses ad-hoc px:
   - `min-h-[96px]` (composer body baseline)
   - `min-h-[84px]` (RichEditor minHeight prop, when in the VOC detail composer)
   - `w-0.5 h-0.5` (row-meta dot — already in scale as `0.5`)
   - `w-[3px] h-4` (severity indicator — already in §3.2)
   - `w-[18px] h-[18px]` (entity-node icon)
   - `gap-[2px]` (segmented inner gap)
   - `tracking-[0.04em]` and `tracking-[-0.22px]` (already provided as `tracking-wide`
     / `tracking-tight` — prefer those)
   - `text-[11px]` / `text-[13px]` / `text-[17px]` etc. — **use** the semantic
     tokens (`--text-tiny` / `--text-sm` / `--text-lg`) via Tailwind theme extension if
     present, otherwise arbitrary-value classes are acceptable.

7. **Always pass through the @fops/ui primitive.** Slice 3 #20 ships these for a reason:
   `Button`, `SearchInput`, `ListToolbar`, `ListFilterButton`, `ListSortButton`,
   `SeverityIndicator`, `SeverityBadge`, `ReporterStatusBadge`, `InternalTaskBadge`,
   `ManagedSystemPill`, `OutlineBadge`, `EntityIconBadge`, `UserAvatar`, `UserChip`,
   `DetailPanelHeader`, `DetailPanelHeaderActions`, `PanelTitleBlock`,
   `PanelSectionTitle`, `FieldRow`, `NestedTextBlock`, `Callout`,
   `PermissionBlockedPanel`, `LinkedEntityTrail`, `RichEditor`, `RichContentRenderer`,
   `FieldLabel`, `DirtyConfirmation`, `EmptyState`. Plus shadcn:
   `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `RadioGroup`, `ToggleGroup`,
   `Card`, `Dialog`, `AlertDialog`, `Alert`, `Tooltip`, `HoverCard`, `Popover`,
   `Sheet`, `Tabs`, `Skeleton`, `Avatar`, `Badge`, `DropdownMenu`, `Combobox`.
   Plus shells: `PageShell` / `ListShell` / `WorkbenchShell` / `ShellHeader`.

---

### Flagged ambiguities

For chunk-brief authors — these are open questions this doc could not fully resolve:

- **`.field-label-compact`** (uppercase, smaller) is not exposed by `FieldLabel` today.
  If a Slice 3 chunk needs the uppercase-eyebrow form, propose a `density="compact"`
  prop rather than hand-rolling the styles inline.
- **`.severity-pick` per-severity active styles** rely on per-severity rgba tints whose
  base color in the prototype (`242, 196, 109` for medium, `138, 143, 152` for low,
  `235, 87, 87` for critical) does **not** match the Pack 17 raw values for `--color-amber`
  (`#a56300`), `--color-storm-cloud`, or `--color-warning-red`. Use the Pack 17 tokens
  (`bg-severity-{level}/10` etc.) — the visual will differ from the prototype's exact
  pixel values but stays correct under ADR-0021.
- **`.timeline-content.internal`** uses `var(--color-deep-violet)` and `rgba(49,87,213,0.06)`.
  Pack 17 has `--color-deep-violet` (#3157d5) but no semantic alias other than
  `--status-reporter-assigned`. The mapping in §3.11 uses that token; if a brief wants a
  dedicated `--accent-internal` alias, raise it.
- **Toast tone ring colors** (`rgba(39,166,68,0.4)` success, `rgba(255,193,74,0.4)` warn,
  `rgba(255,90,95,0.4)` danger) are dark-pack residue values. Pack 17 should use
  `ring-accent-{success|warn|danger}/40`; the hue will differ from the prototype's exact
  pixels.
- **`.cmdk-backdrop`** uses `backdrop-filter: blur(4px)`. If Pack 17 modals deviate
  (e.g. no blur for performance), capture in a Slice 3 ADR.
- **`color-mix(in oklch, var(--surface-detail) 94%, white)`** on `.panel-section-nav` is
  not currently expressible as a single Tailwind utility. Approximation:
  `bg-surface-detail/95`. If a brief needs pixel-exact, declare an arbitrary class.
