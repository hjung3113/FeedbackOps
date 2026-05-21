# Badge Consumers Visual Audit — Post PR #59

**Date:** 2026-05-21  
**Branch:** `feature/post-pr59-doc-sync`  
**Baseline commit:** `019431a` (PR #59 squash-merge on `develop`)  
**Scope:** Visual verification of `ReporterStatusBadge` cyan-tint pill across all dense consumer surfaces.

---

## Captures

| File | Dimensions | Surface |
|---|---|---|
| `.review/baselines/captured/voc-detail-post-pr59.png` | 1440×900 | Full page — inbox view with detail panel open |
| `.review/baselines/captured/voc-detail-panel-post-pr59.png` | 440×900 | Detail panel element-clip only |
| `.review/baselines/captured/badge-consumers-inbox-post-pr59.png` | 708×96 | Inbox rows (VocRow) |
| `.review/baselines/captured/badge-consumers-triage-rows-post-pr59.png` | 706×850 | Triage queue rows (TriageRow) |
| `.review/baselines/captured/badge-consumers-triage-post-pr59.png` | 1440×2133 | Full triage console full-page |
| `.review/baselines/captured/badge-consumers-timeline-post-pr59.png` | 424×204 | Conversation timeline entries |

VOC used for detail panel: `VOC-SEED-02` (`9705f226-c1b1-5a0c-854a-df9ffaac265b`), `reporter_facing_status: reviewing`.

---

## Per-Consumer Assessment

### 1. `IdentitySection` — detail panel meta line (hero surface)

**File:** `apps/frontend/src/features/voc/components/detail/IdentitySection.tsx:61`  
**Layout:** `xl` title heading (20px bold) → `검토 중 · Mock Admin · 18시간 전` meta line directly below.  
**Assessment:** CORRECT. The pill is the primary visual anchor on the meta line. Tinted background (`rgb(var(--status-reporter-reviewing) / 0.14)`) + colored dot reads unambiguously as a status at a glance. The `px-2.5 py-1` pill is proportionate to the `text-xl font-bold` heading above it. No visual noise — this is the surface the fix was designed for.  
**Verdict:** no change needed.

### 2. `VocRow` — inbox list rows (dense)

**File:** `apps/frontend/src/features/voc/components/list/VocRow.tsx:122,129`  
**Layout:** `h-15` (60px) row. The badge sits in a `flex items-center gap-2 text-xs text-text-muted flex-wrap` meta row beneath the title, alongside `display_id` (mono), `ManagedSystemPill`, and optionally "Owner 없음".  
**Assessment:** ACCEPTABLE. The captured inbox screenshot (`badge-consumers-inbox-post-pr59.png`) shows two rows at 708×96 (two rows ×48px each). The pill is small (`text-xs`, `py-1` = ~20px tall), and in the meta row it reads as one of several secondary chips. The cyan tint is mild enough not to visually dominate. The row does not feel cluttered.  
**One potential concern:** when all three secondary items appear simultaneously (display_id + pill + ManagedSystemPill + "Owner 없음"), the meta row has 4 pieces of information in `text-xs`. The tinted pill separates status visually from the plain-text muted items — this is actually beneficial, not noisy.  
**Verdict:** pill is fine at current emphasis in this context. No change needed.

### 3. `TriageRow` — triage queue rows (dense, 96px)

**File:** `apps/frontend/src/features/voc/components/triage/TriageRow.tsx:118`  
**Layout:** `min-h-[96px] py-3.5 px-5`. The badge sits in the `.row-meta` line (`flex items-center gap-2 text-[12px] text-text-muted flex-wrap`) alongside optional "Area 미지정", "Owner 없음", and similar-count indicator.  
**Assessment:** ACCEPTABLE. The `badge-consumers-triage-rows-post-pr59.png` capture shows both seeded rows (`VOC-SEED-09` and `VOC-SEED-01`) at 706×850. Both rows show `접수됨` status. The pill appears at 12px effective context — slightly larger visual weight than `text-xs text-text-muted` adjacent items, but that is correct: status is more important than "Owner 없음" in a triage queue. The 96px row height provides enough vertical room; no spillover observed.  
**Potential concern flagged in POST-PR59-AUDIT B1:** A row carrying `severity color bar + display_id + reporter avatar + Owner/Area meta + status pill` could feel crowded. The seed data does not include a reporter avatar in the captured rows (avatar placeholder is absent), so full crowding is not visible in this baseline. However the triage row already lacked an avatar column in the current implementation (`TriageRow.tsx` renders no avatar), so this is not an active issue.  
**Verdict:** pill is fine. No change needed.

### 4. `TimelineEntry` — conversation timeline (dense inline)

**File:** `apps/frontend/src/features/voc/components/detail/TimelineEntry.tsx:68,72`  
**Layout:** The `badge-consumers-timeline-post-pr59.png` (424×204) shows a public-update timeline entry for VOC-SEED-02: `접수됨 → 검토 중` status change. Both the "from" and "to" statuses render as `ReporterStatusBadge` pills inline.  
**Assessment:** INTENTIONALLY PROMINENT. The timeline entry for a status-change event specifically surfaces the transition — two side-by-side pills with an arrow (`→`) between them. This is `ReporterStatusChangeBlock`, not `TimelineEntry` body text. The tinted pills make the status transition visually distinct from surrounding prose. This is desirable — exactly what the pill treatment was designed for.  
**Verdict:** correct. No change needed.

### 5. `ReporterStatusChangeBlock` — status-change block (current + next side-by-side)

**File:** `apps/frontend/src/features/voc/components/detail/ReporterStatusChangeBlock.tsx:167,251`  
**Assessment:** Not separately captured (captured as part of the detail panel full-page). The `접수됨 → 검토 중` pair visible in the timeline confirms the pill renders clearly. Both pills use their respective status token colors.  
**Verdict:** correct. No change needed.

### 6. `ComposerPublicPreview` — reporter preview card

**File:** `apps/frontend/src/features/voc/components/detail/ComposerPublicPreview.tsx:113`  
**Layout:** The detail panel full-page capture shows the preview card at the bottom of the composer section with `VOC-SEED-02` and `검토 중` pill.  
**Assessment:** The pill in the preview card mirrors what the reporter sees in their inbox — this is the right emphasis level.  
**Verdict:** correct. No change needed.

---

## Overall Verdict on `tone='quiet'` API

**Recommendation: DO NOT add `tone='quiet'` API at this time.**

**Rationale:**

1. **No visual evidence of noise.** Across all six consumer surfaces reviewed, the cyan-tint pill at `0.14` opacity is visually moderate. It is not dominant enough to compete with title text or severity color bars. It reads clearly as a status datum without overwhelming the row.

2. **Functional role is consistent.** In every consumer context — hero meta line, dense row, timeline entry, preview card — the status badge's job is to communicate reporter-facing state at a glance. The tinted pill achieves this uniformly. Stripping the background in "quiet" mode would reduce scanability in list rows where status is one of the first things a triager needs.

3. **The 60px inbox row is not crowded.** `VocRow` at `h-15` (60px) carries the badge in a `flex-wrap` meta row. If the row becomes crowded from additional chips, the correct fix is row-level layout (wrapping is already enabled), not reducing badge visibility.

4. **The 96px triage row has room.** `TriageRow`'s expanded height (`min-h-[96px]`) was deliberately sized for the full meta row content. No spillover observed.

5. **Premature API surface.** Adding `tone` as a prop today would require updating 7 call sites, deciding which deserve `quiet` vs `bold`, and documenting the decision — all before any evidence of visual regression. The YAGNI principle applies.

**When to revisit:** If a future slice adds an avatar column to `TriageRow`, making the row layout materially more crowded, re-capture and re-evaluate. If the triage row's `flex-wrap` meta row wraps to 3 lines in practice, consider `tone='quiet'` for `TriageRow` specifically (not globally).

---

## Related files

- `.review/POST-PR59-AUDIT.md` — B1 finding that triggered this audit
- `.review/baselines/CAPTURE-INSTRUCTIONS.md` — capture workflow reference
- `packages/ui/src/badges/ReporterStatusBadge.tsx` — badge implementation
- `apps/frontend/src/features/voc/components/list/VocRow.tsx` — inbox row consumer
- `apps/frontend/src/features/voc/components/triage/TriageRow.tsx` — triage row consumer
- `apps/frontend/src/features/voc/components/detail/TimelineEntry.tsx` — timeline consumer
