# Slice 3 #23 — Plan (rev 2 after codex CLI plan review)

## Goal

Per-node + per-mark `attrs` allowlist on sanitizer, with **value schemas** (not just key allowlists), so FE `<RichContentRenderer>` (#18) cannot be tricked into spreading attacker-controlled `attrs` onto DOM. Also normalize sanitizer output (canonical doc) so unknown JSON fields cannot leak through to the renderer.

P0 blocking #18.

## Threat model

1. Stored XSS via attacker `attrs` keys (`onclick`, `src='javascript:…'`) on allowlisted node types.
2. Stored XSS via attacker `attrs` *values* that pass key allowlist but break invariants (`mention.actor_id = '<script>'`).
3. DoS via huge primitive strings in attrs (bypasses `maxTextBytes` which only counts `text` nodes).
4. DoS via nested-object attrs (bypasses #24's node-count cap).
5. Drift via unknown top-level node/mark fields that the renderer might spread later.

Item 5 means **the sanitizer must return a normalized doc**, not the input doc.

## Codex review findings — disposition

| Severity | Finding | Disposition |
|---|---|---|
| BLOCKER | Existing persisted rows not covered | **Out of scope.** Filed as **F-RENDER-SANITIZE** below. Renderer in #18 must run an equivalent client-side sanitizer pass as defense-in-depth before render; this PR locks the write-path contract that the renderer mirrors. Slice 3 #16 closed only days ago so live data exposure is bounded; staging-only fixtures, no public deploy yet. |
| BLOCKER | Primitive unbounded length | **Accepted.** Per-attr value cap (default 2048 chars, configurable per attr); total attr-byte cap rolled into the existing `maxTextBytes` accounting. |
| BLOCKER | Allowed key ≠ safe value | **Accepted.** Replace `nodeAttrs: Record<string, ReadonlySet<string>>` with `nodeAttrs: Record<string, Record<string, AttrSchema>>`. `AttrSchema` covers UUID, URL, bounded string, nullable. |
| BLOCKER | `attrs` shape (null/array/non-object) | **Accepted.** Explicit `isPlainObject` guard before any key inspection. |
| BLOCKER | Return original doc, not canonical | **Accepted.** Sanitizer rebuilds the doc with only `{type, attrs?, marks?, text?, content?}`. Unknown fields dropped silently; empty `attrs` omitted. Callers (service.ts, conversation-service.ts) already persist the sanitizer's `doc`, so this lands transparently. |
| MAJOR | Mark error paths too coarse | **Accepted.** Path: `<nodePath>.marks[<i>].attrs.<key>`. |
| MAJOR | `codeBlock.language` lockout breaks TipTap default | **Accepted, revised.** Allow `language: string|null` (TipTap defaults to `null`). Cap string to 32 chars. |
| MAJOR | Mention attr name `actor_id` (existing) vs `id` (issue body) | **Accepted.** Codebase canonical is `actor_id` (conversation-service.ts:517, post-internal-comment.integration.test.ts:79). Plan uses `actor_id`. Issue body wrong. |
| MAJOR | URL parsing for `link.href` | **Accepted.** Use `new URL(href)`; reject if `protocol` not in `allowedLinkSchemes`; cap length 2048. Keeps existing scheme-set semantics. |
| MAJOR | `target=_blank` rel tabnabbing | **Out of scope for sanitizer.** Filed as **F-RENDER-LINK-REL** for #18 renderer: external links must include `rel="noopener noreferrer"`. |
| MAJOR | Error code reuse hides telemetry signal | **Deferred.** ADR-0012 is closed enum; adding `rich_content.disallowed_attr` is a coordinated change. Plan: reuse `rich_content.disallowed_node`, ensure `fields[].code` differentiates (`disallowed_attr_key` / `invalid_attr_value` / `disallowed_node`). Follow-up **F-ADR-0012-ATTR-CODE** to promote into the closed enum. |
| MAJOR | Integration coverage vague ("etc.") | **Accepted.** Explicit enumeration in Tests section below. |
| MAJOR | Surface allowlist drift test one-sided | **Accepted.** Static assertion: `Object.keys(nodeAttrs) ⊆ nodes`, `Object.keys(markAttrs) ⊆ marks`. Pure runtime test, no type-system tricks. |
| MAJOR | Shared-package contract drift FE↔BE | **Deferred to #18.** Export a backend test fixture of canonical valid + invalid docs that FE renderer tests consume. Not blocking this PR; tracked in **F-RICH-FIXTURE**. |
| MINOR | Empty `attrs` persisted | **Accepted.** Canonical output omits empty `attrs`. |
| MINOR | Test ordering ambiguity (`{href, target}` vs `{onclick}`) | **Accepted.** Add focused tests for each path. |
| MINOR | Primitive edge cases (`id: null`, `id: 123`, `attrs: []`, etc.) | **Accepted.** Add parameterized test row per case. |
| MINOR | Risk section understates back-compat | **Accepted.** Risk 4 added below. |

## Surface table (rev 2 — value schemas)

### Node attrs

| Surface | Node | Attrs allowed |
|---|---|---|
| voc-description | `attachmentRef` | `id: uuid` (required) |
| reporter-reply | `attachmentRef` | `id: uuid` (required) — value layer still rejects non-empty `attachments[]` until storage slice |
| internal-comment | `attachmentRef` | `id: uuid` (required) |
| internal-comment | `mention` | `actor_id: uuid` (required) |
| internal-comment | `codeBlock` | `language: nullable string ≤32` (optional) |
| all | `doc`, `paragraph`, `text`, `bulletList`, `orderedList`, `listItem` | none |

### Mark attrs

| Mark | Attrs allowed |
|---|---|
| `link` | `href: url(http\|https) ≤2048` (required) |
| `bold`, `italic`, `underline`, `code` | none |

## Data shape

```ts
// surface-allowlists.ts
export type AttrSchema =
  | { kind: 'uuid'; required: boolean }
  | { kind: 'url'; schemes: ReadonlySet<string>; maxLen: number; required: boolean }
  | { kind: 'string'; maxLen: number; nullable: boolean; required: boolean };

export interface SurfaceAllowlist {
  nodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  nodeAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  markAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  // Retained for back-compat reads in tests; sanitizer uses link's AttrSchema.
  allowedLinkSchemes: ReadonlySet<string>;
  maxTextBytes: number;
}
```

A node/mark type with no entry in `nodeAttrs`/`markAttrs` means **attrs must be absent or empty `{}`** (canonical output strips the empty `{}`). A node/mark type with an entry permits exactly those keys; missing required keys → 422; unknown keys → 422; bad value shape → 422.

## Sanitizer behavior (rev 2)

`sanitizeTipTap` rewritten to **rebuild** rather than walk-and-pass:

```
visit(node, path) -> { error } | { node: CleanNode }
```

For each visited node:
1. Type must be in `allow.nodes`. Otherwise `disallowed_node` (existing behavior).
2. If `node.attrs` exists, must be plain object (not array, not null). Otherwise `disallowed_node` with `reason: 'attrs must be a plain object'`.
3. Schema lookup `allow.nodeAttrs[type]`:
   - No entry → `attrs` must be absent or `{}`. Otherwise reject with path `<path>.attrs`.
   - Entry exists → check required keys present, unknown keys rejected with path `<path>.attrs.<key>`, each present value matches its `AttrSchema`.
4. Recursively visit `node.content` (if `Array.isArray`).
5. For `node.marks`: each must be plain object with `type` in `allow.marks`. Apply the same attr logic on `allow.markAttrs[mark.type]`, path = `<path>.marks[<i>].attrs.<key>`.
6. Build clean output: `{ type, ...(cleanAttrs has keys ? { attrs: cleanAttrs } : {}), ...(text != null ? { text } : {}), ...(marks.length ? { marks: cleanMarks } : {}), ...(content ? { content: cleanContent } : {}) }`.
7. Total text byte accumulator unchanged.

`AttrSchema` validators:
- `uuid` — `typeof === 'string'` && regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- `url` — `new URL(value)` in try/catch; `protocol` in `schemes` (note `URL.protocol` includes trailing `:`); `value.length ≤ maxLen`.
- `string` — `typeof === 'string'` (or `=== null` if nullable) && length ≤ maxLen.

`fields[].code` chosen by failure mode:
- Type/shape failure: `disallowed_node` (existing).
- Attr key rejected: `disallowed_attr_key`.
- Attr value bad: `invalid_attr_value`.

## Files touched

- `apps/backend/src/lib/rich-content/surface-allowlists.ts` (data shape + schemas).
- `apps/backend/src/lib/rich-content/sanitize.ts` (rebuild + attr visitor).
- `apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts`.
- `apps/backend/src/lib/rich-content/__tests__/surface-allowlists.test.ts`.
- `apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts` (+ attr-injection row).
- `apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts` (+ attr-injection row).
- `apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts` (+ attr-injection row).
- `apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts` (+ attr-injection row; mention `{actor_id}` already canonical so existing tests should stay green).

Verify the service-layer `fields[].code` paths still map cleanly through `HttpError`.

Out of scope:
- Shared package (`TipTapDoc` remains opaque at the wire boundary — sanitizer is authoritative; FE renderer is the symmetric guard).
- ADR-0012 enum extension for `rich_content.disallowed_attr` (separate ADR-amendment PR).
- `maxDepth`/`maxNodes` caps (issue #24).
- FE-side render sanitizer (will mirror this contract; tracked under F-RENDER-SANITIZE).

## Tests — explicit enumeration

### Unit (`sanitize.test.ts`)

Each surface, parameterized:

Positive:
- `attachmentRef` with `{id: <uuid>}` → 200.
- `mention` (internal-comment) with `{actor_id: <uuid>}` → 200.
- `codeBlock` (internal-comment) with `{language: null}` → 200. With `{language: 'ts'}` → 200. With `{}` → 200.
- `link` mark with `{href: 'https://example.com'}` → 200.
- `paragraph` with absent attrs → 200; with `{}` → 200 (canonical output omits).

Negative — attr keys:
- `attachmentRef` with `{id, onclick: 'x'}` → 422, path ends `attrs.onclick`, code `disallowed_attr_key`.
- `paragraph` with `{align: 'left'}` → 422 path ends `attrs`.
- `link` mark with `{href, target: '_blank'}` → 422 path ends `marks[0].attrs.target`.
- `link` mark with `{onclick: 'x'}` (no href) → 422 path ends `marks[0].attrs.onclick` or `attrs.href` (assert missing-required surfaces first).

Negative — attr values:
- `attachmentRef.id = 'not-a-uuid'` → 422 `invalid_attr_value`.
- `attachmentRef.id = null` → 422.
- `attachmentRef.id = 123` → 422.
- `attachmentRef.id = true` → 422.
- `attachmentRef.id = 'a'.repeat(50_000)` → 422 (UUID regex fails before length check, but assert).
- `mention.actor_id` cross-product same as `attachmentRef.id`.
- `link.href = 'javascript:alert(1)'` → 422 (existing; keep green).
- `link.href = 'http://' + 'a'.repeat(3000)` → 422 length cap.
- `link.href = 'not a url'` → 422 (URL parse fails).
- `codeBlock.language = 33-char string` → 422.

Negative — attrs shape:
- `attachmentRef.attrs = null` → 422.
- `attachmentRef.attrs = []` → 422.
- `attachmentRef.attrs = 'string'` → 422.

Canonical output:
- Doc with `paragraph.attrs = {}` → sanitizer output has no `attrs` key.
- Doc with `paragraph.extraField: 'x'` → sanitizer output omits `extraField`.

### Static (`surface-allowlists.test.ts`)

- For every surface: `Object.keys(nodeAttrs) ⊆ nodes`.
- For every surface: `Object.keys(markAttrs) ⊆ marks`.

### Integration (one row per write surface)

- `create-voc.integration.test.ts`: attr-injection on `attachmentRef.onclick` → 422 with wire-level field path.
- `post-reporter-reply.integration.test.ts`: same.
- `post-public-update.integration.test.ts`: same (note: public-update surface has no `attachmentRef`; use `link` mark with `target` instead).
- `post-internal-comment.integration.test.ts`: same, plus `mention.actor_id` cross-workspace check still works (regression guard for service.ts:532 reading sanitized doc).

## Risks

1. **Drift between sanitizer and value layer.** Service-layer rejects non-empty `attachments[]` until storage slice; sanitizer only enforces attr shape. Doc the layering in surface-allowlists.ts header comment.
2. **`link.target`/`rel` rejection.** Deliberate Slice 3 lock — renderer adds `rel="noopener noreferrer" target="_blank"` for external links unconditionally.
3. **`codeBlock.language` schema.** Nullable string is intentionally permissive for default TipTap output. Future language picker can extend.
4. **Default TipTap editor `attrs`.** Some node extensions emit defaults like `{level: 1}` for headings; not in any of our allowlists, so a future heading-enabling change must also extend `nodeAttrs`. Static assertion catches missing entries; lint catches missing schemas only at first integration test.
5. **Legacy persisted unsafe attrs.** Pre-#23 dev/staging writes may contain attrs the new sanitizer would reject. Render-time sanitizer in #18 (F-RENDER-SANITIZE) is the catch.

## Follow-ups filed (after PR)

- **F-RENDER-SANITIZE** — Render-time client sanitizer pass in `<RichContentRenderer>` using mirrored allowlist (defense-in-depth + legacy data guard). #18 prereq.
- **F-RENDER-LINK-REL** — Renderer adds `rel="noopener noreferrer" target="_blank"` for external links. #18 scope.
- **F-ADR-0012-ATTR-CODE** — Promote `rich_content.disallowed_attr` into ADR-0012 closed enum; separate ADR amendment PR.
- **F-RICH-FIXTURE** — Backend-exported canonical valid/invalid TipTap fixtures consumed by FE renderer tests. #18 supporting work.

## Chunks

- **C1 (Sonnet):** Rewrite `surface-allowlists.ts` to new schema-based shape; update existing tests minimally to keep them green; add static drift assertions.
- **C2 (Sonnet):** Rewrite `sanitize.ts` to rebuild canonical doc with attr visitor + value schemas; full unit-test coverage from the enumeration above.
- **C3 (Sonnet):** Add one integration attr-injection case per write surface.
- **C4 (Opus orchestrator):** Codex CLI cycle-1 review on diff; resolve BLOCKER/MAJOR.
- **C5 (Opus subagent):** Cycle-2 deeper review; resolve or file follow-ups.
- **C6 (Haiku/main):** Wiki page `/wiki/concepts/rich-content-sanitizer.md` (or amend bounded-context-voc); PR + squash-merge + close issue + memory update.

## Exit criteria

- ~30 new test cases unit + 4 integration; full backend suite green.
- Cycle-1 (codex) + cycle-2 (Opus) pass with no unresolved BLOCKER/MAJOR.
- PR merged; #23 closed.
- 4 follow-up issues filed.
- Memory `project_slice3_23_pr` written; wiki synced.
