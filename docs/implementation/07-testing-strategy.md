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
- Product Area archive preserves historical links.
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
- CommandMenu action parity tests
- status badge family separation tests
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

