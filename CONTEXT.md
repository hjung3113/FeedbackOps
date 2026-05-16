# FeedbackOps Domain Context

FeedbackOps is an internal AD-gated operating system for connecting submitted VOC, survey results, findings, execution work, and outcome validation without forcing every record through one rigid workflow.

## Language

**Workspace**:
The outermost tenant boundary in FeedbackOps. Every domain record belongs to exactly one **Workspace**, and no cross-**Workspace** links exist in MVP.
_Avoid_: Tenant, Organization, Account, Instance

**Actor**:
An AD-authenticated internal person whose permissions are evaluated inside a workspace.
_Avoid_: External user, anonymous user

**Role Level**:
The hierarchical authority level assigned to an **Actor**: Admin, Developer, or User.
_Avoid_: Persona, reporter, managed system

**Admin**:
The highest **Role Level**, allowed to manage FeedbackOps settings, permissions, and operating policy.
_Avoid_: Customer, account, reporter

**Developer**:
The middle **Role Level**, allowed to investigate or execute improvement work within granted **Managed System Permission Scopes**.
_Avoid_: Customer, contact, reporter

**User**:
The lowest **Role Level**, allowed to submit VOC and access their own allowed work.
_Avoid_: Customer, contact, reporter

**Reporter**:
The **Actor** who submitted a specific **VOC**.
_Avoid_: Customer contact, account, role

**VOC**:
A voice item directly submitted by an internal **Actor** to capture customer or user feedback, complaints, requests, questions, or praise.
_Avoid_: Survey response, task, finding

**Finding**:
An evidence-based judgment object that summarizes a problem, pattern, or execution candidate for one **Managed System**.
_Avoid_: Task, survey result, VOC

**Task Request**:
A reviewed execution candidate for one **Managed System**.
_Avoid_: Task, VOC follow-up note

**Task Request Review**:
The decision to approve, reject, request more evidence for, convert, or link a **Task Request**.
_Avoid_: Admin-only approval, automatic task creation

**Task Request Self-Approval**:
A **Sensitive Permission** allowing a **Developer** to approve a **Task Request** they created within the same **Managed System Permission Scope**.
_Avoid_: default developer approval, unaudited shortcut

**Permission Request**:
A request to grant or modify an **Actor**'s **Managed System Permission Scope** or **Role Level**. Decided by an **Admin**; all decisions are audited.
_Avoid_: Access ticket, permission grant, role change request

**Sensitive Permission**:
A permission whose grant or use requires a written reason and explicit audit metadata, not granted by default. Includes **Task Request Self-Approval**.
_Avoid_: Restricted action, locked feature

**Task**:
Internal execution work for one **Managed System**.
_Avoid_: Reporter-facing VOC status

**My Work**:
An actor-centered queue that gathers assigned VOC triage work, Task Requests, Tasks, Surveys, and review actions.
_Avoid_: Domain owner, task board

**Survey**:
A structured question set for one **Managed System**.
_Avoid_: VOC, task

**Managed System**:
An internal company system that FeedbackOps tracks feedback and improvement work for.
_Avoid_: Customer system, external service

**Managed System Registry**:
The workspace-managed list of **Managed Systems** and their defaults.
_Avoid_: Project registry, customer registry

**Analytics Program**:
A concrete example of a **Managed System**, such as Tableau, Power BI, or Looker.
_Avoid_: Customer, project, analytics area

**Analytics Area**:
A managed analytical menu, report group, or business analysis area inside one **Managed System**.
_Avoid_: Managed system, app route, code module, permission boundary

**Work Initiative**:
A larger improvement effort that may group tasks or milestones after triage.
_Avoid_: Managed system, analytics area, project

**Managed System Permission Scope**:
An authorization boundary granting an **Actor** access to work for one **Managed System**.
_Avoid_: Project scope, analytics-area permission

**Primary Managed System**:
The single **Managed System** that owns the scope, permissions, defaults, and dashboard grouping for a record.
_Avoid_: Multi-system ownership

**Default Owner**:
The **Actor** or team prefilled as responsible for a **Managed System** when a new **VOC** is created.
_Avoid_: Final assignee, triage decision

**VOC Source Context**:
The situation in which a VOC was submitted, such as direct use, proxy registration from a user report, or operational discovery.
_Avoid_: Reporter role, customer type

**Direct Use**:
A **VOC Source Context** where the **Reporter** experienced the issue while using the **Managed System**.
_Avoid_: Proxy report

**Proxy Report**:
A **VOC Source Context** where the **Reporter** registers feedback on behalf of another internal user.
_Avoid_: Reporter identity

**Operational Discovery**:
A **VOC Source Context** where the feedback is discovered through operations, monitoring, or investigation.
_Avoid_: Direct use

**Stakeholder Request**:
A **VOC Source Context** where feedback originates from a meeting, request thread, or planning discussion.
_Avoid_: Survey response

**Reporter Summary**:
A limited, public-safe summary of linked work shown to the **Reporter** of a **VOC**.
_Avoid_: Task detail, finding detail, internal comment

**Public Update**:
A reporter-visible message about VOC progress or resolution.
_Avoid_: Internal comment, developer note

**Internal Comment**:
A private operational note for Admins and scoped Developers working on VOC or execution work.
_Avoid_: Public update, reporter message

**Reporter Reply**:
A reporter-authored message or attachment added to the public VOC conversation.
_Avoid_: Internal comment, public update

**Rich Content Editor**:
An intuitive WYSIWYG editor for VOC descriptions, public conversations, and internal notes that supports images, tables, and pasted content without requiring users to write Markdown or HTML.
_Avoid_: Markdown-only input, raw HTML input, plain textarea for rich VOC detail

**Inline Attachment**:
An uploaded file, usually an image, displayed inside rich content while being stored and governed as an attachment.
_Avoid_: Base64 body image, raw external URL

**Rich Table**:
A table embedded inside rich content as structured editor content.
_Avoid_: Screenshot table, spreadsheet attachment

**VOC Triage State**:
The internal operational state used to process and classify a **VOC**.
_Avoid_: Reporter-facing status, task status

**Severity**:
The operational impact level assigned to a **VOC** during triage. Describes how serious the problem is, not the order in which work is done. Canonical enum in `docs/design/15-data-contracts.md`, locked by ADR-0004.
_Avoid_: Priority, urgency, P0/P1, user-submitted urgency, reporter emotion

**Priority**:
The execution-order signal carried by **Finding** and **Task** during planning. Decided after triage, distinct from **Severity**. Not exposed to **Reporters**.
_Avoid_: Severity, impact, importance, business value

**Reporter-Facing VOC Status**:
The public progress state shown to the **Reporter** of a **VOC**.
_Avoid_: Task status, triage state

**Task Status**:
The internal execution state of a **Task**.
_Avoid_: Reporter-facing VOC status

**Workflow Template**:
The shared default status configuration used by all **Managed Systems** in MVP.
_Avoid_: Per-system custom workflow

**Managed System Workflow**:
A future per-**Managed System** customization of status configuration managed by Admins.
_Avoid_: MVP workflow, ad hoc status

**Entity Link**:
A typed loose-coupling relation between two domain records (source and target) within one **Workspace**, used for cross-system context without forcing direct ownership. Carries `relation_type` and `visibility`.
_Avoid_: Foreign key, parent-child relation, hard reference, related record

**Relation Type**:
The named kind of an **Entity Link**, drawn from a controlled vocabulary (e.g. `related_to`, `evidence_of`, `follow_up_for`, `clustered_into`).
_Avoid_: Tag, category, free-form label

**Dashboard**:
An action-queue surface that groups outstanding **VOC**, **Task Request**, **Task**, **Survey**, and **Finding** work needing an **Actor**'s attention within their **Managed System Permission Scope**. Not a chart-only reporting page.
_Avoid_: Chart page, BI report, analytics view, KPI tile board

**VOC Cluster**:
A manually curated grouping of related **VOC** records used by **Developer** and **Admin** for internal triage and bulk operations. **VOC** records remain independent and are not merged. Not visible to **Reporters** in MVP.
_Avoid_: VOC merge, deduplication, duplicate group, parent VOC

**Cluster Candidate**:
A **VOC** selected as a target of a cluster-scoped bulk action; bulk actions apply individually to each candidate rather than to the cluster as a single record.
_Avoid_: Cluster member as a single bulk target, merged record

## Relationships

- A **Workspace** contains many **Managed Systems** via its **Managed System Registry**.
- **VOC**, **Finding**, **Task Request**, **Task**, **Survey**, **Analytics Area**, Permission Request, and Entity Link all carry exactly one **Workspace** in MVP.
- Cross-**Workspace** entity links are forbidden in MVP.
- An **Actor** may submit many **VOC** records.
- A **VOC** has exactly one **Reporter** in MVP.
- A **Reporter** is always an **Actor** in MVP.
- An **Actor** has one effective **Role Level** per relevant permission scope.
- **Role Level** authority narrows in this order: **Admin** > **Developer** > **User**.
- **Admin**, **Developer**, and **User** may all submit **VOC**.
- A **VOC** must reference exactly one **Primary Managed System** it is about.
- A **Managed System** may have many **VOC** records.
- A **Managed System Registry** contains many **Managed Systems** in one workspace.
- A **Managed System** may have many **Analytics Areas**.
- An **Analytics Area** belongs to exactly one **Managed System**.
- A **VOC** must reference one **Primary Managed System** and may reference one **Analytics Area** within that system.
- FeedbackOps **Analytics Area** catalog is the MVP source of truth; external analytics menu identifiers are optional metadata only.
- Automatic BI menu import or synchronization is not an MVP feature.
- **Analytics Area** owner teams are routing/defaulting hints only and do not grant authorization.
- **Analytics Area** is an optional classification aid on VOC, Finding, Task, and Survey records; absence of Analytics Area is valid in MVP.
- A **Finding** must reference exactly one **Primary Managed System**.
- A **Task Request** must reference exactly one **Primary Managed System**.
- A **Task** must reference exactly one **Primary Managed System**.
- A **Survey** must reference exactly one **Primary Managed System**.
- Multi-system impact is represented by description, tags, separate linked records, or entity links; it does not create multi-system ownership in MVP.
- A **Managed System** may define a **Default Owner**.
- A **Default Owner** may prefill actual **VOC** ownership, but the **VOC** still starts as untriaged.
- Default owner or reviewer resolution may create assigned-but-untriaged or assigned-but-pending-review work.
- **Managed System Permission Scope** is the MVP default scope for triage, Finding, Task Request, Dashboard, and permission requests.
- **Analytics Area** does not define MVP permission boundaries.
- A **Developer** role may be granted for one **Managed System** without granting access to sibling **Managed Systems**.
- **Admin** is workspace-level in MVP.
- A **Work Initiative** may group execution work, but it is not the MVP scope owner for VOC.
- **VOC Source Context** describes why the VOC was submitted; it does not replace **Reporter**.
- **VOC Source Context** is optional in MVP and defaults to **Direct Use**.
- MVP **VOC Source Context** values are **Direct Use**, **Proxy Report**, **Operational Discovery**, and **Stakeholder Request**.
- MVP does not track a separate affected user for **Proxy Report**; the problem context belongs in the VOC description.
- **Severity** is assigned during triage by an authorized **Developer** or **Admin**, not by the **Reporter** at VOC creation.
- A **Reporter** may optionally select **Analytics Area** at VOC creation, but only from the chosen **Primary Managed System**.
- **Developer** or **Admin** may correct **Analytics Area** during triage.
- A **Reporter** may edit VOC title, description, or attachments only before triage begins.
- After triage begins, the original VOC description is preserved and additional information is captured through **Reporter Reply**.
- A **Reporter** cannot change the **Primary Managed System** after VOC creation.
- **VOC** description, **Reporter Reply**, **Public Update**, and **Internal Comment** should use a **Rich Content Editor** when rich input is needed.
- **Rich Content Editor** user experience must be WYSIWYG-first; Markdown or HTML may be internal formats or optional shortcuts, but must not be required from users.
- MVP **Rich Content Editor** must support inline images for VOC description and preserve reporter-safe rendering for public-facing fields.
- **Rich Content Editor** uses one shared editor foundation across VOC description, **Reporter Reply**, **Public Update**, and **Internal Comment**.
- Each rich-content surface may restrict toolbar actions, embeds, and rendering according to visibility and safety needs.
- Images pasted or dropped into **Rich Content Editor** should appear inline to the user.
- Inline images are stored as **Inline Attachments** and referenced from rich content rather than embedded as base64 body data.
- **Inline Attachments** are governed by attachment permissions, size limits, file type rules, and visibility checks.
- Rich content must not render external image URLs inline in MVP.
- External URLs may be stored as links, but images must be uploaded and governed as **Inline Attachments** before inline display.
- **Rich Table** support is spike-gated in MVP; when enabled, tables created or pasted in **Rich Content Editor** are stored as structured editor content.
- Large spreadsheet-like data should be attached as a file rather than stored as an oversized **Rich Table**.
- Public-facing surfaces may restrict **Rich Table** size or availability.
- **Finding** is optional; simple VOC follow-up may go directly to **Task Request** without creating a **Finding**.
- **Finding** is used when multiple evidence sources, clusters, survey results, or explicit analysis need to be summarized before execution.
- **VOC** follow-up creates a **Task Request**, not a **Task** directly.
- **Task** is created after **Task Request** review, except for standalone internal work created from the Tasks surface.
- **Task Request Review** may be performed by workspace **Admin** or by **Developer** within the same **Managed System Permission Scope**.
- A **Developer** cannot review **Task Requests** for sibling **Managed Systems** without that scope.
- MVP allows the same **Developer** to create and approve a **Task Request** only when they have **Task Request Self-Approval** capability within their **Managed System Permission Scope**.
- **Task Request Self-Approval** requires a reason and explicit audit metadata.
- **Task Request Review** decisions are audited.
- A **Task** converted from an approved **Task Request** starts in Backlog by default.
- Approval means the work is accepted into the execution backlog; it does not mean immediate execution has started.
- A Backlog **Task** may have an assignee, but execution has not started until it moves to Todo or Doing.
- Assigned Backlog **Tasks** may appear in **My Work** as planned work.
- **My Work** aggregates work assigned to an **Actor**; it does not own the lifecycle of VOC, Task Request, Task, Survey, or Finding.
- A **Reporter** may see reporter-facing VOC status, public updates, and **Reporter Summary** for linked work on their own **VOC**.
- **Reporter Summary** must not expose **Finding** detail, **Task** internal comments, backlog priority, or Developer discussion.
- **Reporter Summary** may include public title, reporter-facing status, owning team public name, expected resolution date, last public update time, and a public update excerpt.
- **Reporter Summary** must not include internal priority, individual Developer names, internal due dates, root-cause analysis detail, severity, confidence, or private notes.
- **Reporter Summary** must not expose raw **Task Status** values; the canonical enum is defined in `docs/design/06-task-project-system.md` and locked by ADR-0003.
- Internal **Task Status** may inform public-safe **Reporter-Facing VOC Status**, but only through VOC-owned review/update behavior.
- **Public Update** may be written by workspace **Admin** or by **Developer** within the same **Managed System Permission Scope**.
- **User** cannot write **Public Updates**.
- **Internal Comment** and **Public Update** are separate communication types.
- MVP VOC conversation is an append-only timeline, not real-time chat.
- MVP has a public VOC conversation timeline for **Reporter Reply** and **Public Update**, and a separate internal timeline for **Internal Comment**.
- MVP does not include mentions, reactions, read receipts, threaded replies, or general message editing.
- A **Reporter** may add **Reporter Replies** to their own **VOC**.
- **Reporter Reply** belongs to the public VOC conversation and is visible to scoped **Developer** and **Admin** users.
- **Reporter Reply** must not be stored as **Internal Comment**.
- A **Reporter Reply** may return a Waiting Reporter VOC to an active triage or follow-up queue.
- When a **Reporter Reply** arrives for a Waiting Reporter **VOC**, the internal queue state moves to follow-up needed or needs review.
- **Reporter Reply** does not automatically change **Reporter-Facing VOC Status**.
- **VOC Cluster** is not reporter-visible in MVP.
- **VOC Cluster** does not merge **VOC** records; each **VOC** remains independent.
- MVP **VOC Cluster** supports manual create, add/remove membership, and confirm; cluster merge/split is a later feature.
- Cluster bulk update behavior is candidate-only; selected **VOC** records receive individual **Public Updates**.
- **VOC Triage State**, **Reporter-Facing VOC Status**, and **Task Status** are separate state machines with no automatic cross-mapping; canonical enums in `docs/design/15-data-contracts.md`, locked by ADR-0005.
- **Task Status** reaching Released may create a reporter-facing status review candidate; it does not automatically resolve the **VOC**.
- MVP uses one shared **Workflow Template** across all **Managed Systems**.
- **Managed System Workflow** customization is a future extension, not an MVP feature.
- An **Entity Link** connects two records of any combination of **VOC**, **Finding**, **Task Request**, **Task**, **Survey**, Dashboard, or Permission record within one **Workspace**.
- **Entity Link** carries one **Relation Type** from the controlled vocabulary; ad hoc strings are not allowed.
- Cross-system history is canonical through **Entity Link**, not via convenience columns on each table.
- **Entity Link** does not grant write ownership; the source-shaped route does not own the target.
- **Dashboard** surfaces actionable records; it does not aggregate chart metrics as its primary purpose in MVP.
- **Dashboard** is scoped by **Managed System Permission Scope** and is not duplicated per **Analytics Area** in MVP.
- **My Work** is filtered by assignee = the current **Actor**; **Dashboard** is filtered by **Managed System Permission Scope** regardless of assignee.
- A record may appear in both **My Work** (because it is assigned to me) and **Dashboard** (because it is in my scope); these are independent views, not different storage.
- **My Work** never widens beyond the current **Actor**; **Dashboard** never narrows to one assignee by default.
- A **Permission Request** is created by the requesting **Actor** and decided by an **Admin** within the same **Workspace**.
- A **Permission Request** decision may be `approved`, `rejected`, or `needs_more_info`; `needs_more_info` preserves identity for resubmission.
- **Sensitive Permission** grants and uses require a reason and are audited.
- Rejected **Permission Requests** must not be immediately resubmitted for the same scope without new justification.

## Example Dialogue

> **Dev:** "Can only Users submit VOC?"
> **Domain expert:** "No. Admins, Developers, and Users are all AD-authenticated Actors and can submit VOC. The Reporter is whoever submitted the VOC; source context explains whether it came from direct use, proxy registration, or operational discovery."
>
> **Dev:** "Can a VOC be created without selecting whether it is about Tableau, Power BI, or Looker?"
> **Domain expert:** "No. Every VOC must belong to exactly one Managed System so triage, ownership defaults, permissions, and dashboard filters have a clear scope."
>
> **Dev:** "If Tableau has a default owner, does that mean the VOC is already triaged?"
> **Domain expert:** "No. The default owner pre-fills the actual owner field, so the VOC is assigned but still untriaged. A manager can still review, classify, and change the owner during triage."
>
> **Dev:** "Should we model Tableau as a Project?"
> **Domain expert:** "No. Tableau is a Managed System. A future Work Initiative can group execution work, but VOC scope and defaults come from the Managed System."
>
> **Dev:** "Is 'permission management' one shared Analytics Area across Tableau and Power BI?"
> **Domain expert:** "No. Analytics Areas are managed under one Managed System. Tableau permission management and Power BI permission management may share a name, but they are separate Analytics Areas."
>
> **Dev:** "Can a Tableau manager see Power BI VOC?"
> **Domain expert:** "Only if they also have Power BI scope or admin access. MVP permissions are scoped by Managed System, not Analytics Area."
>
> **Dev:** "If someone is a Power BI Developer, can they process Tableau VOC?"
> **Domain expert:** "No. Developer authority is granted inside Managed System scope. Power BI Developer access does not imply Tableau access."
>
> **Dev:** "Can a Finding or Task exist without a Managed System if it came from linked evidence?"
> **Domain expert:** "No. VOC, Finding, Task Request, Task, and Survey all carry exactly one Managed System in MVP. Links preserve context; they do not replace scope."
>
> **Dev:** "What if the same login issue affects Tableau and Power BI?"
> **Domain expert:** "Choose one Primary Managed System for the record. If both systems need separate handling, create separate records and link them as related."
>
> **Dev:** "Can the Reporter see the Task linked to their VOC?"
> **Domain expert:** "Only through Reporter Summary. They can see public-safe progress context, not internal task detail, finding detail, comments, or backlog discussion."
>
> **Dev:** "Can we show the linked Task's internal priority to the Reporter?"
> **Domain expert:** "No. Reporter Summary uses public-safe fields only, such as public title, public status, owning team public name, expected resolution date, and public update excerpt."
>
> **Dev:** "If a Task is Released, do we automatically mark the VOC as solved?"
> **Domain expert:** "No. Released work creates a reporter-facing status review candidate. The VOC public status changes only through the VOC-owned review/update flow."
>
> **Dev:** "Can Tableau and Power BI have different VOC statuses in MVP?"
> **Domain expert:** "No. MVP uses the same workflow template for every Managed System. Admin-managed per-system workflows are a later extension."
>
> **Dev:** "If a Developer registers a VOC after hearing a complaint from a User, who is the Reporter?"
> **Domain expert:** "The Developer is the Reporter because they submitted it. The source context is Proxy Report."
>
> **Dev:** "Do we need to store the person who originally felt the pain in a proxy report?"
> **Domain expert:** "No. MVP tracks the submitted problem, not a separate affected user. Put that context in the VOC description when useful."
>
> **Dev:** "Should the VOC creation form ask the Reporter to choose severity?"
> **Domain expert:** "No. Reporters describe the problem. Severity is an operational triage decision made later by Developer or Admin."
>
> **Dev:** "Can the Reporter choose Analytics Area?"
> **Domain expert:** "Yes, optionally. The choices must be limited to the selected Managed System and can be corrected during triage."
>
> **Dev:** "Can the Reporter rewrite the VOC after triage starts?"
> **Domain expert:** "No. Preserve the original description after triage starts. Additional details should be added as Reporter Replies."
>
> **Dev:** "Should users type Markdown or HTML to add screenshots and tables?"
> **Domain expert:** "No. The editor must be intuitive and WYSIWYG-first. Storage format is an implementation detail."
>
> **Dev:** "Do we need separate editors for VOC body, replies, public updates, and internal comments?"
> **Domain expert:** "No. Use one shared editor foundation and restrict features per surface."
>
> **Dev:** "If a user pastes a screenshot into the VOC body, is it just an attachment at the bottom?"
> **Domain expert:** "No. It should appear inline in the body. The system stores it as an attachment behind the scenes and references it from the rich content."
>
> **Dev:** "Is a pasted Excel range an image attachment?"
> **Domain expert:** "Not automatically for MVP. Rich Table support is spike-gated; large spreadsheets should be uploaded as attachments."
>
> **Dev:** "Can a user embed an external image URL in a VOC?"
> **Domain expert:** "No. External URLs can be links, but inline images must be uploaded as Inline Attachments so permissions and security checks apply."
>
> **Dev:** "Does every VOC need a Finding before work can start?"
> **Domain expert:** "No. Finding is optional. Use it when evidence or analysis needs to be summarized; simple VOC follow-up can go directly to Task Request."
>
> **Dev:** "Can a VOC create a Task directly?"
> **Domain expert:** "No. VOC follow-up becomes a Task Request first. A reviewed Task Request can be converted to a Task; standalone internal Tasks are created from the Tasks surface."
>
> **Dev:** "Who can approve a Task Request?"
> **Domain expert:** "Workspace Admins can review all Task Requests. Developers can review Task Requests only inside their Managed System scope."
>
> **Dev:** "Can the same Developer create and approve a Task Request?"
> **Domain expert:** "Only if they have Task Request Self-Approval capability for that Managed System scope. They must provide a reason, and the decision is audited as self-approved."
>
> **Dev:** "When a Task Request becomes a Task, does it start in Todo?"
> **Domain expert:** "No. It starts in Backlog by default. Moving it to Todo is a separate execution planning decision."
>
> **Dev:** "Can a Backlog Task already have an assignee?"
> **Domain expert:** "Yes. Assignment can indicate planned ownership, but the work has not started until the Task moves to Todo or Doing."
>
> **Dev:** "Can the Reporter see that their linked Task is in Backlog?"
> **Domain expert:** "No. Raw Task Status values are internal. Reporter Summary shows public-safe progress through Reporter-Facing VOC Status and public updates."
>
> **Dev:** "Can a Developer publish an update to the Reporter?"
> **Domain expert:** "Yes, inside their Managed System scope. Users cannot write Public Updates, and Internal Comments remain private."
>
> **Dev:** "Can the Reporter answer when more information is requested?"
> **Domain expert:** "Yes. Their answer is a Reporter Reply in the public VOC conversation, not an Internal Comment, and it can move the VOC back into an active queue."
>
> **Dev:** "When the Reporter replies, do we automatically change the public status?"
> **Domain expert:** "No. The reply reactivates the internal follow-up queue. Public status changes remain an explicit VOC-owned decision."

## Flagged Ambiguities

- "Reporter" was used like a role and also like a customer person. Resolved: in MVP, **Reporter** is the **Actor** who submitted a specific **VOC**, not a standalone role or external **Contact**.
- "Customer" was used for the people who provide VOC. Resolved: this product is internal-only, so use **User** for the lowest internal role level; avoid external-customer language in MVP domain docs.
- "Project" can be confused with **Managed System** when users say things like "Tableau project" or "Power BI project." Resolved for MVP discussion: Tableau, Power BI, and Looker-like independent analytics programs are **Managed Systems**, and every **VOC** must select one.
- "Project Registry" was carrying Managed System responsibilities such as scope, defaults, and filters. Resolved: MVP uses **Managed System Registry** for those responsibilities; broader execution grouping should use **Work Initiative** only if it becomes necessary.
