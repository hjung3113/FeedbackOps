# Design Prototype Bundle

Visual + interaction reference copied from the Open Design hi-fi prototype on 2026-05-17.

## Source

```
/Users/hyojung/Library/Application Support/Open Design/namespaces/release-stable/data/projects/845745f6-c3e4-495c-b5dc-121f71bac734/
```

This is the design team's clickable prototype of the full FeedbackOps suite (VOC, Findings, Tasks, Surveys, Admin). It opens directly in Chrome 124+ via `FeedbackOps.html` (vanilla React + Babel CDN, no build).

## What lives here

- **`HANDOFF.md`** — operating rules, working constraints, agent input bundle requirements, reproduction acceptance contract. **Read first.**
- **`DESIGN-MAP.md`** — route → screen file → backing spec doc mapping, curated visual baselines, component inventory. **Read second.**
- **`FeedbackOps.html`** — entry point. Open in browser to interact.
- **`*.jsx` / `styles.css` / `data.js`** — prototype source. All component patterns + design tokens + mock fixtures.
- **`screenshots/`** — 12 curated visual baselines per `DESIGN-MAP.md` §2.

## How to use

For production implementation work (React + TypeScript + Tailwind + shadcn/ui):

1. Read `HANDOFF.md` end-to-end. The five working rules (component-first, file split budget, terminology contract, spec source-of-truth, production-honest copy) apply to production code.
2. Read `DESIGN-MAP.md` to find the screen file for the route you're implementing.
3. Use the prototype's `screen-*.jsx` as **visual + interaction evidence**, not as code to port. Specifically — do not copy:
   - Hash-only routing (`#route=...`)
   - `window` globals for cross-file component sharing
   - Synthetic local data (`data.js`)
   - `document.execCommand`-based rich editor (use TipTap per ADR-0002)
   - Draft-only API intent panels (`flow-drafts.jsx`)
4. Bind implementation behavior to:
   - `docs/implementation/03-api-contracts.md`
   - `docs/design/15-data-contracts.md`
   - `docs/implementation/06-entity-linking-contract.md`
   - `docs/adr/0012-error-code-contract.md`
5. Match the prototype's visual density, information hierarchy, entity language, and core interactions. Compare implemented screens against the curated screenshots in `screenshots/`.

## Design system mapping

- Raw tokens live in `styles.css` (`--color-*`, `--surface-*`, `--text-*`, etc.). When porting to production, copy the **semantic tokens verbatim** (`--surface-canvas`, `--text-primary`, `--status-reporter-*`, etc.) and re-bind to `DESIGN.md`'s raw colors via Tailwind config.
- Typography: Inter (subs Inter Variable), JetBrains Mono (subs Berkeley Mono).
- Density: 60px default row, 44px compact, 96px expanded. Triage queue uses expanded; all other lists use default.
- Neon Lime reserved for primary action + focus emphasis only — never status badges.
- Reporter-facing VOC status = pill; internal task status = squared. Visually + semantically separate.

## Synchronisation

This is a snapshot. The source folder may continue to evolve. When the design team ships a new Pack:

1. Re-copy the changed files via the same script that landed this bundle.
2. Update this README's "Source" date.
3. Note material changes in the relevant ADR or `docs/frontend/` doc.

Do not edit files in this directory directly — they are a reference copy. Production code lives in `apps/frontend/`.
