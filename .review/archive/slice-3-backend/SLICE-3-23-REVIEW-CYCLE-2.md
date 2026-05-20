# Slice 3 #23 — Adversarial Review Cycle 2 (Opus subagent)

**Diff:** working tree vs `develop` (1230 lines, `/tmp/slice3-23-diff.txt`).
**Reviewer:** general-purpose subagent, Opus 4.7, cross-file invariant + drift focus.
**Date:** 2026-05-19.

**Verdict: cycle-2 clean. No new BLOCKER/MAJOR.**

Cycle-1 (codex CLI) findings not re-flagged.

## Findings

| # | Severity | Summary | Disposition |
|---|---|---|---|
| C2-1 | MINOR | `attachmentRef` / `mention` accept non-empty `content[]` — atomic-node contract drift | **Filed as F-RICH-LEAF-NODES.** Not security; FE renderer schema discipline. F-RENDER-SANITIZE mirrors. |
| C2-2 | MINOR | `visit()` still recursive; deeply-nested doc → V8 stack overflow → 500 | **#24 owns the fix.** Plan Risk note already says so. No new follow-up. |
| C2-3 | MINOR | reporter-reply legacy ordering test (valid attachmentRef → 422 unsupported) — coverage gap-risk | **Resolved here** — pre-existing test still in spec; coverage unchanged. |
| C2-4 | MINOR | `missing required attr` maps to `fields_code: 'invalid_attr_value'` (telemetry conflation) | **Accept.** Roll into F-ADR-0012-ATTR-CODE follow-up. |
| C2-5 | MINOR | Read services emit JSONB rich content verbatim — pre-#23 legacy data hazard | **Documented in plan Risk 5 + reinforced in F-RENDER-SANITIZE.** Hard prereq for #18. |
| C2-6 | MINOR | Idempotency hash uses raw body, not sanitized doc | **Pre-existing; not a #23 regression.** No action. |
| C2-7 | NIT | `RichContentError.fields_code` consumer drift bounded | **Resolved here.** |
| C2-8 | NIT | Inconsistent ordering of length-check vs type-check in `validateAttrValue` | **No action.** Readability only. |

## Cross-file invariants — clean

- `mention.attrs.actor_id` extraction at `conversation-service.ts:519+` reads sanitized canonical doc.
- `findNodesOfType` iterative walker tolerates `content === undefined`.
- `service.ts:129` + read-back path persist + return sanitized canonical doc end-to-end.
- Audit `detail` payloads never include rich-content bodies → no leak via audit log.
- Idempotency hash on raw body — unaffected by canonical rebuild.

## Type/runtime drift — clean

- `TipTapDoc` wire type unchanged (`unknown`).
- `AttrSchema.url` populated for all link-bearing surfaces (voc-description, reporter-reply, internal-comment); public-update correctly has no link mark.

## Error-path completeness — clean

- All 5 write surfaces map sanitizer errors via identical `?? 'disallowed_node'` fallback. Wire shape consistent.

## Follow-ups filed (post-PR)

- **F-RENDER-SANITIZE** (cycle-1 + cycle-2 reinforcement) — render-time client sanitizer mirroring server allowlist; hard prereq for #18.
- **F-RENDER-LINK-REL** (cycle-1) — renderer adds `rel="noopener noreferrer" target="_blank"` for external links.
- **F-ADR-0012-ATTR-CODE** (cycle-1) — promote `rich_content.disallowed_attr` (+ `missing_required_attr` per C2-4) into ADR-0012 closed enum.
- **F-RICH-FIXTURE** (cycle-1) — backend-exported canonical valid/invalid TipTap fixtures consumed by FE renderer tests.
- **F-RICH-LEAF-NODES** (cycle-2 new) — sanitizer rejects non-empty `content[]` on `attachmentRef` and `mention`.

## Verify

- `pnpm -w typecheck` — pass.
- `pnpm --filter @fops/backend test` — 505/505 live Postgres.
- Cycle-1 fixes locked: URL credentials rejected; codeBlock.language round-trip integration row passes for `null` / `'ts'` / absent.
