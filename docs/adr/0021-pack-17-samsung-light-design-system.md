# Pack 17 Samsung-light design system supersedes ADR-0016 dark-only

## Status

Accepted 2026-05-20. Supersedes ADR-0016. Amends ADR-0020 Out-of-scope clause.

## Context

The Open Design Pack 17 refresh (committed `0241471` 2026-05-17) introduces a Samsung-blue light palette as the canonical FeedbackOps visual identity. Pack 17's `docs/design-prototype/styles.css` ships:

- Canvas: `#f3f7fe` (was `#08090a` pitch-black dark)
- Sidebar: `#eef4fb`
- Primary text: `#101828` (was `#f7f8f8` porcelain on dark)
- Accent: `#1428a0` Samsung-blue (was `#e4f222` Neon Lime)
- Border subtle: `#cbd6e6`

The token NAMES from DESIGN.md/ADR-0016 are preserved (`--color-pitch-black`, `--color-neon-lime`, etc.) — only the VALUES invert from dark→light. This avoids breaking every component that references the named tokens.

ADR-0016 locked "dark-only in MVP" with the explicit reopen clause: "Introducing a light theme … warrants a new ADR with a migration story for affected components and lint rules." Pack 17 adoption is that reopen.

## Decision

1. **Light theme is now the only MVP theme.** Pack 17's light values are canonical. Dark theme is removed from MVP scope. A future ADR may reintroduce dark via `[data-theme="dark"]` overrides (the variable-aliased structure from ADR-0016 still enables this at zero migration cost).

2. **Token format in runtime CSS = R G B triple** (decimal, space-separated). `tokens.css` declares `--color-pitch-black: 243 247 254;` so Tailwind utilities can compose alpha via `rgb(var(--color-pitch-black) / <alpha-value>)`. This preserves spec voc.md opacity utilities like `bg-severity-high/15`.

3. **DESIGN.md and `token-fidelity.fixture.ts` keep hex notation** for human readability and snapshot comparison against `docs/design-prototype/styles.css`. The two-format split is explicit: hex for docs/fixtures, R G B for runtime tokens.

4. **WCAG 2.2 AA target inherited from ADR-0016** continues to apply — but contrast pairs must be re-validated for the inverted palette. Dark-theme contrast guarantees do NOT transfer.

## Consequences

- Existing Slice 1/2 routes (`apps/frontend/src/routes/admin/*`, `login.tsx`, picker components) auto-render under the new palette because they consume semantic token names, not raw hex. EXCEPTION: routes that reference Tailwind classes whose tokens are renamed or removed in Pack 17 (e.g. `--surface-overlay` is replaced by `--surface-popover`) will break and must be audited in Slice 3 #18 C1a.
- Focus ring becomes Samsung-blue (`--color-neon-lime: 20 40 160`). The token name "neon-lime" is now historical — it points at Samsung-blue. A future ADR may rename to `--color-accent-primary` once a coordinated rename lands.
- All component contrast pairs require re-verification under WCAG AA. Cycle 2 review of #18 flagged this. Slice 3 #18 final review must include axe-core scan against the touched routes.
- DESIGN.md prose was updated 2026-05-20 (this session) to reflect light-mode framing while keeping document structure intact.

## Token format examples

| Hex (DESIGN.md, fixture) | R G B (runtime tokens.css) | Variable |
|---|---|---|
| `#f3f7fe` | `243 247 254` | `--color-pitch-black` |
| `#fbfdff` | `251 253 255` | `--color-graphite` |
| `#1428a0` | `20 40 160` | `--color-neon-lime`, `--color-aether-blue` |
| `#101828` | `16 24 40` | `--color-porcelain` |

Full mapping lives in `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts` (created in #18 C1a).

## Reopen triggers

Adding dark theme back, raising accessibility target to AAA, switching token format away from R G B triple, or exposing raw color tokens to components each warrant a new ADR.

## Related

- Supersedes ADR-0016 (UI foundation: dark-only MVP …) — entire "dark-only" stance.
- Amends ADR-0020 (Shell taxonomy + 50px header rhythm) — removes the "Light-theme support" entry from its Out-of-scope section.
- Implemented by Slice 3 #18 (FE prologue) C1a (token port + Tailwind preset).
