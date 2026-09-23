# Navigation

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Navigation Count Contract

`GET /nav/counts`

- Authenticated, workspace-scoped read endpoint returning `{ counts: Record<string, integer> }`.
- Optional `managed_system_id` is a UUID and narrows each emitted count through the same
  predicate and resolved read scope as its backing list route. Invalid values return
  `validation.failed` (422).
- Currently emitted keys are `voc.inbox`, `voc.triage`, `voc.my`, `voc.tab.high`,
  `voc.tab.unassigned`, `voc.tab.no-link`, `voc.clusters`, `findings.all`, and
  `surveys.all`. The VOC keys use the shared VOC list predicate; the other keys
  call their owning list read services. A key is absent only when it has no backing
  list filter or when scope resolution returns the expected `permission.denied` or
  `permission.scope_required` authorization outcome. An absent key is not zero and
  may be permission-shaped; any unexpected failure propagates as an error response
  rather than omitting the key.
- `voc.tab.similar` is deliberately absent because that list tab has no backing query.
- A key without a backing list filter is omitted rather than represented by a synthetic zero.
- Read-only endpoint: no audit event, entity-link mutation, or dashboard queue side effect.
