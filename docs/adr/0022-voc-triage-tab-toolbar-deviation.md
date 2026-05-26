# VOC Triage console toolbar: tab strip + URL tab param (intentional deviation from prototype search/filter/skip)

## Status

Accepted 2026-05-26. Deviates from `docs/design-prototype/screen-voc-create.jsx` `TriageScreen` toolbar (Pack 17 prototype). References ADR-0020 (shell taxonomy / 50px header rhythm).

## Context

The VOC Triage console (`apps/frontend/src/features/voc/components/triage/*`, route `TriageRoute.tsx`) is a near-1:1 production port of the prototype `TriageScreen` (`screen-voc-create.jsx:589-733`) — queue rows, the read+pick detail panel, optimistic mutation, and the undo toast all mirror the prototype faithfully.

The **toolbar** is the one place the implementation diverges from the prototype. The prototype toolbar (`screen-voc-create.jsx:646-663`) is:

- `ShellTitle` — flag icon + "Triage queue" + `{liveQueue.length} VOC` outline badge + sort hint ("정렬: 미배정 → severity") + an emerald "· N건 처리됨" processed-count.
- a spacer,
- a `SearchInput` ("VOC 검색…"),
- a `Filter` ghost button,
- a "Skip to unassigned" secondary button.

The shipped implementation replaced the search/filter/skip cluster with a **4-tab strip** (`미배정` / `미트리아지` / `높은 심각도` / `보류`) backed by a URL `tab` param, and (until this issue) dropped the processed-count.

Per root `AGENTS.md` ("Layout … come from prototype. Deviations require an explicit ADR or a user OK"), this divergence needs to be recorded rather than silently kept. The user reviewed the divergence and approved keeping the tab strip as a deliberate built feature; issue #90 captures the reconciliation.

## Decision

1. **Keep the 4-tab strip + URL `tab` param.** It is a deliberate, shipped feature, not an accidental reinvention. A queue-triage workflow benefits from saved-state, shareable, restorable view filtering: the operator slices the queue by the axis they are working (unassigned backlog, untriaged intake, high-severity escalations, postponed items) and the URL `tab` param makes that selection bookmarkable and restore-on-reload — behaviour the prototype's transient `SearchInput` + `Filter` controls do not provide. The tab strip occupies the toolbar's right cluster where the prototype placed search/filter/skip.

2. **Restore the processed-count indicator.** The prototype's "· N건 처리됨" emerald progress text (`screen-voc-create.jsx:652-656`) is re-added to the toolbar after the sort hint, toned with the `--text-success` (emerald) semantic token, and derived from the route-local triage queue reducer (`useTriageQueue` `optimisticallyRemoved.size` — the count of VOCs triaged/skipped this session). There is no live server-side per-session processed count; the session-local derivation matches the prototype's `Object.keys(triagedIds).length` source exactly.

3. **Preserve the 50px inner-toolbar rhythm.** The tab-strip toolbar keeps the `h-[50px]` route-internal toolbar height required by ADR-0020 §2 (and the §Amendment rule for `WorkbenchShell`-toolbar-omitted routes that express identity via an inline kicker — which Triage does). The deviation is purely in the toolbar's *content* cluster, not its geometry.

## Consequences

- **Preserved:** route identity kicker ("Console · Triage"), flag icon + "Triage queue" title, `{N} VOC` badge, sort hint, the 50px rhythm, and — newly re-added — the "N건 처리됨" processed-count.
- **Dropped (vs prototype), with follow-up disposition:**
  - `SearchInput` ("VOC 검색…") — free-text queue search is not yet wired. Should become a follow-up issue if operators need to find a specific VOC inside a long queue; the tab strip does not replace text search.
  - `Filter` button — superseded by the tab strip for the common slicing axes; a generic multi-facet filter is a future enhancement, follow-up issue if richer faceting is requested.
  - "Skip to unassigned" — a one-shot jump button; partially subsumed by the `미배정` (unassigned) tab, which is the durable equivalent of "skip to unassigned". No separate follow-up unless a within-queue jump affordance is requested.
- **Pixel-diff treatment:** in the page-level pixel-diff report, the toolbar right-cluster difference (tab strip vs search/filter/skip) is recorded with Resolution `intentional-per-ADR-0022` and is NOT a HIGH merge blocker. The processed-count region, once shipped, must match the prototype copy "N건 처리됨" verbatim.

## Reopen triggers

Operators requesting free-text VOC search, multi-facet filtering beyond the four tabs, or an explicit "skip to unassigned" jump distinct from the unassigned tab each warrant revisiting this decision (and likely a follow-up issue rather than an ADR amendment, since the shell contract is unchanged).

## Related

- ADR-0020 (Shell taxonomy + 50px header rhythm; §Amendment — `WorkbenchShell` optional toolbar / inline kicker). The Triage toolbar honours the 50px rhythm and the kicker pattern.
- ADR-0021 (Pack 17 Samsung-light design system — semantic token contract; processed-count uses `--text-success`).
- `docs/design-prototype/screen-voc-create.jsx` `TriageScreen` (L589-733) — the prototype toolbar this deviates from.
- Issue #90 (toolbar reconciliation) — the reconciliation that produced this ADR.
