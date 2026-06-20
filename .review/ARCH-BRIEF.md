# ARCHITECT BRIEF — Issue #55 polish round 2 (chrome-fidelity deltas)

## Context
The VOC Create screen (`/vocs?action=create`) desktop layout already matches the
prototype structurally (card-grouped form, sidebar widgets, sticky bottom bar) —
that work is committed. Close the remaining CHROME-FIDELITY gaps vs the prototype.
Behavior/copy/validation are OUT OF SCOPE (shipped in #19). NO backend changes.

## The spec is the prototype
`docs/design-prototype/screen-voc-create.jsx` is authoritative (AGENTS.md
"Prototype Is The Spec"). Baseline image:
`docs/design-prototype/screenshots/final-baselines/voc-new.png`. Read both, then
match these 4 deltas exactly:

1. **Source Context control** — impl renders 4 full-width underlined tabs; the
   prototype uses a **compact segmented pill control** (the prototype shows 2
   visible options as pills with small leading icons). Match the prototype's
   segmented-pill treatment + sizing/spacing. (Keep all the impl's option VALUES;
   only the visual control changes.)
2. **Managed System chips** — impl = plain text chips; prototype = **icon chips**
   (small leading glyph per system, e.g. TB / PB). Add the per-system icon/glyph
   treatment the prototype uses.
3. **Section labels** — impl uses mixed-case ("Source Context", "Managed System");
   prototype uses **uppercase, smaller, letter-spaced** section labels ("SOURCE",
   "MANAGED SYSTEM", "ANALYTICS AREA", with the small help "?" affordance). Match.
4. **RichEditor toolbar** — add the prototype's right-aligned **"VOC 본문" label**
   on the toolbar row; align icon weight / separator treatment to the prototype.

## Token discipline (hard rule)
NO raw hex / arbitrary values. Use existing semantic tokens (ADR-0021). If the
prototype needs a surface the tokens don't cover, ADD a semantic token to ADR-0021
+ the token source — never inline a hex.

## Files (impl)
`apps/frontend/src/features/voc/components/create/` — VocCreateScreen.tsx,
VocDescriptionToolbar.tsx, the Source/ManagedSystem chip components,
ReporterCard/SeverityDisclaimerCard. Adjust styling/layout/tokens of EXISTING
components — don't rebuild.

## VERIFY (VERIFIER pane runs)
- `pnpm --filter @fops/frontend test` (component tests stay green)
- `pnpm --filter @fops/frontend run typecheck` (no new errors)
- Visual: the conductor will Playwright-screenshot /vocs?action=create at
  1440/1024/390 after you finish, for human review.

## Constraints
- Visual/token only. No behavior, no backend, no new toolbar actions. No raw hex.
- Match the prototype's exact treatments (read screen-voc-create.jsx), don't
  approximate.
