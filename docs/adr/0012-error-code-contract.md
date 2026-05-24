# API error code contract

`docs/implementation/01-coding-conventions.md` requires that API errors use **stable codes**, that validation errors **identify field paths**, and that permission errors **include a requestable permission when safe**. This ADR locks the shape so backend handlers, the frontend `apiClient`, and i18n catalogs can all rely on one structure.

## Response envelope

Every non-2xx response carries this body:

```jsonc
{
  "code": "permission.denied",
  "message": "Internal English message — frontend may ignore, primarily for logs.",
  "detail": { /* code-specific, optional */ },
  "requestable_permission": { /* present only when code permits, see below */ }
}
```

- `code` — stable, dotted, lowercase. Lives in `packages/shared/src/errors/codes.ts` as a Zod enum. Both backend and frontend import it; adding a new code is a single PR that updates the enum and the i18n catalog together.
- `message` — internal English string for logs, audit summary lines, and developer-facing error overlays. Frontend uses the `code` for user-visible copy via i18next, **not** this string.
- `detail` — code-specific structured payload. Schema for each `code` is defined alongside the enum so the frontend can narrow types.
- `requestable_permission` — present only on permission-family errors when surfacing it is safe (see "Permission errors" below).

HTTP status comes from a table mapping `code` family → status:

```text
auth.*            → 401
permission.*      → 403
not_found.*       → 404
conflict.*        → 409
validation.*      → 422
rate_limited.*    → 429
internal.*        → 500
upstream.*        → 502 / 503 / 504
```

A non-error 4xx with no domain meaning (e.g. malformed JSON before the handler runs) maps to `validation.malformed_request` rather than a bare 400.

**ADR-0019 Section A adds `conflict.record_archived` to the closed enum (review S-003).**

**Slice 3 #13 adds five codes to the closed enum:**
- `voc.severity_not_user_settable` (422) — request body contained `severity`; severity is set during triage only.
- `validation.unexpected_field` (422) — request body contained a forbidden server-resolved field (`reporter_id`, `reporter_facing_status`, `triage_state`, `owner_user_id`, `owner_team_id`, `display_id`). `detail.fields` carries the offending path.
- `rich_content.disallowed_node` (422) — sanitizer rejected a node, mark, structural shape, or leaf-node content outside the per-surface allowlist.
- `rich_content.external_image_forbidden` (422) — sanitizer rejected an `image` node (Slice 3 prohibits external images on every surface).
- `attachment.unsupported_pending_storage_slice` (422) — request supplied non-empty `attachments[]`; the attachment upload endpoint ships in a later slice (#22).

**Issue #43 / F-ADR-0012-ATTR-CODE promotes sanitizer attr failures to first-class codes:**
- `rich_content.disallowed_attr` (422) — sanitizer rejected an unknown attr key on an otherwise-allowed node or mark. `detail.fields[].code` remains `disallowed_attr_key`, and the sanitizer hint carries the attr path.
- `rich_content.invalid_attr_value` (422) — sanitizer rejected a present attr whose value failed its schema, including invalid URL scheme, invalid UUID, over-length string, or URL credentials. `detail.fields[].code` remains `invalid_attr_value`.
- `rich_content.missing_required_attr` (422) — sanitizer rejected an otherwise-allowed node or mark because a required attr was absent. `detail.fields[].code` is `missing_required_attr`.

**Slice 3 #16 adds two codes to the closed enum:**
- `reporter_facing_status.invalid_transition` (422) — the requested `next_reporter_facing_status` is not reachable from the current status per the `reporter_facing_status_transitions` seed table. `detail.reason` carries the human-readable gate text.
- `reporter_facing_status.gate_blocked` (422) — a linked-task gate prevents the transition. Reserved in Slice 3; emitted in Slice 6 when `evaluateReporterStatusGate` returns a block result.

**Slice 3 #17 adds one code to the closed enum:**
- `conflict.triage_already_committed` (409) — `PATCH /vocs/:id/description` was attempted on a VOC whose `triage_state` is not `untriaged`. Only the Reporter may edit the description, and only while the VOC is still pre-triage. `detail.current_triage_state` carries the VOC's current `triage_state` value so the client can display a contextual message.

**Slice 3 #13 also extends the inner `detail.fields[].code` enum:**
- `unexpected_field` — paired with `validation.unexpected_field` / `voc.severity_not_user_settable` when a server-resolved field appears in the request body.
- `parent_archived` — paired with `conflict.parent_archived` when the referenced parent (MS or AA) is archived; carries the offending field path so the frontend can bind the message to the picker input.
- `external_image_forbidden` and `disallowed_node` — paired with the rich-content sanitizer rejections (Slice 3 #13 — `rich_content.*`).
- `disallowed_attr_key`, `invalid_attr_value`, and `missing_required_attr` — paired with rich-content attr sanitizer rejections (Issue #43 — `rich_content.disallowed_attr`, `rich_content.invalid_attr_value`, `rich_content.missing_required_attr`).
- `unsupported` — paired with `attachment.unsupported_pending_storage_slice` (Slice 3 #13 — `attachment.*`).

**Issue #26 extends the same `detail.fields` contract to Managed Systems and Analytics Areas:**
- `invalid_slug_format` — paired with slug-pattern validation on MS/AA create; error details never expose raw regex sources.
- `duplicate_slug` — paired with `conflict.duplicate_slug` on MS/AA create so create forms can bind the conflict to `slug`.
- `immutable_field`, `mutually_exclusive`, `record_archived`, and `idempotency_key_reuse` — paired with the corresponding MS/AA 422/409 guards.

## Code naming

`<subject>.<verb-or-state>` lowercase dotted. Subjects align with `subject_type` in `core.audit_log` so audit rows can carry the same identifier:

```text
auth.session_required
auth.session_expired
permission.denied
permission.scope_required
permission.sensitive_reason_required
voc.managed_system_required
voc.severity_not_user_settable
voc.cannot_edit_after_triage
task_request.self_approval_requires_reason
task_request.scope_mismatch
attachment.too_large
attachment.unsupported_type
rich_content.external_image_forbidden
rich_content.disallowed_node
rich_content.disallowed_attr
rich_content.invalid_attr_value
rich_content.missing_required_attr
entity_link.cross_workspace_forbidden
entity_link.relation_type_unknown
reporter_facing_status.invalid_transition
validation.failed
validation.malformed_request
not_found.record
conflict.stale_write
rate_limited.actor
internal.unexpected
upstream.idp_unavailable
upstream.storage_unavailable
```

The complete list lives in code, not in this ADR; this is the shape it must follow.

## Validation errors

`code = 'validation.failed'` carries field-path detail so the frontend can attach messages to specific form inputs:

```jsonc
{
  "code": "validation.failed",
  "message": "Validation failed for create_voc",
  "detail": {
    "fields": [
      { "path": ["title"],             "code": "required",        "message": "title is required" },
      { "path": ["description", "body"], "code": "max_length",    "message": "description body exceeds 10000 characters" },
      { "path": ["analytics_area_id"], "code": "out_of_scope",    "message": "Analytics Area must belong to the selected Managed System" }
    ]
  }
}
```

`path` is a string array matching the Zod schema path in `packages/shared`. `code` is a smaller, validation-only enum (`required | invalid_type | invalid_format | min_length | max_length | min_value | max_value | unknown_enum | out_of_scope | custom`, plus domain-specific stable codes listed above). React Hook Form maps `path.join('.')` to its field state.

RFC 7807 Problem Details was rejected because it has no native `code` field, no native validation-fields shape, and would have us inventing custom `urn:` types to recover what we already get from a domain-named code.

## Permission errors

When the backend can safely tell the Actor what permission would unblock the action, the response includes:

```jsonc
{
  "code": "permission.denied",
  "message": "...",
  "requestable_permission": {
    "permission": "managed_system.developer",
    "managed_system_id": "uuid-here",
    "reason_required": true
  }
}
```

The presence of `requestable_permission` is **conditional**. We include it when:

- The denial is due to missing **Managed System Permission Scope** that the Actor could legitimately request.
- Surfacing the permission name and target does not leak the existence of a resource the Actor should not know about.

We omit it when:

- The denial relates to a **Sensitive Permission** whose existence is itself privileged (e.g. specific Internal Comment visibility).
- The Actor is asking about a record that should appear as "not found" rather than "denied" (record existence is itself the secret).

This mirrors `docs/design/11-entity-linking.md`: "Linked-object UI visibility is backend-decided as allowed, hidden, summary_visible, request_access, or denied." Frontend renders a "Request access" affordance only when `requestable_permission` is present.

## Audit alignment

Domain errors that happen during an audited action emit an audit row with `event_type = '<subject>.error'` and `detail.error_code = <code>` so failed Sensitive Permission attempts and rejected mutations are queryable from the same surface as successful actions.

## What this ADR locks

- One envelope shape across the entire API.
- `code` enum lives in `packages/shared` and is imported by both apps; adding a code is a single PR touching enum, i18n catalog, and (for permission codes) the requestable-permission table.
- `detail.fields` is the only validation error shape.
- `requestable_permission` is conditional, never automatic.

## Reopening

Switching to RFC 7807, restructuring the validation shape, or making `requestable_permission` mandatory each warrants a new ADR with a migration plan for existing handlers and frontend error pipelines.
