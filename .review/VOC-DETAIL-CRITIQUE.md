# VOC Detail Panel — Design + UX Critique

---

## Status snapshot — 2026-05-21 post-PR-59

PR #59 (`019431a`, squash-merged on `develop`) addressed the section-rhythm root cause and
several visual contract items. This snapshot maps each original P1 finding to its current state.
The original findings below are preserved unchanged.

| Finding | Original text (short) | Status | Detail |
|---|---|---|---|
| P1 #1 | PanelSectionTitle `border-t` breaks section rhythm | **ADDRESSED** | `PanelSectionTitle` now ships borderless `mb-3.5`. Commit `c180bfe` (PANEL-SECTION-RHYTHM resolution). |
| P1 #2 | NextActionFooter renders permanently `disabled` primary CTA | **OPEN** | Hard-coded `disabled` still present in `NextActionFooter.tsx:41-45`. Not in PR #59 scope. |
| P1 #3 | `border-b-accent-info` token risk — composer tabs reply accent | **OPEN** | Token presence unverified. Not in PR #59 scope. |
| P1 #4 | Composer body has no surface-allowlist left-edge accent | **OPEN** | No left-edge accent added in PR #59. Timeline entries also still lack per-surface border-left. |
| P1 #5 | TriageBlock "(Read only)" label — anti-pattern copy | **OPEN** | `TriageBlock.tsx:19` still reads `트리아지 (Read only)`. Not in PR #59 scope. |
| (unlisted) | `ReporterStatusBadge` token bug — bare `var(--token)` CSS color | **ADDRESSED** | `rgb(var(--token) / α)` wrap applied. Commit `b05d7b7`. Rendered pill now shows cyan-tint background + leading 6px dot. This fix was NOT in the original critique; it was discovered during the title-block pixel-match pass. |
| P2 Title typography | Title drifts from prototype (`text-xl` vs 17px prototype) | **ADDRESSED (direction changed)** | After review of `.review/title-reference.png` the xl 20px bold direction was chosen (not revert to 17px). `size='lg'` preserves 17px for other surfaces; `size='xl'` (VOC detail + triage) renders 20px bold. The original critique proposed reverting to 17px; the reference image overrode that recommendation. |

**Remaining open P1s:** #2, #3, #4, #5 — none were in PR #59 scope.

---

**Target:** `apps/frontend/src/features/voc/components/detail/` (Slice 3 #20 + #21)
**Prototype baseline:** `docs/design-prototype/screen-voc.jsx:180-505`, `docs/design-prototype/styles.css:1458-2083`
**Visual reference:** `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png` and `voc-inbox-detail-full.png`
**Impl capture:** `.review/baselines/captured/voc-detail-composer.png` (pre-V1 kicker)
**Register:** product
**Score:** 31 / 55 average (2.8 / 5)

---

## Score Summary

| # | Dimension | Score | Rationale |
|---|-----------|------:|-----------|
| 1 | Information density | 2 | Section titles eat `pt-4 pb-2 + border-t` per section; the prototype runs every section flush with `margin-bottom: 32px` and no separator. Each section sits ~16px taller than spec, the panel reads as 7 disconnected slabs instead of one dense list. |
| 2 | Hierarchy | 3 | Title block is correct (h2 + badges), but Triage / Description / Conversation each get identical 12px uppercase headers, so the eye finds no anchor between "what is this VOC" and "what do I do". |
| 3 | Section rhythm | 2 | Prototype: `.panel-section { margin-bottom:32px }` + `.panel-section-title { margin:0 0 14px }`. Impl: PanelSectionTitle uses `px-4 pt-4 pb-2 border-t`, no bottom margin, then sections collide. Margins are arbitrary — `mt-2.5`, `mb-2`, `gap-3`, `mb-1.5` appear without a scale. |
| 4 | Typography | 3 | Title is `text-xl` (20px) — prototype `.panel-title` is `var(--text-lg)` = 17px. Reporter avatar copy uses `text-[11px]` and `text-[10px]` raw arbitrary values (ReporterStatusChangeBlock.tsx:203, :254). Body composer footer button text is 12px / `font-semibold` but submit is `h-7 px-3` — slightly under prototype `padding 10px 12px`. |
| 5 | Color | 2 | Multiple raw inline rgba in ReporterStatusChangeBlock.tsx:145-147, :204, :255 (`rgb(var(--color-neon-lime) / 0.04)` uses the raw `--color-neon-lime` var, against AGENTS.md "consume semantic tokens" rule). NextActionFooter primary button is disabled by default (`disabled` is hard-coded line 42) and renders as a faded chip — the brand-blue CTA is invisible. |
| 6 | Affordances | 2 | Triage block shows "(Read only)" label but offers no edit hint at all (TriageBlock.tsx:19) — prototype shows '변경' buttons inline (screen-voc.jsx:210). DescriptionSection's 수정 button is a tiny underlined text link (DescriptionSection.tsx:56) — under-styled compared to the prototype `btn btn-ghost btn-sm` pattern. ComposerSection ships a duplicate 닫기 X on dirty draft (ComposerSection.tsx:142-153) — second close button never present in prototype. |
| 7 | States | 3 | Skeleton + 404 + summary-permission + dirty-confirm + DetailPanelNotFound all present (VocDetailPanel.tsx:67-122). Missing: partial-data state when conversation_timeline returns `[]`, network-error state collapses to a single sentence `데이터를 불러오지 못했습니다.` (VocDetailPanel.tsx:87) with no retry CTA and no error code — violates "Trust by receipt" / "speak the request path." |
| 8 | Composer surface allowlists | 3 | Tab accent borders are wired (ComposerTabs.tsx:48-67: `border-b-accent-primary` / `border-b-accent-info` / `border-b-status-reporter-assigned`). But the composer body itself has NO left-edge accent (prototype `.timeline-content.public-update { border-left: 2px solid var(--color-neon-lime) }` analog) — only the tab strip differentiates. Once the user types, the surface is colorless. |
| 9 | Reporter preview card | 4 | ReporterStatusChangeBlock.tsx:235-306 mirrors prototype:604-654 closely; Korean copy is verbatim including '방금', '업데이트', '첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다.' Footer shield icon + border-top match. Only drift: `display_id` font is `font-mono` className while prototype uses `.row-id` (mono 11px tracking-wider). |
| 10 | Accessibility | 3 | DetailPanelHeader has `aria-label="패널 닫기"` + ARIA close (good). ComposerTabs uses `role="tablist"` + `aria-selected` (good). Gaps: NextActionFooter.tsx button has no `aria-describedby` for the "+N more" hint; ReporterStatusChangeBlock arrow `→` glyph is `aria-hidden` (correct) but the picker change has no live-region announcement; TriageBlock "Owner 없음" uses `text-feedback-error` but no `role="status"`. |
| 11 | Prototype fidelity | 2 | Section nav exists (DetailPanelSectionNav) and order matches, but: section structure flattened (no `panel-section` wrapper class, no 32px vertical rhythm); ConversationTimeline uses shadcn `Tabs` (ConversationTimeline.tsx:36) where prototype renders BOTH public+internal as separate vertical sections (screen-voc.jsx:350-398). This is a structural deviation, not a translation. |

**Average:** 2.8 / 5 → Band: "ships, but reads as scaffolding"

---

## Anti-Slop Check

- **First-order category reflex:** Mostly clean. Looks like an internal feedback ops console — not a SaaS marketing page.
- **Absolute bans:** No gradient text, no glassmorphism, no hero metric. The `DetailPanelHeader` 4px left accent stripe (DetailPanelHeader.tsx:50-53) is a borderline side-stripe — but it's keyed off entity kind, semantic not decorative; acceptable.
- **Identical card grids:** N/A (single-pane).
- **Modal-as-first-thought:** EditDescriptionModal is correct (reporter pre-triage edit is genuinely a focus task), but ReporterReply/PublicUpdate previews open in PreviewModal — defensible because the reporter-facing preview is a distinct safety surface.
- **Em-dash ban in shipped UI copy:** ✅ No em dashes found in user-facing Korean strings. Docs/comments use them freely (allowed). One soft hyphen `—` appears in PreviewModal title `"Public update — Reporter preview"` (PublicUpdateComposer.tsx:271) — that is English ops-internal wording, marginal but acceptable.

---

## Findings

### P1 — Section rhythm broken; PanelSectionTitle re-anchors every section to a new border-t

**File:** `packages/ui/src/panel/PanelSectionTitle.tsx:12-15`
**Prototype:** `styles.css:1543-1556` — `.panel-section { margin-bottom: 32px }`, `.panel-section-title { margin: 0 0 14px }`, NO border, NO uppercase chrome at section top.
**Impl:** `'text-xs font-medium uppercase tracking-wide text-text-muted px-4 pt-4 pb-2 border-t border-border-subtle'` — every section title carries a top border + 16px pt + 8px pb. With 7 sections that's ~70px of decoration vs prototype's 7×32=224px of rhythm.
**Fix:** Remove `border-t` and convert padding to `mb-3.5` (14px). Wrap each section in `<section className="px-4 mb-8">` (32px). The border belongs on the section nav strip, not per-section.

### P1 — NextActionFooter renders a permanently disabled primary action

**File:** `apps/frontend/src/features/voc/components/detail/NextActionFooter.tsx:41-45`
**Quote:** `<Button variant="default" size="sm" disabled>{primaryAction.label}</Button>`
**Prototype:** `screen-voc.jsx:474-484` — primary action is alive: `<Button variant="primary" className="btn-block">…Create finding</Button>`.
**Why P1:** The sticky bottom footer is the panel's single most important CTA (the brand-blue Samsung accent). Shipping it `disabled` makes the eye skip it and breaks the brand promise that one primary action per panel is obvious.
**Fix:** Drop `disabled`. Wire mutation availability through `primaryAction.available` (already present in the type). For Slice 3 the action is a no-op-with-toast, not a dead button.

### P1 — `border-t-accent-info` references a Tailwind utility that does not match the prototype reply accent

**File:** `apps/frontend/src/features/voc/components/detail/ComposerTabs.tsx:58`
**Prototype:** `styles.css:2034` — `.composer-tab.active.reply { border-bottom-color: var(--color-cyan-spark); }`
**Impl:** `border-b-accent-info` — fine if `accent-info` maps to cyan-spark in the Tailwind preset, but the prototype-to-pack17 table (`.review/PROTOTYPE-TO-PACK17.md:49`) only guarantees `text-accent-info` / `text-status-reporter-received`. There is no explicit `border-accent-info` token. Risk: silent fallback to default border color.
**Fix:** Verify `packages/ui/tailwind.preset.ts` exposes `borderColor: { 'accent-info': 'var(--color-cyan-spark)' }`. If not, replace with arbitrary `border-b-[var(--color-cyan-spark)]` or add the token.

### P1 — Composer body has no surface-allowlist visual cue once a tab is selected

**File:** `apps/frontend/src/features/voc/components/detail/ComposerSection.tsx:160-191`
**Prototype:** Prototype tab-border is the only cue too — but the prototype's three `.timeline-content.public-update/.reporter-reply/.internal` classes carry a left-edge accent on every conversation entry, reinforcing the visual rule "lime = reporter sees, cyan = reporter sees direct, violet = team only." Impl ConversationTimeline does not apply those border-left treatments to timeline entries either (PublicTimeline / InternalTimeline render plain entries).
**Fix:** Add a 2px left-edge accent to the composer body wrapper keyed off `activeTab`: lime for public, cyan for reply, violet for internal. Mirror on `TimelineEntry`. The "Reporter-facing vs internal copy are physically separate surfaces" Product Invariant collapses without this cue.

### P1 — TriageBlock label "(Read only)" is anti-pattern, no edit path, no transition arrow

**File:** `apps/frontend/src/features/voc/components/detail/TriageBlock.tsx:19`
**Quote:** `<PanelSectionTitle>트리아지 (Read only)</PanelSectionTitle>`
**Prototype:** `screen-voc.jsx:206` — `<PanelSectionTitle>Triage</PanelSectionTitle>` with inline 변경 buttons on Owner / Analytics Area rows.
**Why P1:** "(Read only)" is a developer apology in section copy, exactly what PRODUCT.md "No marketing fluff. … Permission-limited content speaks the request path, not the blank failure" forbids. The reader doesn't need the implementation status; they need either an action or a permission-blocked explanation.
**Fix:** Title back to `트리아지`. For each row that the actor cannot edit due to permission, render the `<PermissionBlockedPanel>` summary stub. For Slice 3 (where edit is genuinely deferred), append nothing — the deferred edit will arrive in #22.

### P2 — Title typography drifts from prototype

**File:** `packages/ui/src/panel/PanelTitleBlock.tsx:13`
**Impl:** `text-xl font-semibold` (20px / 600).
**Prototype:** `styles.css:1561-1568` — `font-size: var(--text-lg)` (17px), `font-weight: 600`, `letter-spacing: var(--tracking-tight)`, `line-height: 1.35`.
**Fix:** Change to `text-[17px] leading-[1.35] tracking-tight font-semibold`. The 3px delta sounds tiny but at 440px panel width with a long Korean title it forces an extra wrap line on most VOCs.

### P2 — Two close buttons on dirty draft

**File:** `apps/frontend/src/features/voc/components/detail/ComposerSection.tsx:142-153`
**Quote:** an additional `X` icon button is rendered above the composer tabs when `onCloseRequest` is provided.
**Prototype:** No such button. Panel close lives ONLY on the DetailPanelHeader at the top.
**Why P2:** Two close affordances in one surface is a discoverability sin; the user reaches for the bottom one and the panel closes but the upper composer X already exists to close the composer-only state.
**Fix:** Remove the composer-internal close button (lines 142-153). Dirty intercept is already routed through `onDirtyChange` → `VocDetailPanel.handleClose` → `DirtyConfirmation`.

### P2 — Section anchor `internal` renders an empty div

**File:** `apps/frontend/src/features/voc/components/detail/VocDetailPanel.tsx:201`
**Quote:** `<div data-anchor="internal" />`
**Why P2:** Clicking the "Internal" tab in DetailPanelSectionNav scrolls to a zero-height element. The actual internal timeline is buried inside `ConversationTimeline`'s shadcn Tabs (ConversationTimeline.tsx:48), so the scroll lands nowhere useful AND the tab is closed by default.
**Fix:** Either (a) split ConversationTimeline back into two stacked sections matching prototype:382-398 (recommended — prototype layout, no tab dead-end), or (b) make the section nav drive the inner Tabs state via context. Path (a) is the prototype-fidelity move.

### P2 — Raw `text-[10px]` / `text-[11px]` arbitrary sizes break the Pack 17 type scale

**File:** `ReporterStatusChangeBlock.tsx:203, 254`
**Quote:** `'… text-[11px] font-medium text-accent-primary'`, `'… text-[10px] font-medium text-accent-primary'`
**Pack 17 scale:** caption 10px / body 14px / text-xs 12px / text-sm 13px. The arbitrary `text-[10px]` matches `--text-caption` (DESIGN.md:63) — use the token. `text-[11px]` is off-scale entirely.
**Fix:** Replace `text-[11px]` with `text-xs` (12px) and `text-[10px]` with `text-caption`. Both align to DESIGN.md Inter Variable sizes.

### P2 — `--color-neon-lime / 0.04` uses raw color var, not semantic accent

**File:** `ReporterStatusChangeBlock.tsx:145, 146, 204, 255`
**Quote:** `background: 'rgb(var(--color-neon-lime) / 0.04)'` × 3
**Rule:** `.review/PROTOTYPE-TO-PACK17.md:14-21` — "Components MUST consume semantic tokens." The accent IS `accent-primary`.
**Fix:** Use `bg-accent-primary/[0.04]` (Tailwind arbitrary opacity) or define a `--accent-primary-soft` token and consume it. Same for the `/0.16` and `/0.18` variants — they're already in PROTOTYPE-TO-PACK17.md §4.

### P2 — ConversationTimeline replaces vertical sections with horizontal tabs

**File:** `apps/frontend/src/features/voc/components/detail/ConversationTimeline.tsx:36-55`
**Prototype:** `screen-voc.jsx:349-398` — public conversation and internal discussion are two separate `panel-section` blocks stacked vertically. The visual rule is that the public surface is ALWAYS visible (the audit trail) and the internal discussion sits below it.
**Impl:** `<Tabs defaultValue="public">…<TabsTrigger value="internal">내부</TabsTrigger>` — hides internal traffic by default and replaces the prototype's stacked rhythm with a tab toggle.
**Why P2:** This contradicts "Trust by receipt — separate state machines" (PRODUCT.md line 75): both surfaces should be present simultaneously so the audit trail is uninterrupted. Tabs are a space-saving cheat that hides half the audit.
**Fix:** Render `PublicTimeline` and `InternalTimeline` as two stacked sections with their own `PanelSectionTitle` ("Reporter-visible conversation" / "Internal discussion") and badge action slot, matching prototype:350-398 verbatim.

### P3 — Error envelope shows no code, no retry

**File:** `VocDetailPanel.tsx:85-90`
**Quote:** `<p className="text-sm text-feedback-error">데이터를 불러오지 못했습니다.</p>`
**Why P3:** No retry button, no error code, no permission-blocked path. PRODUCT.md "Permission-limited content speaks the request path, not the blank failure."
**Fix:** Render the standard `<EmptyState>` (already in `@fops/ui`) with a "다시 시도" CTA and dump the error code in monospace below.

### P3 — DescriptionSection edit affordance is invisible

**File:** `DescriptionSection.tsx:53-58`
**Quote:** `className="mt-1 text-xs text-text-muted underline hover:text-text-primary transition-colors"`
**Why P3:** A muted underlined `설명 수정` link at 12px under a card. Prototype `btn btn-ghost btn-sm` would render as a proper button.
**Fix:** Promote to `<Button variant="ghost" size="sm">설명 수정</Button>` placed in a `<PanelSectionTitle action={…}>` slot.

### nit — PreviewModal title uses em-dash in English copy

**File:** `PublicUpdateComposer.tsx:271`, `ReporterReplyComposer.tsx:207`
**Quote:** `title="Public update — Reporter preview"`
**Note:** PRODUCT.md "No em dashes inside UI strings." English domain term + em-dash + English subtitle is still UI copy. Use a vertical bar or colon: `Public update · Reporter preview`.

### nit — `flex flex-col gap-4 p-4` skeleton diverges from prototype loading layout

**File:** `VocDetailPanel.tsx:43-55`
Skeleton sizes don't match the panel's actual layout (no title-block-shaped block, no 50px header skeleton). Cosmetic; replace with shaped skeletons matching final layout slots.

---

## Prototype-vs-Implementation Drift Table (5 most prominent elements)

| # | Element | Prototype source | Implementation source | Drift |
|---|---------|-----------------|----------------------|-------|
| 1 | Panel title (h2 + badges + reporter line) | `screen-voc.jsx:195-201` — `text-lg` 17px, inline reporter `Reported by <strong>{reporter.name}</strong> · {createdAt}` on the same row | `PanelTitleBlock.tsx:12-18` + `IdentitySection.tsx:63-72` — title is `text-xl` 20px, reporter & createdAt extracted to separate `FieldRow` rows below | Title +3px; reporter/timestamp split off so the title block reads as 3 stacked rows instead of one dense identity row |
| 2 | Section title | `styles.css:1547-1556` — `font-size: var(--text-tiny)` ~10-11px, `letter-spacing: tracking-wide`, `margin: 0 0 14px`, NO border | `PanelSectionTitle.tsx:13` — `text-xs px-4 pt-4 pb-2 border-t border-border-subtle` 12px with full-width separator | Spec is borderless rhythm; impl introduces 7 horizontal dividers, doubling visual section count |
| 3 | Composer tabs | `screen-voc.jsx:404-413` + `styles.css:2014-2035` — 8px 10px padding, `--color-graphite` bg, active = `--color-pitch-black` bg + colored border-bottom | `ComposerTabs.tsx:78-110` — `py-2 px-2.5 bg-surface-card`, active = `text-text-primary bg-surface-canvas` + `border-b-accent-*` | Structural match. Risk: `border-b-accent-info` token must be present in Tailwind preset; otherwise reply accent silently breaks. |
| 4 | ReporterStatusChangeBlock | `screen-voc.jsx:537-655` — exact 12px padding, inset 1px lime shadow, megaphone icon header, picker → preview card with `row-id` mono | `ReporterStatusChangeBlock.tsx:140-307` — same structure, same Korean copy, same shield footer. Drift only in token consumption (raw `--color-neon-lime` rgba) and `text-[10px]`/`text-[11px]` arbitrary sizes | Closest match in the panel. Token cleanup needed; structure faithful. |
| 5 | Sticky next-action footer | `screen-voc.jsx:473-484` — block-width primary `Create finding`/`Open finding` + secondary icon-only More button | `NextActionFooter.tsx:35-52` — `disabled` hard-coded, primary action degraded to a faded ghost; "More" secondary action gone; renders `다음 액션 없음` for empty list | Primary CTA is dead; secondary action absent; spec footer is unrecognizable from impl footer |

---

## Recommended Sub-Command Sequence

1. **`/impeccable polish` — section rhythm + section-title contract**
   Targets: `packages/ui/src/panel/PanelSectionTitle.tsx`, `VocDetailPanel.tsx:195-202`. Drop the `border-t`, restore 14px margin-bottom on title, wrap sections in 32px margin-bottom blocks per prototype `styles.css:1543-1556`.
2. **`/impeccable layout` — vertical-stack the conversation timeline**
   Targets: `ConversationTimeline.tsx`. Replace shadcn Tabs with two stacked `PublicTimeline` + `InternalTimeline` sections matching prototype:349-398. Re-add left-edge surface accents on timeline entries.
3. **`/impeccable harden` — NextActionFooter primary CTA**
   Targets: `NextActionFooter.tsx`. Remove hard-coded `disabled`, wire `primaryAction.available`, add the secondary More slot from prototype:481-483.
4. **`/impeccable typeset` — title + arbitrary type sizes**
   Targets: `PanelTitleBlock.tsx`, `ReporterStatusChangeBlock.tsx:203,254`. Move title to 17px / 1.35; replace `text-[10px]`/`text-[11px]` with `text-caption`/`text-xs`.
5. **`/impeccable clarify` — TriageBlock copy + DescriptionSection edit affordance**
   Targets: `TriageBlock.tsx:19`, `DescriptionSection.tsx:53-58`. Strip "(Read only)" from the section title; promote `설명 수정` to a proper ghost button in the title action slot.
6. **`/impeccable audit` — raw token consumption**
   Targets: `ReporterStatusChangeBlock.tsx:145-147,204,255`. Replace raw `--color-neon-lime` rgba with `bg-accent-primary/X` semantic utilities; verify `border-b-accent-info` exists in `tailwind.preset.ts`.
7. **`/impeccable polish` — final pass**
   Em-dash → middot in PreviewModal titles; remove duplicate composer close button; shape the loading skeleton to match real layout.
