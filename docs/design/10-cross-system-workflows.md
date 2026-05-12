# Cross-System Workflows

## Purpose

This document preserves the product's most important context: FeedbackOps is valuable because independent systems can be connected at the right moments.

System documents define local behavior. This document defines end-to-end behavior.

## Canonical Flow

```text
Evidence
→ Finding
→ Task Request
→ Task / Milestone
→ Reporter-facing Update
→ Outcome Survey
→ Follow-up Finding / Task Request when needed
```

## Non-Negotiable Flow Rules

```text
- Survey Response must not create VOC.
- VOC and Survey can both create Finding.
- Finding can create Task Request, Task, or Milestone depending on authorization and scope.
- Task Done does not mean customer problem is solved.
- Released work should trigger reporter-facing status review and optional Outcome Survey.
- Dashboard must detect broken or missing links in these flows.
```

## Workflow Catalog

### WF-X-001: VOC To Execution

```text
VOC
→ Similar VOC Recommendation optional
→ VOC Cluster optional
→ Finding
→ Task Request
→ Task
→ Released
→ Reporter-facing Status Review
→ Public Update
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
→ Evidence Highlights
→ Finding
→ Task Request / Task / Milestone
```

Forbidden branch:

```text
Survey Response → New VOC
```

### WF-X-003: Task Release To Customer Update

```text
Task Done
→ no automatic reporter resolution
→ Task Released
→ Public update candidate
→ Manager confirms Reporter-facing VOC Status
→ Reporter receives update
```

### WF-X-004: Milestone Outcome Validation

```text
Milestone Released
→ Outcome Survey
→ Outcome Result
→ If poor result: Finding / Task Request
→ If positive result: validate milestone outcome
```

### WF-X-005: Action Dashboard Recovery

```text
Dashboard detects:
- High Severity VOC without Finding
- Finding without Task Request
- Released Task with unresolved Reporter-facing VOC Status
- Bad Outcome Survey without Follow-up Task

User acts from dashboard:
→ create missing link
→ request task
→ update status
→ create follow-up
```

## Cross-System Acceptance Criteria

### FR-X-001: Preserve Source Context

Priority: MUST

Acceptance Criteria:

```text
- A Task created from Finding shows source Finding and Evidence.
- A Finding created from VOC Cluster shows source VOCs or highlights.
- A Finding created from Survey shows source Survey Result or highlights.
- Dashboard can identify unlinked but important records.
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
- Finding Detail offers Request Task / Create Task / Create Milestone.
- Survey Result offers Create Finding / Link Finding / Request Task.
- Dashboard queues deep-link to the next action.
```

## Implementation Guidance For AI Agents

Before implementing any feature in one system, check whether it participates in a cross-system workflow here.

If it does, implement:

```text
- source link
- visibility rule
- audit log event when needed
- dashboard recovery signal when the next step is missing
```
