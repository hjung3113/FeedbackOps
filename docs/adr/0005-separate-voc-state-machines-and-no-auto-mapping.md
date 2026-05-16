# Three separate VOC state machines and no automatic cross-mapping

A **VOC** lives in three independent state machines, all defined canonically in `docs/design/15-data-contracts.md`:

- **VOC Triage State** — internal workflow: `untriaged | triaged | needs_more_information | dismissed_not_actionable`.
- **Reporter-Facing VOC Status** — public progress visible to the **Reporter**: `접수됨 | 검토 중 | 담당자 배정됨 | 처리 중 | 해결 준비 중 | 해결됨 | 다시 처리 중 | 종료됨`.
- **Task Status** — internal execution state of the linked **Task**, locked by ADR-0003.

No transition in one machine automatically writes to another. **Task Done** does not map to `해결됨`; **Task Released** creates a Public-Update review candidate but does not change `Reporter-Facing VOC Status` on its own; **Reporter Reply** on a `Waiting Reporter` VOC reactivates the internal queue but does not move the public status; **VOC Cluster** bulk operations apply candidate-by-candidate, never as a single state write.

We split into three machines because they answer different questions for different audiences (internal triage flow vs reporter-facing progress vs task execution) and have different visibility, audit, and write-permission rules. Collapsing any two would force one audience's vocabulary onto another — Reporters would see `Backlog` or `dismissed_not_actionable`, or Developers would lose the internal triage detail needed for follow-up decisions.

We disallow automatic cross-mapping because every Reporter-Facing status change is an audited per-VOC decision (`docs/design/04-voc-system.md:96`). Implicit propagation from Task Status or Reporter Reply would bypass that audit, produce false reassurance ("Task done = problem solved" is not always true), and leak the assumption that Task execution and VOC resolution are the same event. Releases create candidates; humans confirm.

We choose Korean strings for `Reporter-Facing VOC Status` because the primary Reporter audience is internal Korean-speaking AD users and the strings appear in reporter-visible UI; the internal `VOC Triage State` and `Task Status` enums stay in English because their audience is Developer/Admin tooling and code. Mixing English internal states with Korean public states is intentional — it makes accidental leakage into Reporter Summary visible at code-review time.

Reopening this means proposing a specific automatic mapping (with its audit story and reversal path) or reunifying the public and internal vocabularies — both warrant a new ADR rather than a silent edit.
