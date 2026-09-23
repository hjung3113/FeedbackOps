# Next Actions

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Next Action Contract

Backend responses for work-object detail and queue rows must provide
permission-filtered `next_actions` when an object has actionable workflow steps.
The frontend renders and invokes these actions; it must not infer action
eligibility from status fields, Role Level labels, or linked-object presence.

`next_actions` are derived by application services from permissions, Managed
System scope, workflow state, reporter-facing status, linked entities, policy
configuration, default owner/reviewer rules, and special capabilities such as
Task Request self-approval.

Survey Result and Survey Response endpoints use the same `next_actions`
contract for follow-up actions. Poor outcome recommendations must be returned as
API-provided priority or `recommended_action_id`, not inferred by the frontend
from score thresholds alone. Recommendation reasons must use domain-safe summary
text and must not expose hidden response detail.

Survey Results returns permission-filtered `next_actions`: `create_finding` is
always present. `request_task` for Findings derived from Survey Responses is deferred to issue #239.

`attach_evidence_to_existing_voc` may be returned only when eligible target VOCs
exist in the actor's effective Managed System scope, the actor may see
summary-visible VOC context, Survey evidence attachment is policy-allowed, and
anonymous or identity-protected response data can be represented with safe
summary fields. The action must not offer a create-new-VOC fallback.
Linked surfaces must not receive raw anonymous or identity-protected Survey
response text or respondent identity unless the actor has explicit personal
response viewing permission for the Survey source route.
Survey safe summaries for linked surfaces are produced by backend application
services using deterministic templates, aggregate counts, configured labels,
score bands, selected tags, and redacted approved highlight excerpts. LLM output
must not be the default mechanism for enforcing anonymity or permission-safe
summaries.
Safe summaries may be localized to workspace default language or viewer UI
locale, but raw free-text responses and approved excerpts remain in source
language unless a later assistive translation draft is explicitly requested.
Survey result filters must enforce the configured anonymity threshold, default
5 responses, by hiding aggregates or merging buckets for actors without personal
response viewing permission. Workspace Admin does not bypass the threshold
without explicit personal response viewing permission.
Free-text Evidence Highlights require user selection or approval before they
are attached to another object. Automatic candidates may be returned only as
draft suggestions and must pass redaction and permission checks first.
When Survey evidence is attached to a Closed VOC, the attachment must not
automatically reopen the VOC or change reporter_facing_status. If communication
may be needed, the response should include `review_reporter_status` or
`write_public_update` as follow-up `next_actions`.
Survey evidence attachment to an existing VOC must not resolve poor Outcome
Survey follow-up recovery by itself; resolution requires Finding, Task Request,
linked execution work, or an explicit no-follow-up-needed decision.
No-follow-up-needed actions require Admin or same Managed System Developer
workflow capability, a non-empty reason, managed_system_id, source object,
previous recovery state, and affected recovery item ids. Reversal uses a
separate audited reopen-follow-up action that supersedes the decision and
triggers recovery item re-evaluation.
Undoing Survey evidence attachment detaches or revokes the entity_link through a
separate audited action. It must not hard-delete the Evidence Highlight or erase
canonical link history.

Common VOC `next_actions` include:

```text
assign_owner
request_reporter_info
write_public_update
create_finding
request_task
mark_no_follow_up
review_reporter_status
```

Each action item should include an action id, label, target endpoint or route
intent, disabled or blocked reason when applicable, and confirmation metadata
for irreversible or audit-sensitive actions.

Audit-sensitive actions must include backend-provided confirmation metadata.
This includes reporter-facing status changes, Public Update send actions,
Permission Request approval or rejection, Task Request approval, and protected
Survey evidence attachment to VOC. Clients must render the provided confirmation
title, body, risk level, required reason flags, and audit event intent instead
of inventing generic confirmation copy.

Action visibility states:

```text
available: actor can execute the action now.
blocked_requestable: actor cannot execute now, but may request permission or missing prerequisites.
blocked_not_requestable: actor may know the action exists, but cannot request or execute it in the current context.
hidden: actor must not know the action exists for this object.
```

The backend decides the visibility state. The frontend must not downgrade
`hidden` into a disabled control or upgrade blocked actions into visible
permission requests without an API-provided state and reason.

When an action is `blocked_requestable`, the response must include the allowed
permission request scope candidates or prerequisite request intent. Clients must
submit one of those candidates and must not synthesize broader scopes.

Failed `next_actions` executions must return a structured action failure
payload, not only a generic error. Include `action_id`, `failure_code`,
domain-safe message, `retryable`, requestable permission candidates when
applicable, and `current_object_version` when stale state caused the failure.
Use `action_no_longer_available` when workflow state changed and
`recovery_item_resolved` when the underlying recovery item was already resolved.
Resolved recovery item responses should include resolution metadata such as
`resolved_by_action_id`, `resolved_at`, `resolution_source_type`,
`resolution_source_id`, and `resolved_by_actor_id` when actor visibility allows.
When actor identity is not visible, return a safe actor label or omit the actor.
