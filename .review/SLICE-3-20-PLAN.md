# SLICE-3 #20 — VOC Inbox + My VOCs + Detail panel (read-only) · PLAN

**Branch:** `feature/20-voc-inbox-detail` from `develop @ c6f620e`
**Spec:** issue #20 + `docs/frontend/specs/voc.md` §2/§3/§6/§7
**Builds on:** #15 (GET endpoints), #18 (FE FOUNDATION), #19 (form patterns)
**Baseline:** `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png` + `voc-inbox-detail-full.png`

## 1 · Goal

`/vocs?view=inbox` + `/vocs?view=my` list-first layout, single-select rows, right-mounted read-only Detail panel with 7 sections (identity, triage read, description, linked execution, linked entity trail, conversation timeline w/ tabs, sticky next-action footer). No composers / no edit affordances (those land in #21).

## 2 · Scope sizing

Massive. ~12 packages/ui primitives + 2 routes + screen + Detail panel (7 sections) + queries + URL state plumbing + permission UI + tests + pixel-diff. Estimated 2500-3500 LOC across 25-35 files. Single PR with disciplined per-chunk commits.

## 3 · Chunk breakdown

| C# | 내용 | LOC | 모델 |
|---|---|---|---|
| C0 | branch + recon (deps check; design-prototype 매핑 확인; barrel 상태 점검) | ~20 | inline |
| C1 | `@fops/ui` 인디케이터/배지: SeverityIndicator, SeverityBadge, ReporterStatusBadge(pill), InternalTaskBadge(squared), ManagedSystemPill, OutlineBadge, EntityIconBadge — 토큰 mapping + 단위 테스트 every state | ~400 | Sonnet |
| C2 | `@fops/ui` identity: Avatar wrapper (shadcn Avatar 기반), UserChip (sm/md + sub label + unknown) + 테스트 | ~120 | Sonnet |
| C3 | `@fops/ui` toolbar primitives: ListToolbar, ListFilterButton, ListSortButton, SearchInput(disabled+tooltip), EmptyState | ~300 | Sonnet |
| C4 | `@fops/ui` panel primitives: DetailPanelHeader, PanelTitleBlock, NestedTextBlock, FieldRow, PanelSectionTitle, Callout(5 tones), DetailPanelHeaderActions(kebab) | ~350 | Sonnet |
| C5 | `@fops/ui` permission UI + LinkedEntityTrail placeholder: PermissionBlockedPanel(4 states) + LinkedEntityTrail (dashed placeholder node) | ~250 | Sonnet |
| C6 | features/voc/hooks: useManagedSystem (id→{name,color,mark}), usePermissionDecision, useVocList(view+filters+cursor), useVocDetail(etag-aware), useVocConversation(infinite, lazy) | ~250 | Sonnet |
| C7 | features/voc/components/list: VocList + VocRow (60px, all variants) + skeleton + error | ~250 | Sonnet |
| C8 | features/voc/components/detail: VocDetailPanel orchestrator + 7 sub-sections (IdentitySection, TriageBlock, DescriptionSection, LinkedExecutionSection, LinkedEntityTrailSection, ConversationTimeline w/ tabs, NextActionFooter) + DetailPanelNotFound + EditDescriptionLink placeholder | ~600 | Sonnet (two passes if needed) |
| C9 | features/voc/routes: InboxRoute (handles view=inbox AND view=my) + URL state plumbing (tab/filter/sort/selected/managedSystem) | ~250 | Sonnet |
| C10 | routes/_authed/vocs.tsx: replace inbox/my Placeholder branch w/ `<InboxRoute>`; out_of_scope_summary peek banner | ~80 | inline |
| **CP1** | 라이브 스크린샷 (mock-user-1 + seed) — 3 viewport: desktop 1440 / tablet 1024 / mobile 390 | — | main |
| **CP2** | **pixel-diff vs prototype baseline** — voc-inbox-detail.png 좌우 비교 report HTML, 차이 enum화 | — | main |
| C11 | 필요시 폴리시 청크 (CP2 결과 따라). LOW 5↓ → 인라인 명시. MEDIUM↑ → 동일 PR 폴리시 | 가변 | inline 또는 Sonnet |
| C12 | 통합 테스트: 리스트 happy(12 rows), empty, error, tab 전환, filter/sort 라운드트립, selected mount, 404 detail, summary envelope, out_of_scope_summary, conversation 더보기 | ~500 | Sonnet |
| C13 | 단위 테스트: 모든 신규 primitives 토큰 매핑 + state snapshot + UserChip variants + PermissionBlockedPanel 4 states | ~400 | Sonnet |
| **REV-1** | Opus self-adversarial 1차 → `.review/SLICE-3-20-REVIEW-CYCLE-1.md` | — | main |
| 픽스 | REV-1 발견사항 픽스 | 가변 | inline/Sonnet |
| **REV-2** | 2차 검증 → `.review/SLICE-3-20-REVIEW-CYCLE-2.md` | — | main |
| PR | open + 시각 fidelity 확인 본문 포함 + squash-merge + 이슈 close | — | main |

**총 LOC 추정:** ~3500 (테스트 포함). 단일 PR.

## 4 · 의존성 + 데이터 흐름

- 백엔드 endpoint (이미 #15에 존재):
  - `GET /vocs?view=&managed_system_id=&tab=&filter.*=&sort=&cursor=&limit=` → `{ items, next_cursor, out_of_scope_summary? }`
  - `GET /vocs/:id` → vocDetailEnvelope 또는 vocSummaryEnvelope (`permission_decisions._self.state` 분기)
  - `GET /vocs/:id/conversation?cursor=&kind=` → 페이지네이션
- `@fops/shared` 스키마: vocListItem, vocDetailEnvelope, vocSummaryEnvelope, listVocsQuery, conversationEntry — 모두 존재.
- Tab `'waiting'` BE enum에 있지만 spec UI 탭에 없음 → 일단 무시.

## 5 · URL 상태 계약 (이미 #18 vocs.tsx에 일부 선언)

`vocSearchSchema` 확장 필요:
- `tab: z.enum(['untriaged','high','unassigned','similar','no-link']).optional()` (이미 `tab: z.string()` — 좁힘)
- `filter.severity`, `filter.reporterStatus`, `filter.owner` (이미 string) — comma-list 검증으로 좁힘 또는 그대로
- `sort: z.enum(['created_at:desc','created_at:asc','severity:asc','severity:desc','reporter_facing_status:asc']).optional()`

URL ↔ react-query queryKey 동기화. 새로고침 시 selected restore.

## 6 · 위험 + 알려진 미해결

1. **`packages/ui` 새 primitives 12+개** — 큰 일괄 PR 부담. 청크별 commit으로 완화.
2. **prototype baseline 매핑 정확도** — `voc-inbox-detail.png` Pack 20 기반, 현재 토큰은 Pack 17. 토큰 갭 발생 가능 (#55 이슈에서 보고됨). CP2에서 enum화 후 차이 따라 #55 통합 또는 별도 미루기.
3. **`useInfiniteQuery` 대화 페이지네이션** — `cursor` + `kind` 필터 조합. TanStack Query v5 API 확인.
4. **`PermissionBlockedPanel` `request_access` CTA** — `/admin/permissions/requests?action=create&capability=…` 라우트 미존재. Slice 3+ 영역. 본 PR은 navigate만 호출 + 404 허용 OR placeholder toast로 처리.
5. **`useManagedSystem` 컬러 매핑** — MS 시드 데이터에 `color` 컬럼 없음. 클라이언트 사이드 색 매핑 (hash → fixed palette) 또는 단색.

## 7 · AC ↔ 청크 매핑

요약: 26개 AC. 청크별 매핑은 본 PR 진행 중 갱신.

## 8 · 체크포인트 정책 (per memory `feedback_pixel_diff_per_page`)

- **CP1 (after C10):** 라이브 스크린샷 3 viewport.
- **CP2 (after CP1):** `.review/SLICE-3-20-pixel-diff.html` 리포트. 차이 항목 enum화 (token/spacing/hierarchy/typography/chrome). LOW 5↓ → PR 본문 명시. MEDIUM↑ → C11 폴리시 청크.
- **REV-1, REV-2:** Opus self-adversarial 2-cycle.

## 9 · Out of scope (재확인)

- Triage console (#21)
- 모든 composers (#21)
- 모든 edit 어포던스 (#21)
- Reporter pre-triage edit UI (#21)
- Bulk action bar (no BE support)
- CmdK 와이어링
- 전체 검색 (BE 없음)
- EntityHoverPreview (Slice 4)
- 실 LinkedEntityTrail node resolution (Slice 4)
- #55 시각 폴리시는 본 이슈 CP2 결과 봐서 통합 or 미루기

## 10 · Done definition

- 26 AC 체크
- CP2 pixel-diff 완료 + 사용자 컨펌
- REV 2-cycle 통과
- typecheck/test/build 클린
- PR 머지 + 이슈 닫힘 + 메모리 갱신
