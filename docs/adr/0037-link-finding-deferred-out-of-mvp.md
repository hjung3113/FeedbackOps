# Survey result Link Finding deferred out of MVP

## Status

Accepted 2026-07-31. Deviates from `docs/design-prototype/screen-survey-result.jsx:106` and `docs/design-prototype/screen-surveys.jsx:250-252`. References issue #252 and root `AGENTS.md` → Prototype Is The Spec.

## Context

The survey-result prototype requires a `Link Finding` CTA and routes it to the `finding-draft` follow-up flow. Nothing implements that CTA: survey-result `next_actions` ships `create_finding` and `request_task`, but not `link_finding`.

`link_finding` was silently deferred out of #187, #189, and #232 three times. The scope audit in `.review/SCOPE-AUDIT-2026-07-30.md` found the gap with no owning issue, which is why issue #252 exists. The sibling `create_finding` and `request_task` CTAs are implemented, so this is a `link_finding` gap rather than a missing CTA row.

## Decision

`link_finding` is out of MVP scope for the survey result screen. Survey-result `next_actions` ships `create_finding` and `request_task` only.

If a later slice implements `link_finding`, it must derive its own availability and permission decision as `create_finding` does; it must not copy that decision or ship unconditionally `allowed`. It must also not widen the Finding read-scope boundary to work, and must split the query instead. Issue #252 Path A defines the required shape for that future implementation.

## Consequences

- The survey-result CTA row remains one action short of the prototype until a future implementation takes up issue #252 Path A.
- Tracked documentation states the MVP actions and points to this ADR for the deferred `Link Finding` CTA.
- The prototype is unchanged and remains the spec, so readers find this ADR instead of an unexplained gap.
