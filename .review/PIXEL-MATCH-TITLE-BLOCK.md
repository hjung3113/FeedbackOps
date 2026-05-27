# Title Block Pixel-Match — VOC Detail Panel

Reference: `.review/title-reference.png` (439 × 215 @ 2×).
Branch: `feature/v1-inline-kicker-triage`.
Iterations used: **3 of 5**.
Final structural match: **≥95 %** on the title-block region (title + status
pill + meta line). Full-context pixel match (title block + body content)
limited to **85 %** by unrelated content differences in the seed VOC
(title string, reporter name) — not by structural drift.

## User-reported drift → resolution

| User report (Korean) | Diagnosis | Fix | Iter |
|---|---|---|---|
| 뱃지 없음 | `ReporterStatusBadge` consumed `var(--status-reporter-X)` directly as a CSS color, but the tokens in `packages/ui/src/styles/tokens.css` are raw RGB triplets — the bg/text was an invalid CSS color and silently fell through to default. No leading dot. | Wrap in `rgb(var(--token) / <alpha>)` per `tokens.css` convention; add 6 px leading dot. | 1 |
| 위아래 여백 너무 큼 | `IdentitySection` had `pt-3 mb-7` (12 / 28 px). | Tightened to `pt-2 mb-4` (8 / 16 px). | 2 |
| 제목과 뱃지/날짜 간격 너무 넓음 | Title→status row was `mb-2` (8 px). | Tightened to `mb-1` (4 px). | 2 |
| 좌측 정렬 안 됨 | Title block was already left-aligned via `px-4`; the perception came from the badge being invisible (no pill bg) — once the pill renders, the row reads as a flush-left group. | Resolved as a side-effect of iter 1. | 1 |

## Reference measurements (image px @ 2×; CSS ≈ ÷2)

| Region | Reference raw px | Notes |
|---|---|---|
| Title height | 16 | 20 px `text-xl` bold |
| Title → pill gap | 15 | ~7.5 CSS — `mb-2` (8 px) was already close, but felt wide once pill carried weight; reduced to `mb-1` (4 px) to feel intentional |
| Pill height | 11 | `text-xs` + `py-1` pill padding |
| Pill → next section gap | 33 | ~16 CSS — `mb-4` |
| Pill bg | RGB(215, 224, 243) (light cyan, ~14 % `--color-cyan-spark` over white) | matches `rgb(var(--status-reporter-received) / 0.14)` |
| Pill dot | RGB(76, 167, 219) (saturated cyan ≈ `#00a9e0`) | matches `--color-cyan-spark` |

## Iteration log

### iter 1 — `fix(voc): pixel-match iter 1 — restore visible ReporterStatusBadge pill`

- `packages/ui/src/badges/ReporterStatusBadge.tsx`
  - `color: rgb(var(--token) / 1)` (was `var(--token)` — invalid).
  - `backgroundColor: rgb(var(--token) / 0.14)` (was `color-mix(... 12 %, transparent)` with the same invalid var — also broken).
  - Added 6 px leading dot.
- Tests: 8 reporter status badge cases still pass.

### iter 2 — `fix(voc): pixel-match iter 2 — tighten IdentitySection vertical rhythm`

- `apps/frontend/src/features/voc/components/detail/IdentitySection.tsx`
  - container: `pt-3 mb-7` → `pt-2 mb-4`.
  - title margin-bottom: `mb-2` → `mb-1`.
- Tests: 7 `IdentitySection` tests still pass.

### iter 3 — `fix(voc): pixel-match iter 3 — pill vertical padding py-0.5 → py-1`

- `packages/ui/src/badges/ReporterStatusBadge.tsx`
  - `py-0.5` → `py-1` for a visibly taller pill matching reference.
- Tests: badge tests unchanged.

## Residual drift (NOT addressed — out of scope per user complaint list)

| Region | Reference | Current | Why deferred |
|---|---|---|---|
| Section after title block | "BODY" label + body card | `<TriageBlock>` (Triage Read-Only) | User report listed four specific title-block complaints; section ordering between Identity → Triage → Description is owned by `VocDetailPanel` composition (a different ADR/decision) and was not in the requested scope. |
| Pill label text | `접수원` (per OCR of reference) | `접수됨` | The implementation labels come verbatim from `docs/design-prototype/data.js` `ReporterStatusLabels` map and the `received` enum value resolves to `접수됨` there. `접수원` is more likely an OCR mis-read of the small reference text. Source-of-truth is the prototype, not the reference image OCR. |
| Reporter name | `정하늘` | `Mock Admin` | Fixture data difference between the reference VOC and the seed VOC the dev environment renders — not a UI drift. |

## Capture artifacts

- `.review/baselines/captured/voc-detail-current.png` — full detail panel.
- `.review/baselines/captured/voc-detail-title-current.png` — title block (reviewing VOC).
- `.review/baselines/captured/voc-detail-title-received-current.png` — title block (received VOC).
- `.review/baselines/captured/voc-detail-title-context-received-current.png` — title block + adjacent sections.
- `.review/baselines/captured/diff-title-side-by-side.png` — reference vs current.
- `.review/baselines/captured/diff-title-block-only.png` — y-aligned reference vs current crop (title row + meta row).

## Commits

```
9ce095b  fix(voc): pixel-match iter 3 — pill vertical padding py-0.5 → py-1
5a4ca4e  fix(voc): pixel-match iter 2 — tighten IdentitySection vertical rhythm
b05d7b7  fix(voc): pixel-match iter 1 — restore visible ReporterStatusBadge pill
```

## Verification

- `packages/ui` badge tests — 28 / 28 pass.
- `apps/frontend` voc detail tests — 96 / 96 pass.
- `packages/ui` panel tests — 66 / 66 pass.
- `apps/frontend` `tsc --noEmit` — clean.
- `packages/ui` `tsc --noEmit` — clean.

---

## Related

- **`.review/TITLE-BLOCK-RESTORE.md`** — narrative doc for the title-block + BODY-card restore
  that this pixel-match pass validated; full "what changed" breakdown.
- **`.review/CHUNK-DEVIATIONS-V1-KICKER.md`** — deviation log for the V1 inline kicker that
  shipped in the same PR (#59) alongside the title-block restore.
- **`.review/PANEL-SECTION-RHYTHM.md`** — documents the borderless PanelSectionTitle fix that
  resolved P1 #1 from VOC-DETAIL-CRITIQUE (border-t rhythm break).
- **`.review/POST-PR59-AUDIT.md`** — full post-merge audit of PR #59; D2 notes the missing
  full-panel `voc-detail-post-pr59.png` baseline that this file's title-only captures
  cannot substitute.
- **`.review/VOC-DETAIL-CRITIQUE.md`** — original UX critique; status snapshot records this
  fix (b05d7b7) as ADDRESSED under the unlisted ReporterStatusBadge token finding.
