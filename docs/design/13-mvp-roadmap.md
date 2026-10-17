# MVP Roadmap

## Purpose

This document defines release scope. System documents describe behavior; this document decides when behavior ships.

Implementation slice status is the GitHub milestones on `hjung3113/FeedbackOps`.
This document groups release scope and includes short shipped/open notes for partially delivered items. It is not an execution queue.

## Phase 1

```text
- VOC Cluster 제안 자동 생성 (shadow measurement and human-confirmed suggestions shipped in #1097 per ADR-0068; provider calibration/value evidence is post-MVP)
- 권한 요청 고도화 (needs_more_info supplement shipped in #511; requester withdrawal/edit, revision-safe narrowed approval, governed direct grant and risk indicators shipped in #1080–#1086 per ADR-0066; active grant revoke and deny lifting shipped in #762 per ADR-0061; single-object authorization is post-MVP)
- Dashboard coverage / unlinked data 고도화 (coverage fixes + page shipped in #513; five editable bands/neutral empty state shipped in #1087/#1088 per ADR-0067)
- Analytics Area별 리포트 (shipped in #1077–#1079 per ADR-0069)
```

## Phase 2

```text
- 자동 요약
- root cause 후보
- priority score
- advanced clustering
- 외부 도구 연동
- 고급 Audit / Export
- Executive Report
```

## MVP Close-Out

Decided by the owner on 2026-10-13. MVP closes when the remaining release scope ships and the Release Value Gate passes; after that release, new work comes from real use. Progress is the GitHub milestones Slice 53 to Slice 63.

Scope:

```text
- Completed close-out dependencies: #739, #740, #816, #340, #1015, and #1012 are closed.
- ADR-0059 D2 Survey templates, reuse, and dialog selection shipped in #1073–#1075; ADR-0067 D1/D3 responsibility defaults and bounded Dashboard recovery shipped in #1087–#1094. See Phase 1 above for current item-level statuses.
- Evidence inventory, route, and approved excerpt attachment shipped (#816, #1040, #1107, #1109 per ADR-0065).
- Release documentation and deferral record (#1186, #1065, #1066).
- A whole-system review (architecture, docs, UI/UX, performance, Impeccable audit and critique), then hardening from its findings
- Production images (backend, frontend, migration job) per ADR-0013, and a login check against an OIDC provider
- Release docs: keep the docs that explain the project (design and decision records, the doc index, a code index, the glossary) and remove plan, review, and stale docs; the development environment stays intact because development continues after release
```

### Release obligations (Slice 63)

- Measure PS-5 recovery reconcile lock hold on a high-response Survey. Done 2026-10-17: under one second per page even at 20k responses; batching deferred (`14-post-mvp-backlog.md` → Slice 63).
- Run the Reporter persona and the full MVP Success Flow in the Release Value Gate. Done: passed on the second run with no blocker (#1062); non-blockers in #1227.

Not in scope: Phase 2, the Explicit MVP Exclusions below, and public survey links (ADR-0035/0036 rejected). Every item deferred or dropped before release is recorded in `14-post-mvp-backlog.md`.

Survey privacy release claim (ADR-0064): trusted application authorization with
named direct Finding/highlight/link/audit and generated cache copies closed by
coordinated #739/#740. SQL-level unlinkability against stolen `fops_app`
credentials is not guaranteed; permitted app-executable readers remain composable.
ADR acceptance alone is not implementation completion. Safe #816 reuse and Evidence
follow in Slice 54; public Survey links stay excluded.

### Release Value Gate

The release ships only when an adversarial product review finds no blocker. Product value comes first; code quality alone does not pass the gate.

- Setup: the production images, seeded at the target scale (about 5k VOCs and 5k Tasks), driven in a real browser with keyboard and mouse at Windows conventions.
- Personas: a buyer deciding whether to pay for it, a Developer who works the queues daily, an Admin, and an internal reporter.
- Each persona runs the MVP Success Flow and the core job of every system it uses, and answers:
  1. Would a team pay for this? What would make them refuse?
  2. Can a first-time user finish the job without guidance, and with the least friction?
  3. Is the tool good at the job it targets, not just able to do it?
- Blocker: any reason to refuse to pay, any step a user cannot finish or would abandon, or friction on a daily path. Fix every blocker and rerun the gate before release.

## MVP Success Flow

Recommended first success path:

```text
1. 일반 사용자가 Managed System을 선택해 VOC를 등록한다.
2. Admin 또는 same-scope Developer가 VOC Inbox에서 분류하고 severity를 지정한다.
3. 유사 VOC를 묶어 VOC Cluster를 만든다.
4. Cluster에서 Finding을 만든다.
5. Finding에서 Task Request를 만든다.
6. Admin 또는 same-scope Developer가 Task Request를 승인해 Backlog Task를 만든다.
7. Task 상태와 별도로 Reporter-facing VOC Status를 수동 갱신한다.
8. Action Dashboard에서 High Severity VOC의 Finding / Task Request / Task / no-follow-up decision 여부를 추적한다.
```

## Explicit MVP Exclusions

```text
- Survey Response → VOC conversion
- full automatic clustering
- custom workflow builder
- public roadmap / voting portal
- advanced BI
- complex survey logic
- advanced permission policy language
- external tool integrations
- external/customer-contact login
- per-Managed System workflow customization
- Analytics Area permission boundaries
- affected_user field
- raw Markdown/HTML-only rich content input
```
