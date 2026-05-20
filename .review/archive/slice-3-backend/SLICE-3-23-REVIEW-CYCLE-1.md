# Slice 3 #23 — Adversarial Review Cycle 1 (codex CLI)

**Diff:** working tree vs `develop` (902 lines, `/tmp/slice3-23-diff.txt`).
**Reviewer:** codex CLI 0.130.0 (gpt-5.5), adversarial mode.
**Date:** 2026-05-19.

No BLOCKERs found.

## Findings

| # | Severity | Summary | Disposition |
|---|---|---|---|
| M1 | MAJOR | `link.href` accepts URL credentials (`https://trusted@evil`) — phishing vector | **Accepted.** Reject `parsed.username` or `parsed.password` non-empty. Add tests for credentials, IDN/punycode, IPv6, percent-encoded scheme. |
| M2 | MAJOR | No integration round-trip for `codeBlock.attrs.language` null/absent/string through internal-comment | **Accepted.** Add real-Postgres integration row asserting persistence + envelope shape for all three cases. |
| m1 | MINOR | Canonical rebuild omits empty `content: []` — TipTap clients commonly emit `{type:'doc',content:[]}` | **Documented in surface-allowlists.ts header.** Rendered as canonical-omit; renderer must handle absent `content` (which is the contract). No code change. |

## Clean on challenged points

- Missing-required surfaces before unknown-key.
- Mark paths formatted as `marks[i].attrs.key`.
- Service-layer mapping keeps top-level `code` in ADR-0012 closed enum; `fields[].code` carries new discriminations.
- Write paths persist `sanitized.doc` (canonical); mention extraction reads sanitized output.

## Verify after cycle-1 fixes

- `pnpm -w typecheck` — pass.
- `pnpm --filter @fops/backend test` — 496/496 → expected ~498-500/500 after additions.
