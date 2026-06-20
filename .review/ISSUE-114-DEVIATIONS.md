# Issue #114 Deviations

Prototype source: `docs/design-prototype/screen-entity-links.jsx`

## Intentional

- Detail panel actions from the prototype are not implemented. This slice is a read-only audit inventory; detach and refresh mutations are out of scope.
- Bulk action bar from the prototype is not implemented. The checkbox column is visual-only per the issue scope.
- Relation type filter only exposes `related_to`. Other prototype relation types are mock/future vocabulary, not production-supported in Slice 4.3.
- Managed System pills render real names when the registry query resolves them, but no colored mark is synthesized in this feature. The production API has no mark/color field, and there is no second Integration consumer that justifies promoting a shared scope-mark helper.
- Hidden rows render a compact permission-limited badge instead of endpoint summaries. Backend hidden DTOs intentionally omit source_id and target_id.
