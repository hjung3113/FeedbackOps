# Entity-link management surface deferred out of MVP

## Status

Accepted 2026-08-02. References issues #292 and #280, ADR-0023, ADR-0037, and root `AGENTS.md` → Prototype Is The Spec.

## Context

Black-box testing (#292) found that an Admin can reconstruct an execution chain (`VOC → Finding → Task Request → Task`) only by opening four separate records. The product exposes no surface where an entity link's relation, visibility, active/detached state, reason, or actor history can be inspected, and no detach action exists.

ADR-0023 defines entity-link *visibility* and the summary contract; it does not define a management surface, and no prototype screen describes one. What ships today are per-record projections: Finding `연결`, VOC `Trail`, Task `Source`/`Context`. Each is correct for its own record and none of them is a link lifecycle view.

The same run (#280) found the Home `My Work` cue and the sidebar `My Work` entry rendered as a disabled placeholder pointing at `/home` (`apps/frontend/src/features/home/homeNavigation.tsx`). A personal work view needs a backend source that does not exist; the entry was left inert rather than removed.

Both are the same shape: an unimplemented capability whose absence is communicated by dead UI rather than by a decision.

## Decision

Neither an entity-link management surface nor a `My Work` view is in MVP scope.

**Entity links.** No link lifecycle view, no link history surface, and no detach action ship in MVP. Per-record projections remain the only way to read connections. A future implementation must not widen any read-scope boundary to assemble a cross-record link view — it splits the query instead, as `create_finding` does (ADR-0037) — and a detach action must require a reason and preserve history rather than deleting rows.

**My Work.** The disabled `My Work` cue is removed from Home and the sidebar rather than left inert. `My Tasks` and `My VOCs`, which are implemented, are the personal-work entry points until a dedicated view exists.

A disabled control that points at an unbuilt feature is a promise, not a state. Where a capability does not exist, the UI omits the entry; where a capability exists but the actor lacks permission, the UI renders the permission state established in #284.

## Consequences

- #292 closes as an accepted MVP exclusion rather than remaining an open UX defect.
- Home and the sidebar lose the `My Work` entry; the Home action row no longer advertises a route that cannot resolve. This is a deviation from the Home prototype and is recorded here.
- The execution chain remains readable but not manageable: an incorrect link cannot be detached through the product in MVP.
- A future slice that implements either surface starts from this ADR, not from the black-box issues, which describe symptoms rather than the boundary.
