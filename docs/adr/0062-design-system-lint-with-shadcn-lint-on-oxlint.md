# ADR-0062: Design-system lint with `@shadcn/lint` on Oxlint

## Status

Accepted 2026-10-05. The owner asked for `@shadcn/lint`; the Oxlint host and the warn-plus-cap rollout follow
the tool's own setup and adoption guides. Amends ADR-0007 ("Lint and format: Biome") by adding a second lint
host scoped to design-system rules.

## Context

The design rules in `apps/frontend/AGENTS.md` and `packages/ui/AGENTS.md` (semantic tokens, reuse `@fops/ui`
components, no screen-specific restyling) were enforced only by review. `@shadcn/lint`
([shadcn-ui/lint](https://github.com/shadcn-ui/lint)) checks Tailwind class usage against the project's own
components, variants, and theme, and its messages name the variant or token to use instead. It ships as a plugin
for ESLint or Oxlint only; Biome cannot load it. Its setup guide picks Oxlint when a project has neither linter.

## Decision

- **Host.** Oxlint runs only the `@shadcn/lint` rules: `plugins: []` and `categories.correctness: off` in the root
  `.oxlintrc.json`, so no built-in Oxlint rule duplicates Biome. Biome stays the formatter and the general linter.
- **Scope.** `pnpm lint:design` lints `apps/frontend/src` and `packages/ui/src`; tests and the generated route tree
  are ignored. Every `@fops/ui` export is a design-system component (`settings.shadcn.ui`).
- **Theme.** `apps/frontend` is discovered from `src/styles.css`. `packages/ui` has no stylesheet that imports
  Tailwind, so `packages/ui/components.json` points the linter at the app entry; without it every theme utility
  (`h-toolbar`, `rounded-pill`) reads as unknown. That file is read by the linter only; it is not a shadcn CLI
  config, and primitives still enter through the copy-based intake in `docs/tech-stack/component-stack.md`.
- **Boundary.** Screens may add only layout classes to `@fops/ui` components (`no-restyle` with
  `allow: ["layout"]`); `DetailPanelHeader`, `ShellHeader`, and `ListToolbar` also refuse height classes, which
  keeps the ADR-0020 50px rhythm. Inside `packages/ui`, `no-restyle` and `require-static-classes` are off and
  arbitrary layout values pass, because components own their structural geometry; arbitrary typography, spacing,
  and color still report there. `scanAllStrings` makes `no-raw-colors` and `no-arbitrary-values` read class
  strings kept in constants.
- **Rollout.** A rule is `error` in a scope where it is clean: `no-raw-colors` and `no-unknown-classes` in
  `apps/frontend/src`. Everything else is `warn`, and `--max-warnings` caps the whole-repo count at the measured
  614. Repeated overrides and hard-coded values are paid down by adding shared tokens, variants, and components,
  not by lint exceptions; each paid-down scope is promoted to `error`.

## Consequences

- `pnpm lint:design` joins the gate (root `AGENTS.md` → Verification). The cap is one whole-repo count: it fails a
  net increase, not a new finding offset by a fix elsewhere, so review still rejects new findings, and a PR that
  fixes findings lowers the number in the same PR. Rules promoted to `error` need no cap.
- Messages suggest replacements from the theme, but the theme's self-referencing aliases can make the "nearest"
  size wrong; a replacement is checked against the computed value and line-height before it is applied.
- The baseline exposed real defects, tracked separately: shadcn primitive enter/exit classes (`animate-in`,
  `fade-*`, `zoom-*`, `slide-*`) generate no CSS because no animation plugin is installed, and `FieldLabel` uses the
  raw palette color `text-red-500`.
- Oxlint's JS plugin API is alpha, and both packages are pinned exactly.
