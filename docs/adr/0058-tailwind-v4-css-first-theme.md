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

`@theme inline` is chosen over plain `@theme`: an inline theme embeds the
theme value verbatim into each utility (`rounded-sm` compiles to
`border-radius: var(--radius-sm)`), so utilities never read a theme-owned
variable under a colliding name. Inline does **not** mean "emits no
variables": Tailwind 4.3.3 still emits self-referencing declarations
(`--radius-sm: var(--radius-sm)`, `--font-sans: var(--font-sans)`) into
`@layer theme`, and a plain `@theme` would emit real values there that
collide with token names. The real token declarations in `tokens.css` win
only because the documented import order places the `layer(base)` token
files in the later `base` layer. **Theme before base is a consumer
invariant**: importing the theme layer last — or importing the token files
without a layer — hands the theme layer the last word and silently changes
rendering.

Consumption contract (analytics-platform and any new consumer):

```css
@import 'tailwindcss';
@import '@fops/ui/styles/tokens.css' layer(base);
@import '@fops/ui/styles/semantic.css' layer(base);
@import '@fops/ui/styles/theme.css';
@import '@fops/ui/styles/compat.css';
@source '<your component tree>';
@source '<feedbackops-checkout>/packages/ui/src';
```

- Import order is `tailwindcss` → tokens/semantic (`layer(base)`) → theme →
  compat. `compat.css` is the package parity layer: the v3 Preflight pins
  (default border `#e5e7eb`, input/textarea placeholder `#9ca3af`, button
  `cursor: pointer`), the v3 `space-y-*` semantics as a functional utility,
  and the `leading-*`/`tracking-*` legacy shims. The `text-xs/sm/lg/xl`
  line-height resets stay with the text-size mappings in the exported
  `theme.css`. App-only rules (body typography, webfonts, screen scaffolding)
  stay in the consuming app.
- Body/font prerequisites (not shipped by the package): the consumer's
  `body` must carry the Pack 17 body typography —
  `font-family: var(--font-sans); font-size: var(--text-body);
  line-height: var(--leading-normal);` — and the webfont packages
  (`@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`,
  `pretendard` dynamic subset) must be imported UNLAYERED, exactly as
  `apps/frontend/src/styles.css` does.
- `@source` must name the consumer's own tree **and** this submodule's
  `packages/ui/src`, because the package class strings live there. Example
  for a consumer with the FeedbackOps checkout as a sibling submodule:
  `@source '../FeedbackOps/packages/ui/src';` next to its own `@source`.

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
`packages/ui/src/styles/compat.css`: tokens.css defines
`--leading-tight/normal/relaxed` (1.2 / 1.4 / 1.6) and
`--tracking-tight/normal/wide` (-0.22px / -0.13px / 0.04em), which in
v4 would capture the `leading-*` / `tracking-*` utilities that v3 rendered
from Tailwind's default scale (1.25 / 1.5 / 1.625; -0.025em / 0 / 0.025em).
The shims pin those six utilities to the v3-rendered values. The
`text-base`/`text-2xl` Type Scale pairs are unaffected — they reference the
token variables directly.

v4 changes that would otherwise alter rendering are pinned to the exact v3
values in the same compat layer: default border color `#e5e7eb`,
input/textarea placeholder `#9ca3af`, `cursor: pointer` on buttons, and
`space-y-*` as a functional `@utility` reproducing v3's selector and
declarations (`> :not([hidden]) ~ :not([hidden])` with `margin-top`), so
variants compose (`space-y-2 sm:space-y-4`) and hidden children stay out of
the spacing chain — v4's `margin-block-*` on `> :not(:last-child)` does
neither. The two `DetailPanelSectionNav` scroll fades pin sRGB interpolation
(`bg-linear-to-r/srgb`) because v4 defaults gradients to oklab. Milestone
dots and avatars — the sites whose specs pin the computed
`--radius-pill`/9999px value — use the token-backed
`rounded-(--radius-pill)` because v4's `rounded-full` computes
`calc(infinity * 1px)` (≈ `3.35544e+07px`) where v3 computed `9999px`;
other pill-shaped surfaces keep `rounded-full` (rendered pixels identical),
and no doubled-class specificity override exists.

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
- Content detection is automatic plus explicit: the committed entry uses
  plain `@import "tailwindcss"` (auto-detection from the app root is ON) and
  adds `@source '../index.html'`, `@source './'`, and
  `@source '../../../packages/ui/src'`. The explicit entries pin the contract
  for the ui package and mirror the v3 `content` globs. Neither source
  directory excludes its test trees: test files and fixtures under the app
  `src/` and `packages/ui/src` ARE scanned, and a utility candidate that
  appears only in a test still compiles into the generated CSS.
  `source(none)` plus explicit globs would exclude them but was removed
  during the migration (it breaks the Biome CSS parser); a stricter
  detection policy is a separate verified decision, not a documented
  exclusion that is not in place.
- Webfont `@import`s (`@fontsource-variable/*`, `pretendard`) stay UNLAYERED.
  Observed during this migration: the upgrade tool's `layer(base)` wrap of
  those imports silently disabled every webfont. The compiler itself retains
  all `@font-face` rules either way (layered or not — CSS Cascade 5 defines
  layered `@font-face`, so the earlier "browsers drop layered @font-face"
  claim was wrong); the unlayered pin is a measured requirement of this
  pipeline, not a browser rule.
- `tailwind-merge` 2.5.5 → 3.x (the v4-scale line). `cn()` needs no
  `extendTailwindMerge`: semantic classes (`text-text-muted` vs `text-sm`) do
  not conflict — unknown text suffixes stay in the text-color group, sizes in
  the font-size group, as before.

## Consequences

- analytics-platform consumes `@fops/ui` directly with the import contract
  above (tailwind → tokens → semantic → theme → compat + `@source`s); no JS
  config, no preset types. The package-dependent parity rules ship as
  `@fops/ui/styles/compat.css`; `packages/ui/src/styles/__tests__/
  consumer-contract.test.ts` compiles only the documented imports and fails
  if that output ever loses a parity-critical rule (button cursor, v3
  `space-y` selector, `rounded-(--radius-pill)` → `var(--radius-pill)`,
  token color utility).
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
