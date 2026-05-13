# Cross-System Workflows

## Purpose

This document preserves the product's most important context: FeedbackOps is valuable because independent systems can be connected at the right moments.

System documents define local behavior. This document defines optional integration behavior.

## Optional Integration Patterns

```text
VOC, Survey, and Task can operate independently.
They do not require Finding, Evidence, Dashboard, or Entity Links to complete local workflows.

Common optional integration pattern:

Evidence or Source Record
→ optional Finding / Evidence Highlight
→ optional Task Request / Task link
→ optional Reporter-facing Update
→ optional Outcome Survey
→ optional Follow-up Finding / Task Request when configured
```

## Non-Negotiable Integration Rules

```text
- Survey Response must not create VOC.
- VOC and Survey can both create Finding.
- Finding can create Task Request or link execution work depending on authorization and Managed System scope.
- VOC follow-up creates Task Request, not Task directly.
- Task Done does not mean the reported problem is solved.
- Released work may create a reporter-facing status review candidate; it does not automatically resolve the VOC.
- VOC Triage State, Reporter-Facing VOC Status, and Task Status are separate state machines.
- Dashboard and Integration queues detect configured follow-up gaps, not every missing link.
- MVP uses a shared Workflow Template for all Managed Systems.
```

## Workflow Catalog

### WF-X-001: VOC To Execution

```text
VOC
→ Similar VOC Recommendation optional
→ VOC Cluster optional
→ optional Finding
→ optional Task Request
→ approved Task starts in Backlog
→ optional Released work review
→ optional Reporter-facing Status Review
→ optional Public Update
```

Required docs:

```text
- 04-voc-system.md
- 05-finding-insight-system.md
- 06-task-project-system.md
- 11-entity-linking.md
```

### WF-X-002: Survey To Execution

```text
Survey
→ Responses
→ Result Summary
→ optional Evidence Highlights
→ optional Finding
→ optional Task Request
```

Forbidden branch:

```text
Survey Response → New VOC
```

### WF-X-003: Task Release To Reporter Update

```text
Task Done
→ no automatic reporter resolution
→ Task Released
→ Public update candidate
→ Admin or same-scope Developer confirms Reporter-facing VOC Status
→ Reporter receives update
```

### WF-X-004: Milestone Outcome Validation

```text
Future workflow, not MVP core:

Milestone Released
→ Outcome Survey
→ Outcome Result
→ If poor result: Finding / Task Request
→ If positive result: validate milestone outcome
```

### WF-X-005: Home / Integration Recovery

```text
Home or Integration detects:
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently unlinked
- Finding marked actionable without Task Request or linked Task
- Released Task with unresolved Reporter-facing VOC Status
- Bad Outcome Survey without configured follow-up

User acts from Home or Integration:
→ create missing link
→ request task
→ update status
→ create follow-up
```

Finding is optional in MVP. A High Severity VOC does not require a Finding when
it already has a Task Request, linked Task, or authorized no-follow-up-needed
decision. Missing Finding is actionable only when workspace policy explicitly
requires synthesis.

## Cross-System Acceptance Criteria

### FR-X-001: Preserve Source Context

Priority: MUST

Acceptance Criteria:

```text
- A Task created from Finding shows source Finding and Evidence.
- A Finding created from VOC Cluster shows source VOCs or highlights.
- A Finding created from Survey shows source Survey Result or highlights.
- Dashboard can identify records missing links expected by workspace policy, Managed System policy, severity rules, or explicit workflow configuration.
```

### FR-X-002: Prevent Invalid Conversions

Priority: MUST

Acceptance Criteria:

```text
- UI and API do not expose create-voc from survey-response.
- Survey Response can create Finding or Evidence Highlight.
- Reporter-facing VOC Status cannot be derived blindly from Task Done.
```

### FR-X-003: Next Action Continuity

Priority: MUST

Acceptance Criteria:

```text
- VOC Detail offers Create Finding / Request Task when appropriate.
- Finding Detail offers Request Task / Link Existing Task; Create Milestone is future cross-system behavior when enabled.
- Survey Result offers Create Finding / Link Finding / Request Task.
- Home and Integration queues deep-link to the next action.
```

## Implementation Guidance For AI Agents

Before implementing any feature in one system, check whether it participates in an optional cross-system workflow here.

If it does, implement:

```text
- source link
- visibility rule
- audit log event when needed
- dashboard recovery signal when the next step is missing
```
