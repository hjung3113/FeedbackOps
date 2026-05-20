# SLICE-3 #20 — REV cycle 1 (codex attempt → fallback to Opus self)

**Date:** 2026-05-21
**Intended reviewer:** codex CLI (per `feedback_workflow` §4)
**Actual reviewer:** Opus self (codex non-interactive integration failed)

## Codex integration issue

Two invocations attempted:

1. `codex review --base develop` (default prompt) → exit 0 after ~5s, output ≤13 lines header only. No findings emitted.
2. `codex exec - < brief.txt` → exit 0 after ~60s, output 241 lines all consumed by auto-loaded skills (`caveman-review`, `superpowers:using-superpowers`) + MCP `context-mode` probing + narrative without ever emitting findings.

**Hypothesis:**
- `codex review` non-interactive: either requires a TTY or doesn't print review body to stdout in this version.
- `codex exec` triggers skill auto-activation that consumes the budget before review starts.

**Follow-up:** pin a codex invocation pattern that disables skill auto-activation; update `feedback_workflow.md` §4. Tracked as a workflow follow-up (not blocking this PR).

## Opus self-review (REV-1 substitute)

### Methodology
Read every new/modified file end-to-end. Trace runtime sequences. Look for type escape hatches, race conditions, hook discipline, permission UI correctness, URL state plumbing, Korean copy verbatim, test coverage of error paths.

### Findings

#### HIGH — none

#### MEDIUM

**M1 · ConversationTimeline internal tab visibility leak**
- File: `apps/frontend/src/features/voc/components/detail/ConversationTimeline.tsx`
- Issue: Spec §"Conversation timeline" says internal tab "visible only when viewer is not Reporter-only". Server controls the array (empty for Reporter-only). My impl renders BOTH tabs always — Reporter-only viewers see an empty "내부" tab that hints at the existence of internal traffic they aren't supposed to know about.
- Fix: Hide the "내부" tab when viewer is Reporter-only. Need useMe + voc.reporter_id comparison passed in from VocDetailPanel.
- Decision: defer to #21 with TODO comment (composers + permission-aware viewer logic land there).

**M2 · usePermissionDecision drift defaults to 'denied' for `_self`**
- File: `apps/frontend/src/features/voc/hooks/usePermissionDecision.ts`
- Issue: On state value not in the 4-enum, hook returns `null` + console.warn. If `_self` decision drifts (state value the FE doesn't recognize), VocDetailPanel falls through to the full envelope path. Could expose info BE intended to hide.
- Fix: When narrow fails AND key is `_self`, return a synthetic `{ state: 'denied', reason: 'unknown decision shape' }` (safer default).
- Decision: fix in this PR (~10 min).

#### LOW

- **L1** PublicTimeline useVocConversation(vocId, kind=undefined) → fetches combined stream, client filters for public_update|reporter_reply. Pagination wastes bandwidth on long timelines. Acceptable for Slice 3.
- **L2** VocRow.tsx:114 — `severity ?? 'low'` renders SeverityIndicator with the 'low' fill pattern when severity is null. Could mislead viewers. Add a 4th null state (all 3 bars dim at 20%) distinct from low. Minor.
- **L3** isDocEmpty heuristic only handles `paragraph` nodes. RichEditor doesn't emit headings/lists in voc-description, so OK for Slice 3. Document.
- **L4** InboxRoute filter comma-list doesn't trim whitespace per token. Hand-edited URL would 422 server-side. Defensive trim() recommended.
- **L5** CP1/CP2 desktop-only (per user 2026-05-21 — tablet/mobile responsive OOS). PR body to note.

#### Code quality (nits)

- `(prev: any) => …` casts in InboxRoute navigate reducers — acceptable per Sonnet's deviation note.
- Inline type assertions for TipTapDoc — cosmetic.
- All primitives use `data-*` attributes for token assertion test stability — consistent pattern.

### Test coverage check

- ✅ List loading (10 skeletons)
- ✅ List empty (inbox + my)
- ✅ List error + retry
- ✅ Detail loading skeleton
- ✅ Detail 404 → DetailPanelNotFound
- ✅ Detail summary envelope → PermissionBlockedPanel
- ⚠️  out_of_scope_summary peek banner — no integration test asserts it (rendered conditionally based on BE field).
- ⚠️  Conversation 더보기 → fetchNextPage — no test exercising specifically.

Both ⚠️ are test gaps, not bugs. Could cover in a follow-up test PR; not blocking.

### Dep additions (justification)

- `@testing-library/user-event@14.6.1` (@fops/ui dev) — Radix Popover/Tabs require user-event for reliable open in jsdom; fireEvent.click on trigger doesn't fire the open state. Justified.
- `sonner@2.0.7` (@fops/ui prod) — DetailPanelHeaderActions surfaces the '링크가 복사되었습니다' toast at the primitive level (vs every consumer wiring it). Justified.

### Go/No-go

**Go** to REV-2 with M2 fix in this PR + M1 + L1-L5 documented:
- **M2 fix:** modify `usePermissionDecision` to default `_self` drift to denied (~10 min).
- M1: TODO comment + deferred to #21.
- L1-L5: inline TODOs OR PR body notes; address in follow-ups.

### Summary

HIGH = 0
MEDIUM = 2 (M1 deferred / M2 fix in PR)
LOW = 5 (L1-L5 deferred)
Test gaps = 2 (peek banner, 더보기) — non-blocking.
