# Panel Section Rhythm — V1b document axis

## Source

- **Critique:** `.review/VOC-DETAIL-CRITIQUE.md` → P1 #1 (section rhythm root cause:
  `PanelSectionTitle` shipped with `border-t pt-4 pb-2`, breaking prototype rhythm).
- **Live mode selection:** session `eba93c71` variantId=1 ("document" axis) with
  paramValues `{density: "snug", nav-style: "underline"}`. The retry session
  `627a9c1e` expressed the same V1b document intent (carry-over freeform: 섹션 간
  수평선 제거 + typography 로 구분 + 타이틀 작게, prototype detail 참고).
- **`nav-style` param:** belongs to V3 axis; treated as accidental panel-confusion
  and ignored. Intended pick = V1b "document" with `density=snug`.

## Resolution (permanent source)

- `packages/ui/src/panel/PanelSectionTitle.tsx`
  - **Removed:** `border-t`, `border-border-subtle`, `pt-4`, `pb-2`, `px-4`.
  - **Added:** `mb-3.5` (14px bottom rhythm).
  - **Changed:** `font-medium` → `font-semibold`.
  - Result: borderless typographic-only section header.
- `packages/ui/src/panel/PanelTitleBlock.tsx`
  - `text-xl font-semibold` → `text-lg font-semibold tracking-tight`.
  - Compact title block per V1b document axis.
- `apps/frontend/src/features/voc/components/triage/TriagePanel.tsx`
  - All impeccable live-mode plumbing stripped (both sessions `eba93c71`
    and `627a9c1e`): variants blocks, `<style data-impeccable-css>`, every
    `data-impeccable-*` attribute, every `impeccable-variants-start/end`
    comment.
  - Overview/title block: `mb-6` → `mb-8` to match prototype `.panel-section`
    rule (32px between sections).
  - `grep -c impeccable` on the file = **0**.

## Scope

- `VocDetailPanel.tsx` consumes the shared `PanelSectionTitle`, so the borderless
  rhythm propagates automatically across `DescriptionSection`, `IdentitySection`,
  `LinkedEntityTrailSection`, `LinkedExecutionSection`, `TriageBlock`,
  `ConversationTimeline`, and the triage `ClusterSectionReadOnly`.
- No raw hex, no raw px outside Tailwind spacing scale (`mb-3.5` = 14px, in scale).
- Pack 17 semantic tokens only.

## Verification

- UI suite: 365 tests passing (includes restored `PanelSectionTitle.test.tsx`
  asserting borderless rhythm).
- FE suite: 391 tests passing.
- Typecheck: clean.
- Vite production build: clean (`vite build` succeeds, no JSX/babel errors).

## PR status

- Committed on feature branch `feature/v1-inline-kicker-triage`.
- **No PR opened.** User requested wait — work is committed locally, push deferred.

---

## Related

- **`.review/TITLE-BLOCK-RESTORE.md`** — documents the title-block + BODY-card restore that
  shipped alongside this rhythm fix in PR #59; xl title variant, IdentityMetadataStrip,
  DescriptionSection body card.
- **`.review/PIXEL-MATCH-TITLE-BLOCK.md`** — pixel-match iteration log that confirmed the
  restored title-block visual contract after the rhythm fix landed.
- **`.review/CHUNK-DEVIATIONS-V1-KICKER.md`** — deviation log for the V1 inline kicker (same PR);
  records ShellHeader removal and kicker label tracking decision.
- **`.review/POST-PR59-AUDIT.md`** — full post-merge audit of PR #59; B3 is the PanelSectionTitle
  borderless consumer sweep confirming no layout regressions at callsites.
- **`.review/VOC-DETAIL-CRITIQUE.md`** — original UX critique; P1 #1 (section rhythm broken) is
  the finding this document resolves. See status snapshot for ADDRESSED confirmation.
