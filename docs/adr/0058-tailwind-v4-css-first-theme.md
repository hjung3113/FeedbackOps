# Tailwind v4 CSS-first theme in `@fops/ui`

> **Status:** Accepted (2026-10-03, issue #743). Supersedes the
> [Tokens: CSS variables + Tailwind theme.extend](0016-ui-foundation-dark-wcag-tokens-wrap.md#tokens-css-variables--tailwind-themeextend)
> section of ADR-0016. Token names (ADR-0021) and values (Pack 17) are
> unchanged; only the exposure mechanism moves.

## Context

analytics-platform (Tailwind v4, `@tailwindcss/vite`, CSS-first `@theme`) will
consume `@fops/ui` — tokens, theme, shadcn primitives, shell components —
directly from its FeedbackOps submodule. FeedbackOps was on Tailwind 3.4.17
with a JS preset (`packages/ui/tailwind.preset.ts`, `theme.extend`,
`rgb(var(--X) / <alpha-value>)` colors) loaded through
`apps/frontend/tailwind.config.ts`. A v4 consumer cannot load a v3 JS preset.

Decision (owner, 2026-10-03, recorded in analytics-platform#52): upgrade
FeedbackOps to v4 first. **Non-goal: any visual change or token value change.**
The committed visual harness (`apps/frontend/tests/visual`, 105 specs, baselines
rendered on Tailwind 3.4) is the parity oracle and passed without baseline
changes.

## Decision

### 1. CSS-first theme, JS preset removed

`packages/ui/src/styles/theme.css` is a v4 `@theme inline` block carrying every
mapping the preset had: semantic colors including the `#525` `-label` pairs,
`fontFamily`, `fontSize` (with the two Type Scale line-height pairs),
spacing layout tokens, `borderRadius`, `boxShadow`. It is exported as
`@fops/ui/styles/theme.css`. `tailwind.preset.ts`, the `./tailwind-preset`
export, and `apps/frontend/tailwind.config.ts` are deleted.

### 2. `@theme inline` because theme namespaces overlap token names

Tailwind v4 turns theme keys into CSS variables in fixed namespaces
(`--color-*`, `--radius-*`, `--shadow-*`, `--text-*`, `--font-*`,
`--spacing-*`, `--leading-*`, `--tracking-*`). `tokens.css` already declares
variables in those namespaces (`--radius-sm`, `--shadow-sm`, `--text-xs`,
`--font-sans`, `--leading-tight`, `--tracking-tight`, …).

`@theme inline` is chosen over plain `@theme`: an inline theme emits **no**
`:root` variables — utilities embed the theme value verbatim (here:
`var(--radius-sm)` and friends). Tokens therefore stay the single value
authority regardless of import order or cascade layer, and no emitted theme
variable can shadow a token (or lose to one and silently change meaning).
Plain `@theme` would emit `:root` declarations that collide with token names
and make rendering depend on layer order.

Consumption contract (analytics-platform and any new consumer):

```css
@import 'tailwindcss' source(none);
@import '@fops/ui/styles/tokens.css' layer(base);
@import '@fops/ui/styles/semantic.css' layer(base);
@import '@fops/ui/styles/theme.css';
@source '<your component trees>';
```

### 3. Class names keep their v3 meaning

The upgrade tool renamed utilities whose *default* scale changed
(`outline-none` → `outline-hidden`, `backdrop-blur-[4px]` →
`backdrop-blur-xs`, arbitrary-spacing → numeric (`min-w-32`), data-attribute
variant syntax, `wrap-break-word`, `bg-linear-to-*`). Where the v4 output
equals the v3 output, renames are kept.

Bare `rounded` / `shadow` / `rounded-sm` / `shadow-sm` class names were **not**
renamed (v4 still generates them). The theme maps the token-backed keys so
they render the token values exactly as in v3 (`rounded-sm` → `var(--radius-sm)`
= 2px; `shadow-sm` → `var(--shadow-sm)`), while bare `rounded` / `shadow`
render Tailwind's built-in defaults, which equal the v3 defaults.

Two structural collisions are repaired with `@utility` compat shims in
`theme.css`: tokens.css defines `--leading-tight/normal/relaxed` (1.2 / 1.4 /
1.6) and `--tracking-tight/normal/wide` (-0.22px / -0.13px / 0.04em), which in
v4 would capture the `leading-*` / `tracking-*` utilities that v3 rendered
from Tailwind's default scale (1.25 / 1.5 / 1.625; -0.025em / 0 / 0.025em).
The shims pin those six utilities to the v3-rendered values. The
`text-base`/`text-2xl` Type Scale pairs are unaffected — they reference the
token variables directly.

v4 changes that would otherwise alter rendering are pinned in
`apps/frontend/src/styles.css` to the exact v3 values: default border color
`#e5e7eb`, input/textarea placeholder `#9ca3af`, `cursor: pointer` on buttons.
The two `DetailPanelSectionNav` scroll fades pin sRGB interpolation
(`bg-linear-to-r/srgb`) because v4 defaults gradients to oklab. Two more
v4-behavior shims live in the same block: `space-y-*` (v4 sets
`margin-block-end` on the preceding sibling, which an inline first child
drops — the shim restores v3's `margin-top` on `> * + *` for the eight
variants in use) and `rounded-full` (v4 computes `calc(infinity * 1px)` ≈
`3.35544e+07px` where v3 computed `9999px`; pixels identical, computed value
pinned for the milestone computed-style assertions).

### 4. Opacity modifiers render via `color-mix`

v3 emitted `rgb(var(--X) / α)` for modifiers; v4 emits
`color-mix(in oklab, <color> α, transparent)`. Mathematically both composite
the same (premultiplied-alpha interpolation toward transparent preserves the
source channels); the visual harness confirmed parity, so theme colors are
declared as plain colors (`rgb(var(--severity-high))`) and v4's modifier
mechanism is used as-is.

### 5. Plugin and pipeline

- **`@tailwindcss/typography` stays unloaded** (#743 finding): it was declared
  in `apps/frontend` dependencies but never wired in v3 (the deleted
  `tailwind.config.ts` had no `plugins` array), so `prose prose-sm` in
  `RichContentRenderer`/`RichEditor` rendered as inert classes. Loading the
  plugin in v4 restyled every rich-content surface (14px prose type instead of
  the inherited 13px) and failed the parity harness; the dependency is
  removed. A consumer that wants prose styling loads its own plugin — do not
  add it back to this repo without a visual-change decision.
- Build pipeline: `@tailwindcss/vite` (vite plugin, not PostCSS). The PostCSS
  plugin variant is broken under vite here: vite's internal `@import` inliner
  flattens the entry stylesheet before `@tailwindcss/postcss` runs, so the
  plugin sees no `@import 'tailwindcss'` entry and emits only default-theme
  output (tokens, theme, and fonts silently dropped).
- `autoprefixer` is dropped (built into v4).
- Content detection is explicit: `@import 'tailwindcss' source(none)` +
  `@source` for `index.html`, the app `src/`, and `packages/ui/src` — the v3
  `content` globs — so test files and fixtures can never change the generated
  CSS.
- Webfont `@import`s (`@fontsource-variable/*`, `pretendard`) stay UNLAYERED:
  browsers drop `@font-face` declared inside `@layer`, and the upgrade tool's
  `layer(base)` on those imports silently disabled every webfont.
- `tailwind-merge` 2.5.5 → 3.x (the v4-scale line). `cn()` needs no
  `extendTailwindMerge`: semantic classes (`text-text-muted` vs `text-sm`) do
  not conflict — unknown text suffixes stay in the text-color group, sizes in
  the font-size group, as before.

## Consequences

- analytics-platform consumes `@fops/ui` directly with the four-line import
  contract above; no JS config, no preset types.
- Adding a semantic token now touches `tokens.css` **and** `theme.css` (the
  `--color-*` alias) in the same PR; the token-fidelity and token-class-
  coverage tests enforce both sides.
- The `leading-*`/`tracking-*` shims must not be deleted while
  `--leading-*`/`--tracking-*` tokens exist; deleting them silently rebinds
  those utilities to token values (a visual change).
- Upstream Tailwind minor releases may change *default*-scale values
  (`rounded`, `shadow`, `leading-none`, …); parity for those classes is pinned
  by the visual harness, not by the theme.

## Reopening

Reintroducing a JS config, exposing non-inline theme variables (runtime
theming), or changing a token name/value each warrant a new ADR. Adding token
aliases in `theme.css` is not a reopen.
