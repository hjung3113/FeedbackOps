# FeedbackOps Documentation Index

This directory separates product design, frontend UI contracts, and implementation decisions.

## Reading As An Operator

`USER-MANUAL.md` documents the shipped product organised by task ("I need to
triage what came in", "I need permission I do not have"). It describes behaviour,
not intent — for why a behaviour is what it is, follow it into `docs/adr/`.
The [interactive Korean user guide](user-guide/index.html) adds annotated screenshots and a visual walkthrough.

## Reading For Implementation

Root `AGENTS.md` → "Required Reading" and "Source Of Truth" decide what to read for a given change.

## What Lives Where

```text
docs/design/
- Product intent, domain language, ownership, requirements, and roadmap.

docs/frontend/
- Frontend UI contracts, reusable component rules, routes, layout, and interactions.
- tokens.md is the hex visual token seed.

docs/design-prototype/
- The original rendered prototype (HANDOFF.md, DESIGN-MAP.md, screen-*.jsx, data.js, screenshots/final-baselines/).
- A design reference for surfaces not built yet; the shipped UI is the authority (ADR-0060, root AGENTS.md → UI Authority).

docs/tech-stack/
- Approved implementation stack and third-party library governance.

docs/implementation/
- Implementation architecture, API, data, permission, entity-linking, and testing contracts.
- api/ holds the per-domain endpoint contracts.

docs/adr/
- Architectural decision records. An ADR supersedes other documents on the decision it made.
- adr/README.md is the index.

docs/research/
- Open product-decision research. Not authority.

docs/agents/
- Configuration for the agent skills: issue tracker, triage labels, domain-docs layout.

docs/USER-MANUAL.md and docs/user-guide/
- Operator-facing material: the manual (text authority) and the interactive Korean walkthrough with annotated screenshots.
```

Conflict resolution lives in root `AGENTS.md` → "Source Of Truth" (authority by subject + tiebreaks); this file only describes what each `docs/` directory contains.

## Product Invariants

The product invariants live in root `AGENTS.md` → "Product Invariants".
