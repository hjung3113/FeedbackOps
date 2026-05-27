# PLAN-22 Chunk C10 — Deviations

**Closes:** #42
**Branch (worktree-native):** `worktree-agent-a832bf5547b275bba`
**Remote feature branch:** `feature/22-c10-external-link-rel-target`
**Base:** `develop` @ `1a5776a` (post-C9)

## Plan vs. delivered

| Plan item                                                                 | Delivered | Notes |
| ------------------------------------------------------------------------- | --------- | ----- |
| `isExternal(href)` helper                                                 | Yes       | Named `isExternalHref`. http(s) prefix + cross-origin check; SSR → http(s)=external. |
| External anchors get `rel="noopener noreferrer" target="_blank"`          | Yes       | Via `Link.extend({ renderHTML })`. |
| Internal anchors unchanged                                                | Yes       | `HTMLAttributes` defaults overridden to `{ target: null, rel: null }` so neither attr is emitted. |
| Test: external https, http, root-relative, hash, same-origin, javascript: | Yes       | 6/6 green in `externalLink.test.tsx`. |

## Deviations

1. **`rel` value does NOT include `nofollow`.** Upstream `@tiptap/extension-link` default is
   `noopener noreferrer nofollow`. The plan and #42 spec specify
   `noopener noreferrer` only. We matched the plan exactly. `nofollow` would
   suppress SEO link equity for legitimate external destinations agents link
   to (vendor docs, status pages); the security-relevant tokens are
   `noopener` (no `window.opener` handle leak) and `noreferrer` (no
   `Referer` header leak). If a future requirement reintroduces `nofollow`
   it can be added to the `extra` object in `RichContentRenderer.tsx`
   without touching tests for the existing cases.

2. **Implementation site: `Link.extend(...)` rather than monkey-patching
   `renderHTML` on the imported extension.** TipTap's idiomatic override
   path is `extend`. Same code path; cleaner.

3. **`HTMLAttributes: { target: null, rel: null, class: null }` defaults
   wiped.** Without this, TipTap merges the upstream `{ target: '_blank',
   rel: 'noopener noreferrer nofollow' }` defaults underneath our
   per-render overrides and internal anchors keep emitting them. Setting
   them to `null` is the documented way to suppress an HTMLAttribute in
   `mergeAttributes`.

## Out of scope (not touched)

- `sanitizeClient.ts` (C9) — confirmed renderer still consumes its output.
- `RichEditor` (compose/draft surface) — #42 is about *rendered* anchors.
- Backend sanitizer — server is authoritative per ADR-0011; this is
  defence-in-depth on the renderer.

## Verification

- `pnpm --filter @fops/ui test` → 39 files, 445 tests, all pass.
- `pnpm --filter @fops/ui typecheck` → clean.
- New file: `packages/ui/src/rich-content/__tests__/externalLink.test.tsx` (6 tests).

## LOC budget

| File                                                                         | Lines |
| ---------------------------------------------------------------------------- | ----- |
| `packages/ui/src/rich-content/RichContentRenderer.tsx` (delta)               | +36   |
| `packages/ui/src/rich-content/__tests__/externalLink.test.tsx` (new)         | +90   |
| **Total**                                                                    | **+126** |

Budget was ~105; +21 lines over. Driver: the SSR-safe `try/catch` and
explicit `HTMLAttributes` reset comments + the javascript: belt-and-suspenders
test case made the file marginally longer. No behavioral expansion.

## Commits

- `1db7b62` test(slice3 #22 C10, #42): RED — external anchors must get rel/target, internal must not
- `a6298e9` feat(slice3 #22 C10, closes #42): decorate external anchors with rel/target only
