# MVP Roadmap

## Purpose

This document defines release scope. System documents describe behavior; this document decides when behavior ships.

Implementation slice status is the GitHub milestones on `hjung3113/FeedbackOps`.
This document groups release scope and includes short shipped/open notes for partially delivered items. It is not an execution queue.

## Release status

MVP released: **v1.0.0 on 2026-10-17** and **v1.1.0 on 2026-10-18**. The Phase 1
scope and the MVP Close-Out shipped, including the #739/#740/#816 Survey provenance
cutover and safe reuse (#816 included), the Evidence inventory and route
(`#1040/#1107/#1109` per ADR-0065), and the Release Value Gate run (passed on the
second run, #1062). Public survey links stay rejected (ADR-0035/0036). Every item
deferred or dropped is recorded in [14-post-mvp-backlog.md](14-post-mvp-backlog.md).

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

## Release Value Gate

The gate below is the standing release-gate procedure for future releases.

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
