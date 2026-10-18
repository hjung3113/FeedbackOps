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
→ Follow-up Finding for a poor Outcome Survey response (ADR-0055), then optional Task Request
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
→ Similar VOC Recommendation / VOC Cluster Suggestion optional
→ authorized human confirmation creates VOC Cluster optional
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
- Poor Outcome Survey response without a follow-up decision (ADR-0055)

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
- Survey Result offers Create Finding / Request Task; Link Finding is deferred out of MVP scope (ADR-0037).
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

## Close-out routing and recovery (ADR-0067; backend G/H and UI I implemented)

VOC, every Finding source, all three Task Request sources, and approved-request Task
conversion resolve source-owned responsibility atomically with links/audit/idempotency.
Automatic routing failure preserves intake in the existing scoped unassigned queue;
assignment does not complete triage/review or grant access.

Source/link repairs notify the injected Dashboard transition recorder in the same
transaction; shared identity/history remains a projection of source predicates. Personal
hiding cannot repair a gap. Outcome response decisions/presentation/history remain
Survey-owned under ADR-0055's personal seam. Home uses only currently actionable items,
Integration owns the compact shared UI, and source actions retain their owning routes.

## Analytics Area operational report (ADR-0069; implemented #1077–#1079)

Coverage's accepted `Analytics Area별 현황` tab opens exact source lists for operational attention;
FR-DASH-002 in `08-dashboard-system.md` defines the metrics. Optional classification and links stay
optional. Attribute each object to its own current Area; cross-Area links do not duplicate counts.
Task Request review stays Managed System-wide. Survey report follow-up counts each qualifying closed
Outcome Survey once via the Survey-owned safe signal, while individual response decisions and personal
review stay governed by ADR-0055. All source jumps recheck permissions; source actions update the same
canonical gap resolution consumed by Home/Integration, without report-specific lifecycle state.

## Survey evidence continuity (ADR-0064)

WF-X-002 preserves response identity privately and canonical internal-only links;
ordinary link Managed System equality has an explicit Survey command exception
with independent source/target authorization inside one workspace. Survey-derived
Finding/generated Task Request source defaults contain metadata only. Approved
text flows through fresh exact-active-approval/source/target reads, so withdrawal
works across the system-generated surfaces. Authored downstream text is not erased.

#816 attaches result-visible approved excerpts to an existing Finding
without a personal grant, requiring source Survey read/suppression and target
`finding.manage`; it writes `evidence_of`, never `generated_finding`. Consequently
attachment does not resolve an Outcome follow-up gap (ADR-0055). Existing personal
create-Finding and no-direct-response→Task Request rules remain unchanged.
Integration Evidence consumes safe DTOs, never raw link/audit/private binding joins.
Implemented by the coordinated #739/#740 cutover and #816.

## Close-out assistance boundary (ADR-0068; implemented #1097/#1099)

Cluster suggestions and source-less draft preview are optional assistance, not
required workflow steps or execution evidence. Suggestions are not Entity Link
endpoints or inputs to Finding, Task Request, bulk Public Update, coverage or
recovery. Only a human-created Cluster can use the existing downstream commands.
Preview permits navigation only and creates no VOC/relationship/decision; VOC
submission and saved embedding enqueue remain independent of preview availability.
