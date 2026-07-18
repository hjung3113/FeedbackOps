# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo keeps one shared domain context document. Read the root `CONTEXT.md`, then the ADRs and technical-layer guide relevant to the touched code.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary and stable domain invariants.
- **`docs/adr/`** — architectural decisions. Read those that touch the area you're about to work in.
- The relevant per-directory **`AGENTS.md`** — technical-layer rules.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## File structure

```
/
├── CONTEXT.md                          ← domain glossary and stable invariants
├── docs/
│   ├── adr/                            ← architectural decisions
│   └── implementation/                 ← detailed contracts
├── apps/
│   ├── frontend/AGENTS.md              ← frontend rules
│   └── backend/AGENTS.md               ← backend rules
└── packages/
    ├── ui/AGENTS.md                    ← UI-package rules
    └── shared/AGENTS.md                ← shared-package rules
```

## Local CONTEXT contract

Root `CONTEXT.md` holds the domain glossary plus stable domain invariants. It does not hold implementation mechanics. `docs/adr/*` owns architectural decisions; `docs/implementation/*` owns detailed contracts. When `CONTEXT.md` and an ADR disagree on an architectural decision, the ADR wins.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in root `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
