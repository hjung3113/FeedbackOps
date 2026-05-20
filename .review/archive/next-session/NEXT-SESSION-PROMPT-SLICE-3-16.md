# Next-session prompt — Slice 3 #16

Paste the block below into a fresh Claude Code session at the repo root.

---

Slice 3 #16 시작.

규칙:
- AGENTS.md > CONTEXT.md > docs/adr > docs/implementation
- 메모리의 `feedback_orchestration` + `feedback_orchestration_model_split` 따름
- 메인 = 오케스트레이터. Opus 설계/리뷰, Sonnet 구현, Haiku 문서
- 청크 단위 디스패치 (각 명시적 Goal + 좁은 파일셋)
- 사용자 승인 단계 없음 — 대신 codex CLI 적대적 리뷰로 대체 (`codex exec --skip-git-repo-check ...` stdin 프롬프트)
- 이슈당 2 cycle 적대적 리뷰: 1차 codex CLI, 2차 Opus 서브에이전트. 각 cycle 후 Sonnet 보강
- 통합 테스트는 실제 Postgres 스모크 (apps/backend/AGENTS.md)
- DB env: DATABASE_URL=postgres://fops_app:fops_app@localhost:5434/feedbackops, DATABASE_URL_MIGRATE=postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops, WORKSPACE_ID=00000000-0000-0000-0000-000000000001
- git: feature/<n>-<slug> from develop, PR to develop, 푸시 + 머지 + close 모두 에이전트 가능 (사용자가 위임)
- llmwiki: 도메인 lookup은 `mcp__llmwiki-feedbackops-docs__search/read` 활용 (한 번 본 거 다시 grep하지 말 것). 문서 수정 시 영향 받은 wiki 페이지 `mcp__llmwiki-feedbackops-docs__edit`로 동기화

작업 단계:
1. develop 동기화 + gh issue view 16
2. `project_slice3_backend_issues` 메모리 + 직전 #15 메모리 (`project_slice3_15_pr`) 참조
3. llmwiki에서 관련 컨셉 lookup: `mcp__llmwiki-feedbackops-docs__search(knowledge_base='docs', mode='search', query='public update reporter reply internal comment')` + read `/wiki/entities/bounded-context-voc.md`, `/wiki/concepts/triage-lifecycle.md`, `/wiki/concepts/idempotency-and-concurrency.md`
4. 청크 계획 수립 → `.review/SLICE-3-16-PLAN.md` 작성 → codex CLI 적대적 리뷰로 계획 검증 → 보강
5. 청크별 디스패치 (C0 shared schemas, C1 repo, C2 service, C3 routes, C4 integration, C5 verify+review+PR)
6. 2 cycle 적대적 리뷰 (codex + Opus 서브에이전트) → 보강 → push + PR + squash-merge + 이슈 close

## #16 요약 (변경되면 issue body가 진실)

POST /vocs/:id/{public-updates, reporter-replies, internal-comments} + 새 `reporter_facing_status.gate_blocked` ADR-0012 enum 추가 + sanitizer 표면 3개.

핵심 미해결 sub-question:
- Q3: Public Update + 동기 status change paired write 트랜잭션 의미
- Q-STATUSGATECODE: 새 에러 코드 정확한 이름과 status code

Blocked by: #12, #13, #14, #15 (모두 closed/merged)

## 주의

- #15 cycle-2에서 잡힌 access matrix (`isReporter`/`canTriage`/`msInReadScope`/`msInEffectiveScope`)를 write side에서도 일관 적용해야. POST internal-comments는 canTriage만 허용; POST reporter-replies는 isReporter만 허용; POST public-updates는 voc.triage 권한 + 동시 status change paired write.
- conversation 테이블은 append-only (fops_app은 SELECT + INSERT만, 0010 migration). UPDATE/DELETE 시도하지 말 것.
- migration 0010 `voc_reporter_replies` BEFORE INSERT 트리거가 `actor_id = vocs.reporter_id` 강제 — 다른 actor가 INSERT 시도하면 트리거 거부됨. 이를 422로 변환할지 500을 흘릴지 결정 필요.
- POST handlers는 #13 패턴 (POST /vocs) 따라: Idempotency-Key 헤더 + `pg_advisory_xact_lock(actor, key)` + lookup → record → 201/200.
- public_updates는 reporter_facing_status 변경을 audit 함께. 새 audit event 정의 필요 (`voc_public_update_posted`, `voc_reporter_replied`, `voc_internal_commented`).
- ADR-0012 enum 변경 = sub-PR이 될 수 있음 (shared package 변경 + 모든 enum 사용처 마이그레이션). codex 리뷰에서 묻기.

## 자료
- 직전 산출물: `.review/SLICE-3-15-PLAN.md`, `.review/SLICE-3-15-REVIEW-CYCLE-{1,2}.md` (포맷 참고)
- 직전 코드: `apps/backend/src/modules/voc/{routes,service,repo,read-service,repo-read,cursor,transitions}.ts`
- 권한 helper: `apps/backend/src/modules/permissions/{check-service,scope-service}.ts`
- 셰어드: `packages/shared/src/{enums/capabilities,errors/codes,vocs/*}.ts`
- 테스트 패턴: `apps/backend/src/modules/voc/__tests__/{create,patch}-voc.integration.test.ts`
- 시드 헬퍼: `apps/backend/src/modules/voc/__tests__/_seed-helpers.ts`

## 시작 신호
"#16 시작" 또는 "위 룰로 진행" 한 마디면 1단계부터 자동 진행.
