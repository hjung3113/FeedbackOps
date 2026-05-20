# Next-session prompt — Slice 3 FE prologue (#18)

Paste below into a fresh Claude Code session at repo root.

---

Slice 3 #18 (FE 프롤로그) 시작.

## 현재 상태 (2026-05-20)

Slice 3 BE 완전 종료:
- #12 voc foundation, #13 POST /vocs, #14 PATCH /vocs/:id triage, #15 GET list/detail/conversation, #16 POST conversation, #23 sanitizer attr allowlist, #24 sanitizer DoS caps, #17 PATCH /vocs/:id/description ✓
- 558 backend tests, develop @ `e6577eb`

이제 FE. **첫 FE 이슈.**

## 처리할 작업

**#18** Slice 3 FE prologue: shadcn baseline + TipTap RichEditor + sonner + design tokens + AppShell + `/vocs` route shell.

대형 작업 → 청크 분할:
- C0 사전: prototype dev server 띄우고 토큰/팔레트/타이포 추출
- C1 shadcn install + tailwind config + design tokens
- C2 TipTap RichEditor 단독 컴포넌트 (모든 4 surface, sanitizer 422 wire 매핑)
- C3 sonner toast 시스템
- C4 AppShell (ADR-0020 3-shell taxonomy + 50px header rhythm, app.jsx 베이스라인)
- C5 `/vocs` route shell (TanStack Router) — empty 라우트 매트릭스 (R-VOC-INBOX / -MY / -TRIAGE / -CREATE / -DETAIL)

## 공통 규칙

- AGENTS.md > CONTEXT.md > docs/adr > docs/implementation
- 메모리: `feedback_orchestration` + `feedback_orchestration_model_split` + `feedback_html_confirm_format`
- 메인 = 오케스트레이터. Opus 설계/리뷰, Sonnet 구현, Haiku 문서
- 청크 단위 디스패치 (각 명시적 Goal + 좁은 파일셋)
- **FE 이슈는 정적 리뷰 한계 → 유저 리뷰 체크포인트 적극 삽입 (아래 별도 섹션)**
- 통합 테스트: backend는 실제 Postgres 스모크; FE는 Playwright MCP로 prototype vs impl 비교
- DB env (변경 없음): `DATABASE_URL=postgres://fops_app:fops_app@localhost:5434/feedbackops`, `DATABASE_URL_MIGRATE=postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops`, `WORKSPACE_ID=00000000-0000-0000-0000-000000000001`
- git: feature/<n>-<slug> from develop, PR to develop, 푸시 + 머지 + close 모두 에이전트 가능 (사용자가 위임)
- 커밋 시 `git add -A` 금지 — 변경 파일만 명시적으로 add
- llmwiki: 도메인 lookup은 `mcp__llmwiki-feedbackops-docs__search/read` 활용; 영향 받은 wiki 페이지 동기화
- **사용자 컨펌 시 HTML 파일로 — `report/YYYY-MM-DD-<topic>.html` 자체완결 inline-CSS. AskUserQuestion 직전 "report/<file>.html 작성 — 열어서 확인" 한 줄. (memory `feedback_html_confirm_format`)**

## FE (#18) — Prototype = 시각적 명세서

**`docs/design-prototype/`는 단순 인풋이 아니라 시각적 명세서 (visual spec). 모든 FE 산출물은 prototype과 픽셀-급 정렬을 목표로 한다.** 동작 명세 (텍스트) 외에 색/간격/타이포/레이아웃은 prototype이 진실.

### 사용 규약

1. **라우트 → 스크린 매핑은 `docs/design-prototype/DESIGN-MAP.md` 표를 따른다.** 예:
   - `/vocs` inbox/my → `screen-voc.jsx`
   - `/vocs/:id` triage → `screen-voc-create.jsx` (§Triage Console)
   - `/vocs/new` → `screen-voc-create.jsx` (§VOC creation, RichEditor surface=voc-description)
2. **TipTap RichEditor는 `docs/design-prototype/rich-editor.jsx` 의 toolbar/affordance를 베이스라인으로 한다.** 단, 백엔드 sanitizer (#23+#24) 가 권위.
3. **Design token / 컴포넌트 베이스라인은 `HANDOFF.md` + `components.jsx` 에서 추출.** Tailwind config 의 색/간격/그림자/radii는 prototype 의 실제 값과 일치해야 한다.
4. **셸 구조 (AppShell + PageShell/ListShell/WorkbenchShell)는 ADR-0020 + `docs/design-prototype/app.jsx` 의 헤더 50px 리듬 + 좌측 네비 폭/계층을 그대로 옮긴다.**
5. **`affordances.jsx`, `entity-preview.jsx`, `cmdk.jsx` 등 cross-cutting 컴포넌트는 production 으로 옮길 때 prototype 의 마크업 구조를 보존한다** (className → shadcn variant 매핑은 OK, 마크업 트리는 깨지 말 것).

### 유저 리뷰 체크포인트 (시각/인터랙션/접근성/반응형/빌드 검증)

각 분기점에서 **prototype 화면 + 구현 화면을 사이드-바이-사이드 HTML 리포트로 만들어** 사용자에게 OK 받기. Playwright MCP로 양쪽 스크린샷 캡처해 HTML 임베드.

1. **C1 완료: shadcn baseline + design tokens** — `pnpm --filter @fops/frontend dev` + `open docs/design-prototype/FeedbackOps.html` 둘 다 띄움. 토큰 데모 페이지 vs prototype 동일 컴포넌트 (Button/Input/Badge 등). `report/<date>-slice3-18-c1-tokens.html` 작성 (양쪽 스크린샷 inline embed). "토큰/타이포/팔레트 일치?"
2. **C2 완료: TipTap RichEditor 단독** — 임시 demo route 에서 `surface=voc-description` 동작. prototype `rich-editor.jsx` toolbar 와 affordance 동일. sanitizer (#23+#24) wire-error 422 시각 처리 포함. `report/<date>-slice3-18-c2-editor.html`. "에디터 UX prototype 와 일치?"
3. **C4-C5 완료: AppShell + /vocs route shell** — 빈 셸 라우팅 (R-VOC-INBOX/-MY/-TRIAGE/-CREATE/-DETAIL) + prototype `screen-voc.jsx` 사이드-바이-사이드. 50px 헤더 리듬, 좌측 네비, 디테일 패널 슬롯 위치 일치. `report/<date>-slice3-18-c4-shell.html`. "셸 정렬 OK?"
4. **PR 머지 직전** — Playwright MCP로 R-VOC-INBOX, R-VOC-CREATE 두 라우트 스크린샷 + prototype 동일 화면 스크린샷 비교. `report/<date>-slice3-18-final.html`. diff 가 큰 항목은 PR body 에 캡처 첨부 후 follow-up issue 분리. "최종 OK?"

체크포인트 사이는 자동 진행. "ㅇㅇ" / "OK" / "다음" 짧은 확인만 받으면 다음 청크. 수정 요청 시 그 청크 안에서 재작업.

체크포인트마다 `AskUserQuestion` 사용; option label 에 prototype 파일 경로 명시.

## 작업 단계

1. develop 동기화 + `gh issue view 18`
2. 메모리: `project_slice3_17_pr` (BE EXIT 직전 상태), `project_design_prototype`, `feedback_html_confirm_format` 참조
3. llmwiki: `mcp__llmwiki-feedbackops-docs__search` 로 `rich-content-sanitizer` (post-#23/#24 wire shape), `shell-taxonomy` (ADR-0020), `bounded-context-voc`
4. 청크 계획 → `.review/SLICE-3-18-PLAN.md` → codex CLI 적대적 리뷰 → 보강
5. 청크별 디스패치 (Sonnet 서브에이전트, 좁은 파일셋)
6. 청크 사이 체크포인트 (위 4개) — HTML 리포트 + AskUserQuestion
7. 2 cycle 적대적 리뷰 (codex + Opus) → 보강 → push + PR + squash-merge + 이슈 close + 메모리 + wiki 동기화

## 자료

- 직전 산출물: `.review/SLICE-3-17-PLAN.md`, `REVIEW-CYCLE-{1,2}.md`
- 직전 메모리: `project_slice3_17_pr` (PR #47 commit `e6577eb`)
- 백엔드 wire shape (FE가 호출): `apps/backend/src/modules/voc/routes.ts`
- 셰어드 schemas: `packages/shared/src/{vocs,errors,audit,enums}/`
- 디자인: `docs/design-prototype/` (HANDOFF.md, DESIGN-MAP.md, screen-*.jsx, rich-editor.jsx, app.jsx, components.jsx, affordances.jsx)
- `docs/frontend/specs/voc.md` (VOC UI 명세)
- ADR-0011 (rich content), ADR-0020 (shell taxonomy 3-shell + 50px header)
- F-RENDER-SANITIZE (#41) — FE 측 client sanitizer 미러
- F-RENDER-LINK-REL (#42) — rel=noopener target=_blank

## Slice 3 backend → frontend 핸드오프

ADR-0012 코드 셋, audit event 셋, idempotency/If-Match/rate-limit 룰 모두 락. FE 는 wire 만 호출.

## 시작 신호

"#18 시작" 또는 "위 룰로 진행" 한 마디면 1단계부터 자동 진행.
