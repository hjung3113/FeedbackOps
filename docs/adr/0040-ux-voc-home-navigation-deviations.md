# UX VOC and Home navigation deviations

## Status

Accepted 2026-08-02. Records approved deviations D3 (#280) and D6 (#306) from `docs/design-prototype/screen-home.jsx` and `docs/design-prototype/screen-voc.jsx`. D6 follows ADR-0022.

## Context

The Home prototype contains a `My work` queue with an `Open My Work` action, and the sidebar carries a `My Work` entry. Issue #280 was filed and triaged on the belief that the whole surface was an inert placeholder.

Measurement showed that was only half true. The sidebar entry (`homeNavigation.tsx:31`) was a `disabled: true` placeholder pointing back at `/home`, and the panel's `Open My Work` action rendered disabled — both promised a My Work screen that has no dedicated backend source and stays deferred. But the panel's rows were live: it queried assigned Tasks (`GET /tasks?assignee=`) and pending Task Requests (`GET /task-requests?status=pending_review`) and linked each row to a real Task or Task Request route.

The Inbox prototype contains five tabs. Production accepts the canonical `high-no-link` VOC query tab (`packages/shared/src/vocs/list-query.ts:35`), and Home action queues already deep-link to it. Without a corresponding toolbar tab, the correctly filtered URL has no visible selected state.

## Decision

1. Remove only the dead My Work affordances: the disabled sidebar entry and the disabled `Open My Work` action. The panel and its live rows stay, retitled `Assigned to you` so the heading describes what the panel actually shows instead of naming a screen that does not exist. `apps/frontend/src/features/my-work/` remains the future implementation location.

   Deleting the panel would have removed working information from Home — assigned Tasks and pending Task Requests appear nowhere else on that screen. The principle behind D3 is that an entry point must not promise a destination that does not exist; it is not that live data should be withdrawn.

2. Add `High · no link` as the sixth Inbox tab, with value `high-no-link`, and make it URL-selectable. This is the approved deviation from the prototype tab list, following ADR-0022's URL-backed toolbar-tab precedent. The prototype's `VOC_TABS` in `screen-voc.jsx` carries the same sixth chip so the two do not drift.

## Consequences

- Home keeps its assigned-work rows and loses only the promise of a My Work destination.
- `/tasks?view=my` is deliberately not linked anywhere: that route currently aliases the unfiltered backlog rather than a My Tasks view, so linking it would move the same defect instead of fixing it.
- A shared canonical URL and the Inbox toolbar now express the same high-severity-without-link queue.
- No other prototype deviations are introduced by D3 or D6.
