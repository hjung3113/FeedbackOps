# Frontend Documentation

Frontend docs translate product intent into implementable UI contracts.

## Precedence

```text
1. docs/frontend/routes-and-layout.md
   Owns app routes, URL state, list/detail behavior, panel behavior, and responsive navigation.

2. docs/frontend/ui-design-system.md
   Owns reusable component patterns, state contracts, screen mapping, responsive behavior, and accessibility.

3. docs/frontend/component-inventory.md
   Owns implementation component inventory, variants, required states, and first consumers.

4. docs/frontend/interaction-patterns.md
   Owns workflow-level UX state machines, cross-system creation flows, and permission UX.

5. docs/design/12-ui-ux-principles.md
   Owns product UI intent and traceability to requirements.

6. docs/tech-stack/component-stack.md
   Owns approved frontend library stack and third-party component intake rules.
```

## Visual Input

`DESIGN.md` is a raw visual token seed. It does not own component behavior,
route behavior, workflow states, accessibility behavior, or frontend source
paths.

External design prompts, generated HTML files, screenshots, and prototype
references are visual references only. They may inform density, spacing, layout
feel, interaction inspiration, and visual polish, but they must not override
domain terminology, route contracts, workflow states, permission rules, API
contracts, accessibility behavior, or component behavior contracts.

## Domain Terminology

Frontend documentation should use `Managed System` for MVP scope, filters, and
defaults. Tableau, Power BI, and Looker-like analytics programs are Managed
Systems. Use `managedSystem=:managedSystemId|all` for user-facing MVP scope URL
state; do not introduce per-Managed-System route trees.
`all` means the actor's effective Managed System scope union and is truly
workspace-wide only for Admin.

Use Role Level labels for user-facing authority descriptions: `Admin`,
`Developer`, and `User`. Backend capability checks remain authoritative.

## Token Rule

Application code should consume semantic frontend tokens, not raw visual reference tokens directly.

```text
Allowed in screen and component code:
- --text-primary
- --surface-detail
- --border-selected
- --status-reporter-*
- --severity-*

Avoid outside token implementation files:
- --color-pitch-black
- --color-neon-lime
- hard-coded hex colors
```
