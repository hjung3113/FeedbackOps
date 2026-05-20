# Next-session prompt — Slice 3 #19 (VOC Create) + 보강 작업

새 Claude Code 세션에서 repo root에 붙여넣기.

---

Slice 3 #19 (VOC Create) 시작. 단, 진입 전 보강 작업 결정 필요.

## 현재 상태 (2026-05-20)

Slice 3 BE 완전 종료 + Slice 3 FE 프롤로그(#18) 완전 종료:
- BE: #12-#17 + #23/#24 (558 tests)
- FE: #18 — Pack 17 light tokens + 22 shadcn + TipTap + AppFrame + 3-shell + _authed + /vocs shell + apiClient/errorMapper/useIdempotencyKey (PR #48 squash-merged `7cb181a`)
- 합계 659 tests, develop @ `7cb181a`

Slice 3 BE EXIT + FE FOUNDATION 모두 lock.

## 다음 작업 — 진입 결정 필요

### 우선순위 후보 (Slice 3 남은 이슈)

| 이슈 | 제목 | 라벨 | 추정 | 비고 |
|---|---|---|---|---|
| **#52** | lib/api 통합 (legacy api.ts ↔ new lib/api/) | tech-debt | 1-2h | **#19 진입 전 권장** — duplicate API surface 차단 |
| **#19** | POST /vocs Create UI (real submit, RichEditor wire, MS/AA pickers, attachment dropzone placeholder) | ready-for-agent | 큰 작업 (multi-chunk) | 메인 work |
| **#49** | RichEditor surface constraint (per BE allowlist) | ready-for-agent | 2-3h | #21 composer 의존, #19 영향 작음 |
| **#50** | apiClient rate-limit 헤더 expose | ready-for-agent | 1-2h | 모든 mutation 라우트 영향 — 일찍 처리 권장 |
| #20 | Inbox+Detail (list rows + DetailPanel components + badges) | ready-for-agent | 큰 작업 | #19 다음 |
| #21 | Triage queue + composers | ready-for-agent | 큰 작업 | #19/#20 다음 |
| #22 | Attachment storage UI | ready-for-agent | 중간 | #19 또는 #21 작업 중 |
| #18.1 | (미파일) Sidebar nav icons + prototype pixel alignment | - | 1h | 한꺼번에 리뷰 시 처리 (사용자 결정) |

### 확정 순서 (2026-05-20 lock)

**A. 안전 순서:** #52 → #50 → #19 → (인라인 #49) → #20 → #21 → #22

- #52 먼저 — #19 시작 전 lib/api 통합 안 끝나면 import 분기 누적
- #50 다음 — #19/#20/#21 toast UX에 rate-limit 헤더 surface 필요
- #19 본진 — RichEditor wire + MS/AA pickers + 422/409 surface
- #49는 #19 진행 중 인라인 또는 #21 직전 처리
- #20 → #21 → #22 순차

기각: B (lib/api 분기 누적 위험), C (디자인 보강은 #19 완료 후 별도 CP)

## 공통 규칙 (유지)

- AGENTS.md > CONTEXT.md > docs/adr > docs/implementation
- 메모리: `feedback_orchestration` + `feedback_orchestration_model_split` (4-tier Opus/GPT-5.5/Sonnet/Haiku) + `feedback_html_confirm_format` + `feedback_playground_vs_report`
- 메인 = 오케스트레이터. Opus 설계/리뷰, GPT-5.5(codex) 미드 복잡도, Sonnet 구현, Haiku 문서
- 청크 단위 디스패치, 800 LOC / 50 file 룰
- **FE 이슈는 정적 리뷰 한계 → playground HTML 체크포인트 + AskUserQuestion**
- 통합 테스트: backend는 실제 Postgres 스모크; FE는 Playwright MCP로 prototype vs impl 비교
- DB env: `DATABASE_URL=postgres://fops_app:fops_app@localhost:5434/feedbackops`, `DATABASE_URL_MIGRATE=postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops`, `WORKSPACE_ID=00000000-0000-0000-0000-000000000001`
- git: feature/<n>-<slug> from develop, PR to develop, 푸시 + 머지 + close 모두 에이전트 가능 (사용자가 위임)
- 커밋 시 `git add -A` 금지 — 변경 파일만 명시적으로 add
- llmwiki: 도메인 lookup은 `mcp__llmwiki-feedbackops-docs__search/read` 활용
- **사용자 컨펌:** playground HTML for visual/exploratory, report HTML for scope/decision. `report/YYYY-MM-DD-<topic>.html` 또는 `report/YYYY-MM-DD-<topic>-playground.html`.

## #19 작업 미리보기 (참고)

**Goal:** Reporter가 VOC를 작성하고 POST /vocs로 제출. RichEditor (voc-description surface) + Managed System + Analytics Area pickers + 본문/제목 검증 + 422/409 에러 surface.

**예상 청크 (10-12 청크):**
- C0: feature 브랜치 + Korean copy / wire schema import (`createVocRequestSchema` from `@fops/shared`)
- C1: VocCreateScreen + PageShell 마운트 (`/vocs?action=create` 라우트가 이미 PageShell로 박혀 있음)
- C2: ManagedSystemPicker + AnalyticsAreaPicker 데이터 페치 + 조합 (option props 채움)
- C3: RichEditor wire — `surface='voc-description'` toolbar (#49 처리 안 됐을 시 toolbar로만 UX 제약, 키보드 paste는 BE sanitizer 의존)
- C4: AttachmentDropzone placeholder (Slice 3 attachment storage 없음 → empty array 강제)
- C5: react-hook-form + zod validation (title required, description_rich_content TipTap doc, attachments=[])
- C6: useMutation + apiClient.POST('/vocs', { Idempotency-Key, body }) + onSuccess navigate → `/vocs?selected=<new-id>&view=inbox` + onError toast
- C7: Form-level 422 field surfacing (validation.failed detail.fields → react-hook-form errors)
- C8: 409 conflict.idempotency_key_reuse → markConsumed + retry
- CHECKPOINT FE: playground HTML for form UX
- Final: 2-cycle review + PR

**선행 결정 필요:**
- #52 처리 여부 (apiClient 단일 모듈 사용 vs legacy admin fetch pattern 혼용)
- #49 처리 여부 (RichEditor 코드만 voc-description 가정하고 가도 OK — toolbar는 #19 owner)
- #50 처리 여부 (toast 모두 일반 카피만 사용 — rate-limit 시각 노출 시점 미정)

## 시작 신호

"진입 결정"이라고 한 마디 → 우선순위 선택지 (위 A/B/C) AskUserQuestion 띄움.
"#52 시작" 한 마디 → lib/api 통합 작업 직행.
"#19 시작" 한 마디 → 보강 SKIP하고 #19 plan 작성으로 직행.

## 자료

- 직전 PR: #48 (`7cb181a`)
- 직전 메모리: `project_slice3_18_pr` (FE FOUNDATION 락)
- 백엔드 wire shape (FE가 호출): `apps/backend/src/modules/voc/routes.ts`
- 셰어드 schemas: `packages/shared/src/{vocs,errors,audit,enums}/`
- 디자인: `docs/design-prototype/` (HANDOFF.md, DESIGN-MAP.md, screen-voc-create.jsx, rich-editor.jsx)
- ADR-0011 (rich content), ADR-0020 (3-shell), **ADR-0021 (Pack 17 light)** ← #18에서 추가
- 스펙: `docs/frontend/specs/voc.md` §3 + §6
- 직전 시각 베이스라인: `.review/SLICE-3-18-screenshots/2026-05-20-impl-vocs-create.png` (placeholder 상태)
- prototype 베이스라인: `docs/design-prototype/screenshots/final-baselines/voc-new.png`

## 환경 메모

- `routeTree.gen.ts` gitignored — dev 처음 띄울 때 Vite plugin이 regen.
- 단일 PR에 너무 많이 담지 말 것 — #19도 chunk 분할 (#18 패턴 차용).
- 매 청크 끝 typecheck + 적절한 시점 검증 commit.
