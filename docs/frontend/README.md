# Frontend Documentation

Frontend docs translate product intent into implementable UI contracts.

## Precedence

```text
1. docs/frontend/ui-design-system.md
   Owns reusable component patterns, state contracts, screen mapping, responsive behavior, and accessibility.

2. docs/frontend/routes-and-layout.md
   Owns app routes, URL state, list/detail behavior, panel behavior, and responsive navigation.

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
