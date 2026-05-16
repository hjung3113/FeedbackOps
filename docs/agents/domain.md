# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **multi-context** repo. Start at `CONTEXT-MAP.md` at the root, then read the per-context `CONTEXT.md` files relevant to the touched code.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`CONTEXT.md`** at the repo root — system-wide overview (product domain, invariants, bounded contexts).
- **`docs/adr/`** — system-wide ADRs. Read those that touch the area you're about to work in.
- Per-context ADRs at `apps/<app>/docs/adr/` or `packages/<pkg>/docs/adr/` when they exist.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md                          ← system-wide overview
├── CONTEXT-MAP.md                      ← index of per-context CONTEXT.md files
├── docs/adr/                           ← system-wide decisions
├── apps/
│   ├── frontend/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                   ← frontend-specific decisions
│   └── backend/
│       ├── CONTEXT.md
│       └── docs/adr/                   ← backend-specific decisions
└── packages/
    ├── ui/
    │   └── CONTEXT.md
    └── shared/
        └── CONTEXT.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
