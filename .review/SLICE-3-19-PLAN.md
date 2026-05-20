# SLICE-3 #19 — VOC Create UI · PLAN

**Owner:** main (orchestrator) · Opus design / Sonnet impl / Opus 2-cycle review
**Branch:** `feature/19-voc-create-ui` from `develop`
**Spec authority:** issue #19 본문 + `docs/frontend/specs/voc.md` §2/§3.4/§5.7/§5.8/§9
**Builds on:** #18 (shadcn baseline + RichEditor + design tokens + AppShell + apiClient + useIdempotencyKey + 3-shell), #50 (rate-limit toast inline wait), #52 (lib/api consolidation)

## 1. Goal

Reporter가 `/vocs?action=create`에서 VOC를 작성하고 POST `/vocs` 제출. 성공 시 `/vocs?view=inbox&selected=<id>` 이동.

## 2. Scope summary

이슈 본문이 컴포넌트 트리 + 폼 스키마 + 에러 매핑 + AC를 모두 lock. 본 PLAN은 청크 분할 + 의존성 + 위험 + 체크포인트만 추가.

## 3. 새 deps + 새 파일

**의존성 (apps/frontend):**
- `@hookform/resolvers` (zodResolver)

**신규 컴포넌트 위치:**
- `apps/frontend/src/features/voc/routes/CreateRoute.tsx`
- `apps/frontend/src/features/voc/components/create/VocCreateScreen.tsx`
- `apps/frontend/src/features/voc/components/create/SourceContextSegmented.tsx`
- `apps/frontend/src/features/voc/components/create/AttachmentDropzone.tsx`
- `apps/frontend/src/features/voc/components/create/ReporterCard.tsx`
- `apps/frontend/src/features/voc/components/create/SeverityDisclaimerCard.tsx`
- `apps/frontend/src/features/voc/components/create/rich-toolbar-voc-description.ts`
- `apps/frontend/src/features/voc/hooks/useMe.ts` (if not exists — `/me` query wrapper)
- `apps/frontend/src/features/voc/hooks/useVocCreateMutation.ts`

**packages/ui 신규 (두 슬라이스 이상 의존 예상):**
- `packages/ui/src/forms/FieldLabel.tsx` (export from barrel)
- `packages/ui/src/feedback/DirtyConfirmation.tsx` (export from barrel)

**선재 활용 (#18 산출물):**
- `RichEditor` (`@fops/ui`, surface=`'voc-description'`)
- `ManagedSystemPicker` (`@fops/ui`)
- `AnalyticsAreaPicker` — 파일 존재 / barrel 미노출 → barrel 추가
- `PageShell` (`@fops/ui`)
- shadcn primitives: Input, Tabs, Card, AlertDialog, Button, Tooltip
- apiClient / ApiError / errorMapper / useIdempotencyKey (`@/lib/api`)

**필요 자산 확인 필요:**
- `useMe()` hook — Slice 1에 있다 했으나 grep으로 미확인. 없으면 inline 작성.
- `toast` 인프라 — shadcn `<Toaster>` 또는 sonner. #18에서 설치 여부 미확인 → C0에서 점검.
- `emptyTipTapDoc()` 헬퍼 — `@fops/shared` 또는 RichEditor에서 export?

## 4. Chunk breakdown

순서대로 실행. 각 청크 끝 `pnpm -F @fops/frontend typecheck`, 적절 시 test.

| C# | 내용 | LOC추정 | 의존 |
|---|---|---|---|
| C0 | feature 브랜치 + `@hookform/resolvers` install + toast 인프라 점검/추가 + useMe 점검 + AnalyticsAreaPicker barrel 노출 | ~30 | - |
| C1 | `packages/ui` 신규 primitive 2개: FieldLabel + DirtyConfirmation + barrel export + 단위 테스트 | ~150 | C0 |
| C2 | `features/voc/components/create/SourceContextSegmented.tsx` (shadcn Tabs 기반) + `AttachmentDropzone.tsx` (visible+disabled) + `ReporterCard.tsx` + `SeverityDisclaimerCard.tsx` + `rich-toolbar-voc-description.ts` | ~250 | C1 |
| C3 | `features/voc/hooks/useVocCreateMutation.ts` — apiClient POST `/vocs` + Idempotency-Key + ApiError 분류 + react-query useMutation | ~80 | C0 |
| C4 | `features/voc/components/create/VocCreateScreen.tsx` — 2-col layout + 폼 스켈레톤 + react-hook-form + zodResolver + defaultValues | ~250 | C2/C3 |
| C5 | VocCreateScreen 폼 와이어링: title/description/picker/segmented/dropzone → form state; submit → mutation; onSuccess navigate; onError per-code dispatch (validation.failed field errors / 기타 toast) | ~150 | C4 |
| C6 | `features/voc/routes/CreateRoute.tsx` + `useBlocker` dirty-save 인터셉트 + DirtyConfirmation 마운트 | ~80 | C5 |
| C7 | `routes/_authed/vocs.tsx` — Placeholder/create 분기 → `<CreateRoute>` 마운트 (Slice 3 #18에서 placeholder만 있음) | ~10 | C6 |
| **CP1** | **Playground HTML 체크포인트** — `report/2026-05-20-voc-create-playground.html`: form 시각/UX 사용자 확인 | - | C7 |
| C8 | 통합 테스트: msw로 `/vocs` POST 모킹 → 201 happy path + 422 field error + 429 rate-limit + 409 idempotency reuse + 404 not-found + 409 archived | ~250 | C7 |
| C9 | 단위 테스트: SourceContextSegmented, AttachmentDropzone (drag/click no-op + toast), DirtyConfirmation flow | ~150 | C7 |
| **REV** | **2-cycle adversarial review** (Opus). cycle 1 → Sonnet 픽스 → cycle 2 → final | - | C9 |
| PR | PR open, manual screenshot vs prototype, squash-merge | - | REV |

**총 LOC 추정:** ~1400 (인덱스/테스트 포함)

## 5. 청크별 디스패치 모델

- C0/C7 inline (deterministic, 작음)
- C1 → Sonnet subagent (UI primitive + 테스트)
- C2 → Sonnet subagent (병렬화 가능: 4 컴포넌트 독립)
- C3 → Sonnet (hook + 테스트)
- C4/C5/C6 → Sonnet (sequential — 폼 핵심)
- C8/C9 → Sonnet (테스트)
- 매 청크 끝 Opus 리뷰 mini-checkpoint

## 6. 위험 + 알려진 미해결

1. **`useMe()` 존재 여부** — Slice 1에 있다 가정이나 grep 미확인. C0에서 확인. 없으면 inline.
2. **toast 인프라** — #18에서 sonner/shadcn-toast 설치됐는지 미확인. C0 점검.
3. **`@fops/shared` `vocCreateBodySchema` export 경로** — #13에 있음 가정. 경로/이름 변경 가능성. C3에서 확인.
4. **AnalyticsAreaPicker** — `packages/ui/src/components/AnalyticsAreaPicker.tsx` 파일 있으나 barrel 미노출. C0에서 추가.
5. **`emptyTipTapDoc()` 헬퍼** — 어디에 있는지 미확인. 없으면 `packages/ui/src/rich-content/`에 export 추가.
6. **`useBlocker` API 안정성** — TanStack Router v1 API 확인 필요.
7. **`rate_limited.*` retryAfter 인라인** — #50에서 `errorMapper`가 detail.retry_after_seconds 인라인하므로 추가 처리 불필요. ApiError.retryAfterSeconds 헤더값과 envelope.detail 값 동일 가정.

## 7. AC ↔ 청크 매핑

| AC | 청크 |
|---|---|
| `/vocs?action=create` 렌더 + E2E happy path | C7+C8 |
| PageShell 단위 테스트 | (#18 기존, 추가 변형 없음) |
| FieldLabel primitive + 테스트 | C1 |
| DirtyConfirmation primitive + 테스트 | C1+C9 |
| SourceContextSegmented value/onChange | C2+C9 |
| AttachmentDropzone visible+disabled + drag no-op | C2+C9 |
| `attachments: []` submit | C4 |
| Title/description validation | C4+C5+C8 |
| MS 픽커 + 로딩 + 빈상태 | C5 |
| AA 픽커 disabled until MS + race | C5+C8 |
| RichEditor `voc-description` 툴바 | C2+C5 |
| POST /vocs + Idempotency + navigate | C3+C5+C8 |
| 모든 에러 코드 매핑 통합 테스트 | C8 |
| Dirty-save modal flow | C6+C8 |
| ReporterCard + SeverityDisclaimer + no SimilarVOC | C2 |
| AppSidebar `+ New VOC` 동작 | (#18 기존 + C7 wire) |
| 초안 저장 없음 | C4 (의도적 미구현) |
| typecheck/lint/test/build clean | 매 청크 |

## 8. 체크포인트 정책

- **CP1 (after C7):** playground HTML — 사용자 시각 컨펌. 디자인 prototype `docs/design-prototype/screen-voc-create.jsx` vs impl 비교 권장.
- **REV-1:** Opus 자체 adversarial 리뷰 → `.review/SLICE-3-19-REVIEW-CYCLE-1.md`.
- **REV-2:** REV-1 픽스 후 두 번째 패스 → `.review/SLICE-3-19-REVIEW-CYCLE-2.md`.
- **PR 직전:** typecheck + 전체 FE 테스트 + (가능 시) dev 서버 띄워 brower 검증.

## 9. Out of scope (재확인)

- 실제 attachment upload (#22)
- proxy 서브필드 (#13 zod 없음)
- Save Draft (Slice 5+)
- Similar VOC 사이드바 (Slice 3+ Cluster API)
- MS 픽커 eligibility 정교화 (Slice 3+)
- Reporter pre-triage edit UI (#17 BE 있음 / UI는 #20 또는 별도)

## 10. Done definition

- 모든 AC 체크
- 2-cycle 리뷰 통과
- typecheck/test/build 클린
- PR 머지 + 이슈 닫힘
- 메모리 갱신
