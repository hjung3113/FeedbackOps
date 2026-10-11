# ADR-0063: Shared motion foundation

## Status

Accepted (2026-10-11). Reverses the #785 decision to remove overlay animation support
(implemented by #788); the owner requested continuity for overlays and reduced-motion handling.

## Context

Overlays appear and disappear without motion, and the documented reduced-motion rule has no
shared implementation. Component-specific timings would fragment the policy and make future
list and drag motion harder to keep consistent. The existing five-import `@fops/ui` CSS
consumer contract (ADR-0058) must deliver the foundation to every consumer unchanged.

## Decision

- Define fast/base/slow durations (`150ms`, `200ms`, `300ms`) and standard/enter/exit easings
  (`cubic-bezier(0.4, 0, 0.2, 1)`, `cubic-bezier(0, 0, 0.2, 1)`,
  `cubic-bezier(0.4, 0, 1, 1)`) once in `packages/ui/src/styles/tokens.css`.
  `theme.css` aliases them for animations and easing, and maps transition defaults to
  fast/standard so existing transitions keep their timing.
- Use exact `tw-animate-css@1.4.0`, shadcn's Tailwind v4 overlay mechanism, imported at the top
  of the existing `theme.css`. Export static overlay class constants from
  `packages/ui/src/utils/motion.ts` as the only overlay motion seam. Popper surfaces fade,
  zoom 95, and slide 2 units from the trigger side (base/enter, fast/exit); dialogs and the
  command palette fade and zoom without slide; scrims fade only; sheets slide from/to their
  side (slow/enter, base/exit). Tooltip entry handles `delayed-open` and `instant-open` as
  well as `open`. Select receives enter motion only because Radix Select has no exit
  Presence; its lifecycle is unchanged.
- Use `@formkit/auto-animate` behind a `useListMotion` hook for list continuity, implemented
  in #994 for bounded Triage, Task Request, recommendation, and Survey question lists.
  The exported `readMotionTiming` helper is the JS entry to the shared tokens. Board drag
  motion (#995) remains separate and also consumes the same tokens.
  The pinned `@formkit/auto-animate@0.10.0` uses `patches/@formkit__auto-animate@0.10.0.patch` to clear polling startup timers and removed-row observers and prevent detached-element polling after teardown.
- Ship one global `prefers-reduced-motion: reduce` rule through the existing package CSS
  chain: on `*, ::before, ::after`, animation and transition duration are `0.01ms !important`,
  animation iteration count is `1 !important`, and scroll behavior is `auto !important`.
  The nonzero animation duration preserves the `animationend` Radix needs to unmount exits.
  JS-driven motion reads the SSR/jsdom-safe `prefersReducedMotion()` helper at use time;
  explicit smooth-scroll calls select `auto` when reduction is requested.
- Motion serves continuity when appearing, leaving, or moving feels broken without it.
  No decorative page/tab transitions, staggered rows, count-ups, or hover lifts. Sonner
  toasts keep their existing behavior.

## Alternatives rejected

- **Motion / Framer Motion:** adds weight after Slice 47's bundle work; the selected CSS
  mechanism covers overlays and auto-animate covers lists without that runtime.
- **shadcn effect registries (Magic UI, Motion Primitives, Animate UI):** decorative,
  Motion-based effects exceed the continuity requirement.
- **View Transitions:** no React 19.0 wrapper; per-update wrapping alongside optimistic
  react-query writes adds coordination beyond these shared seams.

## Consequences

Consumers retain the same five documented stylesheet imports and source scanning. The
consumer-contract test must prove keyframes, utilities, token values, and reduced-motion
rules compile from those imports alone. Per-component motion hard-coding is prohibited.
Finite overlay animations should preserve visual harness end states when animations are
disabled; the conductor verifies the rendered change and visual baselines. List and drag
work remain separate issues under the same policy.

## Amended 2026-10-11 — list motion clarification (#1009)

The #994 list-motion decision includes the Task Request queue's user-driven load-more
pages. Eligible lists grow only when the user requests each page or are naturally small;
infinite and auto-loading lists are excluded. Tab, scope, source changes and their async
arrivals do not animate; same-context inserts, removals and moves retain continuity.

Task Request keys its animated boundary by tab + Managed System + rendered phase. Both
cached rows and cached empty results use `cached` until that context's active page query
first settles, then use `empty`/`rows`. Reset the settlement latch only when context changes,
including revisits, never for same-context fetching, invalidation or load-more. Removals
with rows remaining and load-more preserve the boundary and scroll; the last-row removal
renders the empty phase immediately.
