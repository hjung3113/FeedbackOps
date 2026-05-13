# Testing Strategy

## Purpose

Testing must protect the product invariants that are hardest to repair later.

## Required Invariant Tests

```text
- Survey Response cannot create VOC through UI or API.
- generated_voc relation_type is rejected.
- Task Done does not automatically set reporter-facing VOC status to 해결됨.
- Released Task creates review candidate, not automatic public resolution.
- Explicit Deny overrides general Allow.
- summary_visible exposes only the approved summary contract.
- internal_only links are hidden from Reporter.
- Cross-workspace entity links are rejected.
- Managed System scope blocks sibling Managed System access.
- Analytics Area belongs to one Managed System and does not grant permissions.
- Analytics Area archive preserves historical links.
- VOC create requires managed_system_id and rejects reporter-submitted severity.
- VOC analytics_area_id must belong to the selected Managed System.
- Reporter cannot edit VOC title, description, or attachments after triage begins.
- Reporter Reply, Public Update, and Internal Comment remain separate communication types.
- Rich content rejects base64 inline body images and external inline image rendering.
- General user navigation shows Submit VOC, My VOCs, and assigned Surveys only.
- Developer navigation shows My Work, Tasks, and Managed System-scoped work only for assigned or scoped Managed Systems.
- Triage queues exclude Managed Systems outside effective Managed System scope.
- managed_system_id=all returns only the actor's effective Managed System scope union unless the actor is Admin.
- Direct route access renders blocked/request-access state instead of leaking hidden nav content.
```

## Backend Tests

```text
- application service transaction tests
- permission policy tests
- entity link provider tests
- API validation and error code tests
- audit event tests for sensitive decisions
- dashboard missing-link query tests
```

## Frontend Tests

```text
- route restore and selected detail panel tests
- permission blocked panel tests
- cross-system creation pending/error tests
- PublicUpdateComposer separation tests
- ReporterReplyComposer and InternalCommentComposer visibility tests
- CommandMenu action parity tests
- status badge family separation tests
- Navigation renders from backend permission contract
- ManagedSystemScopeSwitcher filters lists and preserves URL state
- CommandMenu excludes or disables actions according to backend permission state
```

## Integration Slices

```text
Slice 1: VOC inbox routing
- filters
- selected detail panel
- refresh restore
- mobile drill-in
- empty/loading/error states

Slice 2: VOC -> Finding -> Task Request
- source preview
- inline create
- entity link creation
- pending state
- rollback/retry
- dashboard queue removal

Slice 3: Permission blocked -> request -> admin decision
- blocked panel
- required reason
- pending state
- rejection copy
- approval return path
- explicit deny override

Slice 4: Dashboard recovery
- each row explains reason
- opens correct next action
- respects permissions
- refreshes after repair

Slice 5: Survey result -> Finding, never VOC
- no create-VOC UI/API path
- hidden personal responses render safely
- evidence highlight preserves source
```

## Screenshot QA

Frontend implementation should verify:

```text
- desktop, tablet, and mobile layouts
- selected row and detail panel visibility
- focus-visible states
- dark mode contrast
- permission blocked states
- loading and error states
```
