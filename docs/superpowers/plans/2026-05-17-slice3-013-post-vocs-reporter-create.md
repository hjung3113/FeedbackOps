# Slice 3 #13 — POST /vocs Reporter Create + TipTap Sanitizer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `POST /vocs` Reporter-side Create endpoint on the Slice 3 foundation laid by #12 — request validation, server-side TipTap sanitizer (`voc-description` surface), idempotency, audit, rate limit, and full integration coverage of the API contract in `docs/frontend/specs/voc.md` §8.1.

**Architecture:** Three new module files under `apps/backend/src/modules/voc/` (`service.ts`, `routes.ts`, `repo.ts`) wired into `server.ts` alongside the existing AA/MS modules; new shared zod schemas in `packages/shared/src/vocs/` for the request body + envelope shape; new sanitizer pipeline in `apps/backend/src/lib/rich-content/` with a per-surface allowlist table so S3-005 can extend additively. Reuse `createIdempotencyService`, `createAuditService`, `createCheckService`, `HttpError`, and the `mutation` rate-limit tier already plumbed in server.ts. Service receives `Tx` per `apps/backend/AGENTS.md` Layer Rules; all five steps (FOR UPDATE → sanitize → INSERT → audit → idempotency record) run in one transaction. New error codes (5) are added to `@fops/shared/errors/codes.ts` and ADR-0012 enum table in lockstep per spec direction.

**Tech Stack:** Fastify v4, Drizzle ORM (PostgreSQL), Zod v3, `@fops/shared` workspace package, Vitest (unit + integration with real Postgres), TipTap JSON (ADR-0011 doc shape).

**Source docs:**
- Issue: GitHub #13
- Spec: `docs/frontend/specs/voc.md` §8.1, §4.1, §4.5, §5.7
- API contract: `docs/implementation/03-api-contracts.md` §VOC Create, §Next Action Contract, lines 111–118 (forbidden fields)
- ADRs: ADR-0011 (TipTap rich content), ADR-0012 (error codes — amended here), ADR-0015 (idempotency + rate limit), ADR-0017 (audit details), ADR-0019 (FOR UPDATE pattern)
- Prior art: `apps/backend/src/modules/analytics-areas/{routes.ts,analytics-area-service.ts}` (mutation+idempotency+audit template), `apps/backend/src/modules/voc/transitions.ts` (#12 reader)
- Memory: `[[project_slice3_12_done]]` for the #12 invariants this plan must not violate.

---

## File Structure

**Create:**
- `apps/backend/src/lib/rich-content/surface-allowlists.ts` — per-surface (node, mark) allowlist table.
- `apps/backend/src/lib/rich-content/sanitize.ts` — pure `sanitizeTipTap({ surface, doc })` returning `Result`.
- `apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts` — unit tests for every rejection path.
- `apps/backend/src/modules/voc/repo.ts` — Drizzle helpers (FOR UPDATE on MS/AA, `next_voc_display_id` call, VOC insert).
- `apps/backend/src/modules/voc/service.ts` — `createVoc({ tx, actor, input })` orchestration.
- `apps/backend/src/modules/voc/routes.ts` — `POST /vocs` controller.
- `apps/backend/src/modules/voc/index.ts` — re-exports for server.ts wiring.
- `apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts` — end-to-end coverage of every AC.
- `packages/shared/src/vocs/index.ts` — barrel.
- `packages/shared/src/vocs/create-request.ts` — `createVocRequestSchema` + `AttachmentRefSchema` + `SourceContextSchema`.
- `packages/shared/src/vocs/envelope.ts` — `VocDetailEnvelope` TS type (camelCase per spec §4.1 wire format note); wire shape is snake_case from server, mapper lives FE-side (`[[project_slice3_12_done]]` invariant).

**Modify:**
- `packages/shared/src/errors/codes.ts` — add 5 new codes (see Task 1).
- `packages/shared/src/index.ts` — re-export new `vocs/*` schemas.
- `apps/backend/src/db/tx.ts` — add `voc` schema bundle to Tx union (so service queries on `voc.vocs` type-check inside a transaction).
- `apps/backend/src/server.ts` — instantiate `createVocService` + register `vocRoutes` after analytics-areas registration (line ~308).
- `docs/adr/0012-error-code-contract.md` — append 5 new codes to the closed-enum section, mirroring the ADR-0019 amendment style.
- `docs/frontend/specs/voc.md` — §8.1 error list: add the 3 newly named codes; §10 (or Open Questions section): note Q4 resolution that Slice 3 ships with NULL owners on create.

**Do not touch:** any GET, PATCH, attachment upload, conversation, or cluster path. Those land in #14-#22.

---

## Task 1: Add 5 new error codes to `@fops/shared`

**Files:**
- Modify: `packages/shared/src/errors/codes.ts`
- Modify: `docs/adr/0012-error-code-contract.md`
- Test: `packages/shared/src/errors/__tests__/codes.test.ts` (if exists; otherwise inline in any existing shared test file — verify with `grep -rln "errorCodeSchema" packages/shared/src`)

- [ ] **Step 1.1: Write failing test asserting the 5 new codes parse**

```ts
// packages/shared/src/errors/__tests__/codes.test.ts (create if missing)
import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from '../codes.js';

describe('errorCodeSchema — Slice 3 #13 codes', () => {
  it.each([
    'voc.severity_not_user_settable',
    'validation.unexpected_field',
    'rich_content.disallowed_node',
    'rich_content.external_image_forbidden',
    'attachment.unsupported_pending_storage_slice',
  ])('parses %s', (code) => {
    expect(errorCodeSchema.parse(code)).toBe(code);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm --filter @fops/shared test -- errors/__tests__/codes.test.ts`
Expected: FAIL on each `it.each` row with ZodError "Invalid enum value".

- [ ] **Step 1.3: Add the 5 codes to the enum**

Append to `ERROR_CODES` array in `packages/shared/src/errors/codes.ts`, grouped by HTTP family per existing comment style:

```ts
// validation.* → 422 (Slice 3 #13)
'voc.severity_not_user_settable',
'validation.unexpected_field',
'rich_content.disallowed_node',
'rich_content.external_image_forbidden',
'attachment.unsupported_pending_storage_slice',
```

(`voc.severity_not_user_settable`, `rich_content.*`, `attachment.*` all 422 per `apps/backend/src/lib/errors.ts` STATUS_BY_PREFIX — `voc.` prefix falls through to default 500 currently. Confirm prefix mapping next.)

- [ ] **Step 1.4: Add `voc.` prefix to the backend STATUS_BY_PREFIX table**

Modify `apps/backend/src/lib/errors.ts`:

```ts
const STATUS_BY_PREFIX: ReadonlyArray<[string, number]> = [
  ['auth.workspace_mismatch', 403],
  ['auth.', 401],
  ['permission.', 403],
  ['not_found.', 404],
  ['conflict.', 409],
  ['validation.', 422],
  ['voc.', 422],                    // ← add
  ['rich_content.', 422],           // ← add
  ['attachment.', 422],             // ← add
  ['rate_limited.', 429],
  ['internal.', 500],
  ['upstream.', 502],
];
```

- [ ] **Step 1.5: Backend unit test for new prefix mappings**

Add to `apps/backend/src/lib/__tests__/errors.test.ts` (or nearest existing errors test — `grep -rln "statusForCode" apps/backend/src`):

```ts
import { describe, expect, it } from 'vitest';
import { statusForCode } from '../errors.js';

describe('statusForCode — Slice 3 #13 prefixes', () => {
  it.each([
    ['voc.severity_not_user_settable', 422],
    ['rich_content.disallowed_node', 422],
    ['rich_content.external_image_forbidden', 422],
    ['attachment.unsupported_pending_storage_slice', 422],
    ['validation.unexpected_field', 422],
  ] as const)('%s → %d', (code, status) => {
    expect(statusForCode(code as never)).toBe(status);
  });
});
```

- [ ] **Step 1.6: Run all updated tests**

Run: `pnpm --filter @fops/shared test && pnpm --filter @fops/backend test -- lib/__tests__/errors`
Expected: all PASS.

- [ ] **Step 1.7: Update ADR-0012**

Append to the closed-enum table in `docs/adr/0012-error-code-contract.md` (same insertion style as the "ADR-0019 Section A adds `conflict.record_archived`" note at line ~38):

```markdown
**Slice 3 #13 adds five codes to the closed enum:**
- `voc.severity_not_user_settable` (422) — request body contained `severity`; severity is set during triage only.
- `validation.unexpected_field` (422) — request body contained a forbidden server-resolved field (`reporter_id`, `reporter_facing_status`, `triage_state`, `owner_user_id`, `owner_team_id`, `display_id`). `detail.field` carries the offending path.
- `rich_content.disallowed_node` (422) — sanitizer rejected a node, mark, or `link.href` scheme outside the per-surface allowlist.
- `rich_content.external_image_forbidden` (422) — sanitizer rejected an `image` node (Slice 3 prohibits external images on every surface).
- `attachment.unsupported_pending_storage_slice` (422) — request supplied non-empty `attachments[]`; the attachment upload endpoint ships in a later slice (#22).
```

- [ ] **Step 1.8: Commit**

```bash
git add packages/shared/src/errors/codes.ts \
        packages/shared/src/errors/__tests__/codes.test.ts \
        apps/backend/src/lib/errors.ts \
        apps/backend/src/lib/__tests__/errors.test.ts \
        docs/adr/0012-error-code-contract.md
git commit -m "feat(slice3): add 5 voc/rich-content/attachment error codes (ADR-0012 amendment)"
```

---

## Task 2: Add voc schema bundle to `db/tx.ts`

**Files:**
- Modify: `apps/backend/src/db/tx.ts`

- [ ] **Step 2.1: Verify current Tx union excludes voc tables**

Run: `grep -n "schema/voc\|import \* as voc" apps/backend/src/db/tx.ts`
Expected: no match (only `core` + `permission` currently).

- [ ] **Step 2.2: Add voc namespace**

```ts
// apps/backend/src/db/tx.ts
import * as voc from './schema/voc.js';
// ...
const schema = { ...core, ...permission, ...voc };
```

- [ ] **Step 2.3: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add apps/backend/src/db/tx.ts
git commit -m "chore(slice3): expose voc schema in Tx union for #13 service"
```

---

## Task 3: Shared zod schemas for create request

**Files:**
- Create: `packages/shared/src/vocs/index.ts`
- Create: `packages/shared/src/vocs/create-request.ts`
- Create: `packages/shared/src/vocs/__tests__/create-request.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 3.1: Write failing test**

```ts
// packages/shared/src/vocs/__tests__/create-request.test.ts
import { describe, expect, it } from 'vitest';
import { createVocRequestSchema, FORBIDDEN_CREATE_FIELDS } from '../create-request.js';

const VALID = {
  primary_managed_system_id: '00000000-0000-4000-8000-000000000001',
  title: 'something broke',
  description_rich_content: { type: 'doc', content: [] },
};

describe('createVocRequestSchema', () => {
  it('accepts minimal valid body', () => {
    expect(createVocRequestSchema.parse(VALID)).toMatchObject(VALID);
  });

  it('defaults source_context to direct_use', () => {
    expect(createVocRequestSchema.parse(VALID).source_context).toBe('direct_use');
  });

  it('accepts empty attachments array', () => {
    expect(createVocRequestSchema.parse({ ...VALID, attachments: [] }).attachments).toEqual([]);
  });

  it('rejects title > 200 chars', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: 'a'.repeat(201) })).toThrow();
  });

  it('rejects title length 0', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: '' })).toThrow();
  });

  it('rejects unknown source_context', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, source_context: 'bogus' })).toThrow();
  });

  it('exports the forbidden-field list', () => {
    expect(FORBIDDEN_CREATE_FIELDS).toEqual([
      'reporter_id',
      'severity',
      'reporter_facing_status',
      'triage_state',
      'owner_user_id',
      'owner_team_id',
      'display_id',
    ]);
  });
});
```

- [ ] **Step 3.2: Run, verify fail (module missing)**

Run: `pnpm --filter @fops/shared test -- vocs/__tests__/create-request.test.ts`
Expected: FAIL "Cannot find module".

- [ ] **Step 3.3: Implement schema**

```ts
// packages/shared/src/vocs/create-request.ts
import { z } from 'zod';

export const SOURCE_CONTEXTS = [
  'direct_use',
  'proxy_report',
  'operational_discovery',
  'stakeholder_request',
] as const;
export const sourceContextSchema = z.enum(SOURCE_CONTEXTS);
export type SourceContext = z.infer<typeof sourceContextSchema>;

// TipTap doc — opaque jsonb at the wire boundary; sanitizer in apps/backend
// validates structure. Keep loose here to avoid duplicating the surface
// allowlists across packages.
export const tipTapDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});
export type TipTapDoc = z.infer<typeof tipTapDocSchema>;

// Slice 3 #22 will define this fully; the create-request only needs a stub.
export const attachmentRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  mime_type: z.string().min(1),
  storage_uri: z.string().min(1),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

export const FORBIDDEN_CREATE_FIELDS = [
  'reporter_id',
  'severity',
  'reporter_facing_status',
  'triage_state',
  'owner_user_id',
  'owner_team_id',
  'display_id',
] as const;
export type ForbiddenCreateField = (typeof FORBIDDEN_CREATE_FIELDS)[number];

export const createVocRequestSchema = z.object({
  primary_managed_system_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description_rich_content: tipTapDocSchema,
  analytics_area_id: z.string().uuid().optional(),
  source_context: sourceContextSchema.default('direct_use'),
  attachments: z.array(attachmentRefSchema).optional(),
});
export type CreateVocRequest = z.infer<typeof createVocRequestSchema>;
```

```ts
// packages/shared/src/vocs/index.ts
export * from './create-request.js';
```

- [ ] **Step 3.4: Re-export from package barrel**

Append to `packages/shared/src/index.ts`:

```ts
export * from './vocs/index.js';
```

- [ ] **Step 3.5: Run tests + typecheck**

Run: `pnpm --filter @fops/shared test && pnpm --filter @fops/shared typecheck`
Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add packages/shared/src/vocs/ packages/shared/src/index.ts
git commit -m "feat(slice3): shared zod schema for POST /vocs request (#13)"
```

---

## Task 4: TipTap surface allowlist table

**Files:**
- Create: `apps/backend/src/lib/rich-content/surface-allowlists.ts`

- [ ] **Step 4.1: Implement allowlist table per spec §5.7**

```ts
// apps/backend/src/lib/rich-content/surface-allowlists.ts
// Per-surface node + mark allowlists. Spec: docs/frontend/specs/voc.md §5.7.
// Backend sanitizer is the authoritative gate (ADR-0011); the client toolbar
// is UX guidance only. Surfaces extend additively as later slices ship.

export const SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type Surface = (typeof SURFACES)[number];

export interface SurfaceAllowlist {
  nodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  // http(s) only — sanitizer rejects javascript:, data:, file:
  allowedLinkSchemes: ReadonlySet<string>;
  // hard cap on total text content (chars). Spec: 50 KB.
  maxTextBytes: number;
}

const HTTP_ONLY = new Set(['http:', 'https:']);

export const SURFACE_ALLOWLISTS: Readonly<Record<Surface, SurfaceAllowlist>> = {
  'voc-description': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'underline', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
  // Stubs for later slices — Slice 3 #13 only exercises voc-description.
  // Keep entries so #16 (composers) can extend additively rather than
  // restructuring this file.
  'reporter-reply': {
    nodes: new Set(['doc', 'paragraph', 'text']),
    marks: new Set(['bold', 'italic', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    marks: new Set(['bold', 'italic']),
    allowedLinkSchemes: new Set(),
    maxTextBytes: 50 * 1024,
  },
  'internal-comment': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
};
```

- [ ] **Step 4.2: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add apps/backend/src/lib/rich-content/surface-allowlists.ts
git commit -m "feat(slice3): per-surface TipTap allowlist table (#13)"
```

---

## Task 5: TipTap sanitizer pipeline

**Files:**
- Create: `apps/backend/src/lib/rich-content/sanitize.ts`
- Create: `apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts`

- [ ] **Step 5.1: Write failing test (each rejection path + happy path)**

```ts
// apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts
import { describe, expect, it } from 'vitest';
import { sanitizeTipTap } from '../sanitize.js';

const surface = 'voc-description' as const;

function doc(...children: unknown[]) {
  return { type: 'doc', content: children };
}
function p(text: string, marks?: unknown[]) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  };
}

describe('sanitizeTipTap (voc-description)', () => {
  it('accepts a minimal paragraph doc', () => {
    const res = sanitizeTipTap({ surface, doc: doc(p('hi')) });
    expect(res.ok).toBe(true);
  });

  it('accepts bold + italic + underline + code + link marks', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [
        { type: 'bold' }, { type: 'italic' }, { type: 'underline' },
        { type: 'code' }, { type: 'link', attrs: { href: 'https://ok.example' } },
      ])),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects image node with external_image_forbidden', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({ type: 'image', attrs: { src: 'https://x.example/a.png' } }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.external_image_forbidden');
  });

  it('rejects mention node with disallowed_node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({ type: 'mention', attrs: { id: 'u-1' } }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects javascript: link href', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects data: link href', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'data:text/html,abc' } }])),
    });
    expect(res.ok).toBe(false);
  });

  it('rejects oversized text (>50KB total)', () => {
    const big = 'a'.repeat(50 * 1024 + 1);
    const res = sanitizeTipTap({ surface, doc: doc(p(big)) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects disallowed mark (strike not in voc-description allowlist)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'strike' }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects doc with non-doc root', () => {
    const res = sanitizeTipTap({ surface, doc: { type: 'paragraph' } as never });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run, expect failures**

Run: `pnpm --filter @fops/backend test -- lib/rich-content/__tests__/sanitize.test.ts`
Expected: FAIL "Cannot find module ../sanitize".

- [ ] **Step 5.3: Implement sanitizer**

```ts
// apps/backend/src/lib/rich-content/sanitize.ts
// Authoritative server-side TipTap sanitizer (ADR-0011). The function is
// pure — no DB, no I/O — so it composes inside any tx. Result is a
// discriminated union so callers can map to ADR-0012 codes without throwing
// on validation paths.

import type { TipTapDoc } from '@fops/shared';

import { SURFACE_ALLOWLISTS, type Surface } from './surface-allowlists.js';

export type RichContentErrorCode =
  | 'rich_content.disallowed_node'
  | 'rich_content.external_image_forbidden';

export interface RichContentError {
  code: RichContentErrorCode;
  reason: string;
  path?: string;
}

export type SanitizeResult =
  | { ok: true; doc: TipTapDoc }
  | { ok: false; error: RichContentError };

interface Node {
  type: string;
  content?: Node[];
  marks?: Mark[];
  text?: string;
  attrs?: Record<string, unknown>;
}
interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export function sanitizeTipTap(args: {
  surface: Surface;
  doc: TipTapDoc;
}): SanitizeResult {
  const allow = SURFACE_ALLOWLISTS[args.surface];
  const root = args.doc as unknown as Node;

  if (!root || root.type !== 'doc') {
    return err('rich_content.disallowed_node', 'root must be a doc node', '$');
  }

  let totalText = 0;
  const visit = (node: Node, path: string): RichContentError | null => {
    if (node.type === 'image') {
      return { code: 'rich_content.external_image_forbidden', reason: 'image node not permitted', path };
    }
    if (!allow.nodes.has(node.type)) {
      return { code: 'rich_content.disallowed_node', reason: `node ${node.type} not allowed`, path };
    }
    if (typeof node.text === 'string') {
      totalText += Buffer.byteLength(node.text, 'utf8');
      if (totalText > allow.maxTextBytes) {
        return { code: 'rich_content.disallowed_node', reason: 'text content exceeds 50KB cap', path };
      }
    }
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (!allow.marks.has(mark.type)) {
          return { code: 'rich_content.disallowed_node', reason: `mark ${mark.type} not allowed`, path };
        }
        if (mark.type === 'link') {
          const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
          const schemeMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
          const scheme = schemeMatch ? `${schemeMatch[1].toLowerCase()}:` : '';
          if (!scheme || !allow.allowedLinkSchemes.has(scheme)) {
            return {
              code: 'rich_content.disallowed_node',
              reason: `link scheme ${scheme || '<missing>'} not allowed`,
              path,
            };
          }
        }
      }
    }
    if (Array.isArray(node.content)) {
      for (let i = 0; i < node.content.length; i++) {
        const child = visit(node.content[i] as Node, `${path}.content[${i}]`);
        if (child) return child;
      }
    }
    return null;
  };

  const error = visit(root, '$');
  if (error) return { ok: false, error };
  return { ok: true, doc: args.doc };
}

function err(code: RichContentErrorCode, reason: string, path: string): SanitizeResult {
  return { ok: false, error: { code, reason, path } };
}
```

- [ ] **Step 5.4: Run sanitizer tests**

Run: `pnpm --filter @fops/backend test -- lib/rich-content/__tests__/sanitize.test.ts`
Expected: all PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/backend/src/lib/rich-content/sanitize.ts \
        apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts
git commit -m "feat(slice3): TipTap sanitizer with per-surface allowlist (#13)"
```

---

## Task 6: Repository — FOR UPDATE helpers + VOC insert

**Files:**
- Create: `apps/backend/src/modules/voc/repo.ts`

- [ ] **Step 6.1: Implement repo helpers**

```ts
// apps/backend/src/modules/voc/repo.ts
// Slim repo layer for the VOC module. Owns reads/writes on voc.vocs only —
// other voc.* tables stay behind their own repos. Mirrors the AA module
// shape so callers can be reviewed against the same template.

import { and, eq, sql } from 'drizzle-orm';

import { analyticsAreas, managedSystems } from '../../db/schema/core.js';
import { vocs } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

export interface LockedManagedSystem {
  id: string;
  workspace_id: string;
  archived_at: Date | null;
}

export interface LockedAnalyticsArea {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  archived_at: Date | null;
}

export async function lockManagedSystem(
  tx: Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<LockedManagedSystem | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, archived_at
    from ${managedSystems}
    where id = ${managedSystemId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? { id: row.id, workspace_id: row.workspace_id, archived_at: row.archived_at }
    : null;
}

export async function lockAnalyticsArea(
  tx: Tx,
  workspaceId: string,
  analyticsAreaId: string,
): Promise<LockedAnalyticsArea | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    managed_system_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, managed_system_id, archived_at
    from ${analyticsAreas}
    where id = ${analyticsAreaId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? {
        id: row.id,
        workspace_id: row.workspace_id,
        managed_system_id: row.managed_system_id,
        archived_at: row.archived_at,
      }
    : null;
}

export interface InsertVocInput {
  workspaceId: string;
  primaryManagedSystemId: string;
  analyticsAreaId: string | null;
  reporterId: string;
  title: string;
  descriptionRichContent: unknown;
  sourceContext: string;
}

export async function insertVoc(tx: Tx, input: InsertVocInput) {
  // next_voc_display_id is a SECURITY DEFINER function from migration 0010
  // (#12). It assigns the next VOC-#### slug for the workspace under an
  // advisory lock; we obtain it before the INSERT to keep the SQL surface
  // small (one round trip is fine in a transaction).
  const displayRows = await tx.execute<{ next_voc_display_id: string }>(sql`
    select voc.next_voc_display_id(${input.workspaceId}) as next_voc_display_id
  `);
  const displayId = displayRows.rows[0]?.next_voc_display_id;
  if (!displayId) {
    throw new Error('next_voc_display_id returned empty');
  }

  const inserted = await tx
    .insert(vocs)
    .values({
      workspaceId: input.workspaceId,
      displayId,
      primaryManagedSystemId: input.primaryManagedSystemId,
      analyticsAreaId: input.analyticsAreaId,
      reporterId: input.reporterId,
      title: input.title,
      descriptionRichContent: input.descriptionRichContent as object,
      sourceContext: input.sourceContext,
      // defaults handle: severity=null, reporterFacingStatus='received',
      // triageState='untriaged', ownerUserId=null, ownerTeamId=null
    })
    .returning();
  return inserted[0];
}
```

- [ ] **Step 6.2: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add apps/backend/src/modules/voc/repo.ts
git commit -m "feat(slice3): VOC repo (FOR UPDATE on MS/AA, next_voc_display_id, insert) (#13)"
```

---

## Task 7: Service — `createVoc({ tx, actor, input })`

**Files:**
- Create: `apps/backend/src/modules/voc/service.ts`

- [ ] **Step 7.1: Implement service**

```ts
// apps/backend/src/modules/voc/service.ts
// VOC application service. Owns transactions, sanitization,
// FOR-UPDATE-guarded parent checks, INSERT, and audit emission per
// ADR-0008 + ADR-0019. Per apps/backend/AGENTS.md Layer Rules, the public
// API accepts a `Tx` so the controller's idempotency frame can own the
// transaction.

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { sanitizeTipTap } from '../../lib/rich-content/sanitize.js';
import { nextReporterStates, type ReporterFacingStatus } from './transitions.js';
import { insertVoc, lockAnalyticsArea, lockManagedSystem } from './repo.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CreateVocRequest } from '@fops/shared';

export interface CreateVocActor {
  actor_id: string;
  workspace_id: string;
}

export interface VocEnvelope {
  id: string;
  display_id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  reporter_id: string;
  title: string;
  description_rich_content: unknown;
  severity: null;
  reporter_facing_status: ReporterFacingStatus;
  triage_state: 'untriaged';
  owner_user_id: null;
  owner_team_id: null;
  source_context: string;
  created_at: string;
  updated_at: string;
  next_actions: never[];
  next_reporter_states: {
    allowed: ReporterFacingStatus[];
    forbidden: Partial<Record<ReporterFacingStatus, string>>;
  };
  permission_decisions: Record<string, never>;
}

export interface VocServiceDeps {
  db: Db;
  auditService: AuditService;
}

export function createVocService(deps: VocServiceDeps) {
  async function createVoc(args: {
    tx: Tx;
    actor: CreateVocActor;
    input: CreateVocRequest;
  }): Promise<VocEnvelope> {
    const { tx, actor, input } = args;

    // 1. FOR UPDATE on parent MS (cross-workspace + archive race).
    const ms = await lockManagedSystem(tx, actor.workspace_id, input.primary_managed_system_id);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at) {
      throw new HttpError('conflict.parent_archived', 'managed system archived', {
        field: 'primary_managed_system_id',
      });
    }

    // 2. FOR UPDATE on AA (if supplied) — verify MS match + not archived.
    if (input.analytics_area_id) {
      const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
      if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
      if (aa.managed_system_id !== ms.id) {
        throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
          field: 'analytics_area_id',
        });
      }
      if (aa.archived_at) {
        throw new HttpError('conflict.parent_archived', 'analytics area archived', {
          field: 'analytics_area_id',
        });
      }
    }

    // 3. Sanitize rich content.
    const sanitized = sanitizeTipTap({
      surface: 'voc-description',
      doc: input.description_rich_content,
    });
    if (!sanitized.ok) {
      throw new HttpError(sanitized.error.code, sanitized.error.reason, {
        path: sanitized.error.path,
      });
    }

    // 4. Attachment guard — Slice 3 ships with no upload endpoint.
    if (input.attachments && input.attachments.length > 0) {
      throw new HttpError(
        'attachment.unsupported_pending_storage_slice',
        'attachments are not supported until the storage slice ships (#22)',
      );
    }

    // 5. INSERT vocs.
    const row = await insertVoc(tx, {
      workspaceId: actor.workspace_id,
      primaryManagedSystemId: input.primary_managed_system_id,
      analyticsAreaId: input.analytics_area_id ?? null,
      reporterId: actor.actor_id,
      title: input.title,
      descriptionRichContent: sanitized.doc,
      sourceContext: input.source_context,
    });

    // 6. Audit (same tx, ADR-0008).
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'voc_created',
      subject_type: 'voc',
      subject_id: row.id,
      summary: `VOC ${row.displayId} created`,
      detail: {
        voc_id: row.id,
        workspace_id: actor.workspace_id,
        primary_managed_system_id: row.primaryManagedSystemId,
        analytics_area_id: row.analyticsAreaId,
        reporter_id: row.reporterId,
        source_context: row.sourceContext,
      },
    });

    // 7. Compose envelope. Fresh VOC: next_actions=[] (frontend Inbox
    // row renders "처리 대기" copy); next_reporter_states reads the
    // transition matrix from #12.
    const nextStates = await nextReporterStates(
      row.reporterFacingStatus as ReporterFacingStatus,
      tx,
    );
    return {
      id: row.id,
      display_id: row.displayId,
      workspace_id: row.workspaceId,
      primary_managed_system_id: row.primaryManagedSystemId,
      analytics_area_id: row.analyticsAreaId,
      reporter_id: row.reporterId,
      title: row.title,
      description_rich_content: row.descriptionRichContent,
      severity: null,
      reporter_facing_status: row.reporterFacingStatus as ReporterFacingStatus,
      triage_state: 'untriaged',
      owner_user_id: null,
      owner_team_id: null,
      source_context: row.sourceContext,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      next_actions: [],
      next_reporter_states: nextStates,
      permission_decisions: {},
    };
  }

  return { createVoc };
}

export type VocService = ReturnType<typeof createVocService>;
```

- [ ] **Step 7.2: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 7.3: Boundary check**

Run: `pnpm check:boundaries`
Expected: PASS — service signature accepts `Tx`, not `Db`.

- [ ] **Step 7.4: Commit**

```bash
git add apps/backend/src/modules/voc/service.ts
git commit -m "feat(slice3): createVoc service (FOR UPDATE + sanitize + audit) (#13)"
```

---

## Task 8: Route — `POST /vocs`

**Files:**
- Create: `apps/backend/src/modules/voc/routes.ts`
- Create: `apps/backend/src/modules/voc/index.ts`

- [ ] **Step 8.1: Implement controller**

```ts
// apps/backend/src/modules/voc/routes.ts
// POST /vocs controller. Thin per apps/backend/AGENTS.md Layer Rules:
// HTTP parsing + forbidden-field stripping + idempotency frame; the
// service owns business rules + audit + transactions.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  FORBIDDEN_CREATE_FIELDS,
  createVocRequestSchema,
  type CreateVocRequest,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { VocService } from './service.js';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export interface VocRoutesOptions {
  db: Db;
  sessionService: SessionService;
  vocService: VocService;
  idempotencyService: IdempotencyService;
  workspaceId: string;
  rateLimitConfig?: { mutation: Record<string, unknown> };
}

export const vocRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { db, sessionService, vocService, idempotencyService, workspaceId, rateLimitConfig } = opts;

  function requireIdempotencyKey(headers: Record<string, unknown>): string {
    const raw = headers['idempotency-key'];
    const headerKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof headerKey !== 'string' || headerKey.length === 0) {
      throw new HttpError('validation.failed', 'Idempotency-Key header required', {
        fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
      });
    }
    if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
      throw new HttpError(
        'validation.malformed_idempotency_key',
        'Idempotency-Key must be a UUIDv4',
      );
    }
    return headerKey;
  }

  app.route({
    method: 'POST',
    url: '/vocs',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 1. severity present → dedicated code (spec §8.1).
      if ('severity' in rawBody) {
        return sendError(reply, 'voc.severity_not_user_settable', 'severity is set during triage', {
          field: 'severity',
        });
      }

      // 2. Other forbidden server-resolved fields → validation.unexpected_field.
      for (const f of FORBIDDEN_CREATE_FIELDS) {
        if (f === 'severity') continue;
        if (f in rawBody) {
          return sendError(reply, 'validation.unexpected_field', `${f} is server-resolved`, {
            field: f,
          });
        }
      }

      // 3. Schema validation.
      const parsed = createVocRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const input: CreateVocRequest = parsed.data;

      // 4. Idempotency + service in one transaction (ADR-0015 protocol).
      const hash = hashRequestBody(rawBody);
      const result = await db.transaction(async (tx) => {
        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with different request body',
          );
        }
        const envelope = await vocService.createVoc({
          tx,
          actor: { actor_id: sess.actor_id, workspace_id: sess.workspace_id },
          input,
        });
        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
        return { status: 201, body: envelope };
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
```

```ts
// apps/backend/src/modules/voc/index.ts
export { createVocService, type VocService } from './service.js';
export { vocRoutes } from './routes.js';
```

- [ ] **Step 8.2: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add apps/backend/src/modules/voc/routes.ts apps/backend/src/modules/voc/index.ts
git commit -m "feat(slice3): POST /vocs controller (#13)"
```

---

## Task 9: Wire route in `server.ts`

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 9.1: Add imports + registration**

After the analytics-areas registration block (~line 308), insert:

```ts
// ── VOC module — Slice 3 issue #13 ──────────────────────────────────────
const vocService = createVocService({
  db: dbHandle.db,
  auditService,
});
await app.register(vocRoutes, {
  db: dbHandle.db,
  sessionService,
  vocService,
  idempotencyService,
  workspaceId,
  rateLimitConfig: {
    mutation: app.rateLimitConfig.mutation,
  },
});
```

And add to the import block at the top of `server.ts`:

```ts
import { createVocService, vocRoutes } from './modules/voc/index.js';
```

- [ ] **Step 9.2: Typecheck + boundary**

Run: `pnpm --filter @fops/backend typecheck && pnpm check:boundaries`
Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(slice3): register POST /vocs route on server (#13)"
```

---

## Task 10: Integration tests — every acceptance criterion

**Files:**
- Create: `apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts`

Reference fixture style: `apps/backend/src/modules/analytics-areas/__tests__/analytics-area.integration.test.ts` (test harness, fops_migrate cleanup helper, workspace + session setup).

- [ ] **Step 10.1: Scaffold the test file with shared setup**

```ts
// apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestAppOps } from '../../../test/build-test-app.js'; // mirror AA test
// ^^ If the helper name/path differs in the repo, copy what analytics-area.integration.test.ts uses.

const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '00000000-0000-0000-0000-000000000001';

let ops: TestAppOps;

beforeAll(async () => {
  ops = await buildTestApp({ workspaceId: WORKSPACE_ID });
});
afterAll(async () => {
  await ops.close();
});
beforeEach(async () => {
  // Cleanup as fops_migrate — audit_log is INSERT-only for fops_app.
  await ops.migratePool.query(
    `delete from core.audit_log where event_type = 'voc_created'`,
  );
  await ops.migratePool.query(`delete from voc.vocs`);
  await ops.migratePool.query(`delete from core.idempotency_keys`);
});

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    primary_managed_system_id: ops.seedMs.id,            // a non-archived MS in the workspace
    title: 'login button broken on mobile',
    description_rich_content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
    ...overrides,
  };
}

function headers(actorToken: string, key = randomUUID()) {
  return {
    authorization: `Bearer ${actorToken}`,
    'content-type': 'application/json',
    'idempotency-key': key,
  };
}
```

**Note on `buildTestApp` + `ops.seedMs`:** match exactly what the AA test imports. If a seed-MS helper doesn't exist there, follow the AA test's recipe for setting up a workspace + MS in `beforeAll`.

- [ ] **Step 10.2: Happy path — 201 envelope shape**

```ts
it('Reporter create → 201 with full envelope', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody(),
  });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  expect(body).toMatchObject({
    workspace_id: WORKSPACE_ID,
    primary_managed_system_id: ops.seedMs.id,
    reporter_id: ops.reporterActorId,
    severity: null,
    reporter_facing_status: 'received',
    triage_state: 'untriaged',
    owner_user_id: null,
    owner_team_id: null,
    source_context: 'direct_use',
    next_actions: [],
    permission_decisions: {},
  });
  expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.display_id).toMatch(/^VOC-\d+$/);
  expect(body.next_reporter_states.allowed).toContain('reviewing');
});
```

- [ ] **Step 10.3: display_id sequencing**

```ts
it('display_id increments across successive creates', async () => {
  const a = await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken), payload: validBody() });
  const b = await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken), payload: validBody() });
  const an = Number(a.json().display_id.replace('VOC-', ''));
  const bn = Number(b.json().display_id.replace('VOC-', ''));
  expect(bn).toBe(an + 1);
});
```

- [ ] **Step 10.4: Idempotency — match + mismatch**

```ts
it('same Idempotency-Key + same body → cached 201', async () => {
  const key = randomUUID();
  const first = await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken, key), payload: validBody() });
  const second = await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken, key), payload: validBody() });
  expect(first.statusCode).toBe(201);
  expect(second.statusCode).toBe(201);
  expect(second.json().id).toBe(first.json().id);
  const count = await ops.migratePool.query(`select count(*)::int as n from voc.vocs`);
  expect(count.rows[0].n).toBe(1);
});

it('same Idempotency-Key + different body → 409 conflict.idempotency_key_reuse', async () => {
  const key = randomUUID();
  await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken, key), payload: validBody({ title: 'one' }) });
  const second = await ops.app.inject({ method: 'POST', url: '/vocs', headers: headers(ops.reporterToken, key), payload: validBody({ title: 'two' }) });
  expect(second.statusCode).toBe(409);
  expect(second.json().code).toBe('conflict.idempotency_key_reuse');
});

it('missing Idempotency-Key header → 422 validation.failed', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: {
      authorization: `Bearer ${ops.reporterToken}`,
      'content-type': 'application/json',
    },
    payload: validBody(),
  });
  expect(res.statusCode).toBe(422);
  const body = res.json();
  expect(body.code).toBe('validation.failed');
  expect(body.detail.fields[0].path).toEqual(['headers', 'idempotency-key']);
});
```

- [ ] **Step 10.5: Forbidden fields — one per field**

```ts
it.each([
  ['reporter_id', 'validation.unexpected_field'],
  ['reporter_facing_status', 'validation.unexpected_field'],
  ['triage_state', 'validation.unexpected_field'],
  ['owner_user_id', 'validation.unexpected_field'],
  ['owner_team_id', 'validation.unexpected_field'],
  ['display_id', 'validation.unexpected_field'],
] as const)('forbidden field %s → 422 %s', async (field, code) => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ [field]: 'x' }),
  });
  expect(res.statusCode).toBe(422);
  expect(res.json().code).toBe(code);
});

it('severity in body → 422 voc.severity_not_user_settable', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ severity: 'high' }),
  });
  expect(res.statusCode).toBe(422);
  expect(res.json().code).toBe('voc.severity_not_user_settable');
});
```

- [ ] **Step 10.6: MS / AA error paths**

```ts
it('MS id from another workspace → 404 not_found.record', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ primary_managed_system_id: randomUUID() }),
  });
  expect(res.statusCode).toBe(404);
  expect(res.json().code).toBe('not_found.record');
});

it('archived MS → 409 conflict.parent_archived', async () => {
  await ops.migratePool.query(
    `update core.managed_systems set archived_at = now() where id = $1`,
    [ops.seedMs.id],
  );
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody(),
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().code).toBe('conflict.parent_archived');
});

it('AA not in MS → 422 validation.failed with field analytics_area_id', async () => {
  // ops.seedAaForeign is an AA whose managed_system_id != ops.seedMs.id (add to test helper).
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ analytics_area_id: ops.seedAaForeign.id }),
  });
  expect(res.statusCode).toBe(422);
  expect(res.json().code).toBe('validation.failed');
  expect(res.json().detail.field).toBe('analytics_area_id');
});

it('archived AA → 409 conflict.parent_archived', async () => {
  await ops.migratePool.query(
    `update core.analytics_areas set archived_at = now() where id = $1`,
    [ops.seedAa.id],
  );
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ analytics_area_id: ops.seedAa.id }),
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().code).toBe('conflict.parent_archived');
});
```

- [ ] **Step 10.7: Sanitizer rejection paths**

```ts
it.each([
  [{ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x/y.png' } }] }, 'rich_content.external_image_forbidden'],
  [{ type: 'doc', content: [{ type: 'mention', attrs: { id: 'u1' } }] }, 'rich_content.disallowed_node'],
  [{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }, 'rich_content.disallowed_node'],
  [{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(50 * 1024 + 1) }] }] }, 'rich_content.disallowed_node'],
  [{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }] }] }, 'rich_content.disallowed_node'],
] as const)('sanitizer rejects → 422 %s', async (doc, expectedCode) => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ description_rich_content: doc }),
  });
  expect(res.statusCode).toBe(422);
  expect(res.json().code).toBe(expectedCode);
});
```

- [ ] **Step 10.8: Attachments**

```ts
it('attachments: [] accepted', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ attachments: [] }),
  });
  expect(res.statusCode).toBe(201);
});

it('attachments: [<any>] → 422 attachment.unsupported_pending_storage_slice', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({
      attachments: [{
        id: randomUUID(),
        name: 'foo.png',
        size_bytes: 1,
        mime_type: 'image/png',
        storage_uri: 's3://x/y',
      }],
    }),
  });
  expect(res.statusCode).toBe(422);
  expect(res.json().code).toBe('attachment.unsupported_pending_storage_slice');
});
```

- [ ] **Step 10.9: FOR UPDATE race — concurrent archive wins**

```ts
it('concurrent archive vs create: archive wins → create returns 409', async () => {
  // Two concurrent transactions:
  //  T1: BEGIN; lock MS via service (createVoc path)
  //  T2: BEGIN; UPDATE managed_systems SET archived_at = now() WHERE id = $msId; COMMIT
  // Outcome depends on which gets the row lock first. We assert that if
  // the archive commits before the create's FOR UPDATE acquires, the
  // service returns 409 conflict.parent_archived.
  //
  // Drive the race deterministically: open T2's archive UPDATE first
  // (which acquires the FOR UPDATE-style row lock for write), then issue
  // the HTTP create which will block on the lock; commit T2; then assert
  // the create response.
  const client = await ops.migratePool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update core.managed_systems set archived_at = now() where id = $1`,
      [ops.seedMs.id],
    );
    const createPromise = ops.app.inject({
      method: 'POST',
      url: '/vocs',
      headers: headers(ops.reporterToken),
      payload: validBody(),
    });
    // Give the create handler a moment to reach the lockManagedSystem step.
    await new Promise((r) => setTimeout(r, 100));
    await client.query('commit');
    const res = await createPromise;
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
  } finally {
    client.release();
  }
});
```

- [ ] **Step 10.10: Audit row written in same tx (rollback test)**

```ts
it('voc_created audit row appears for successful insert', async () => {
  const res = await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody(),
  });
  expect(res.statusCode).toBe(201);
  const audit = await ops.migratePool.query(
    `select detail from core.audit_log where event_type = 'voc_created' and subject_id = $1`,
    [res.json().id],
  );
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].detail).toMatchObject({
    voc_id: res.json().id,
    primary_managed_system_id: ops.seedMs.id,
    reporter_id: ops.reporterActorId,
    source_context: 'direct_use',
  });
});

it('no orphan audit row when sanitizer rejects (rolls back)', async () => {
  const before = await ops.migratePool.query(
    `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
  );
  await ops.app.inject({
    method: 'POST',
    url: '/vocs',
    headers: headers(ops.reporterToken),
    payload: validBody({ description_rich_content: { type: 'doc', content: [{ type: 'image' }] } }),
  });
  const after = await ops.migratePool.query(
    `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
  );
  expect(after.rows[0].n).toBe(before.rows[0].n);
});
```

- [ ] **Step 10.11: Rate limit (11th request in 60s)**

```ts
it('11th create in 60s → 429 rate_limited.actor with Retry-After', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await ops.app.inject({
      method: 'POST', url: '/vocs', headers: headers(ops.reporterToken), payload: validBody(),
    });
    expect(r.statusCode).toBe(201);
  }
  const eleventh = await ops.app.inject({
    method: 'POST', url: '/vocs', headers: headers(ops.reporterToken), payload: validBody(),
  });
  expect(eleventh.statusCode).toBe(429);
  expect(eleventh.json().code).toBe('rate_limited.actor');
  expect(eleventh.headers['retry-after']).toBeDefined();
});
```

- [ ] **Step 10.12: Run the whole integration suite**

Run (requires DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID env per `[[project_slice3_12_done]]`):

```bash
pnpm --filter @fops/backend test -- modules/voc/__tests__/create-voc.integration.test.ts
```

Expected: all PASS.

- [ ] **Step 10.13: Commit**

```bash
git add apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts
git commit -m "test(slice3): POST /vocs integration coverage (#13)"
```

---

## Task 11: Spec updates — Q4 resolution + §8.1 error list

**Files:**
- Modify: `docs/frontend/specs/voc.md`

- [ ] **Step 11.1: §8.1 error code list — replace proposed-code annotations**

Edit the "Error codes (ADR-0012)" row of the §8.1 table to drop the "(proposed)" caveats on `rich_content.external_image_forbidden` (now landed) and add the three new codes that were not in the spec table:

Existing list:
> `validation.failed` (422) · `voc.managed_system_required` (422) · `voc.severity_not_user_settable` (422) · `permission.denied` (403) · `not_found.record` (404 on referenced AA) · `conflict.parent_archived` (409 if MS or AA is archived, per ADR-0019 Section A/B) · `rate_limited.actor` (429) · `attachment.too_large` (422) · `attachment.unsupported_type` (422) · `rich_content.external_image_forbidden` (422)

Replace with:
> `validation.failed` (422) · `validation.unexpected_field` (422) · `voc.severity_not_user_settable` (422) · `permission.denied` (403) · `not_found.record` (404 on referenced MS or AA) · `conflict.parent_archived` (409 if MS or AA is archived, per ADR-0019 Section A/B) · `conflict.idempotency_key_reuse` (409) · `rate_limited.actor` (429) · `rich_content.disallowed_node` (422) · `rich_content.external_image_forbidden` (422) · `attachment.unsupported_pending_storage_slice` (422 — Slice 3 only; replaced by `attachment.too_large` / `attachment.unsupported_type` when #22 lands)

(Drop `voc.managed_system_required` — the field is already `required` on the zod schema and Slice 3 surfaces this as `validation.failed` with field path.)

- [ ] **Step 11.2: §5.7 footnote — sanitizer is no longer "proposed"**

Replace the sentence:

> The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (proposed — confirm in S3-001 / ADR-0012 enum addition).

With:

> The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (added to ADR-0012 in Slice 3 #13).

- [ ] **Step 11.3: §10 (or Open Questions section) — note Q4 resolution**

Add a bullet under the "Resolved" subsection (create one if it does not exist):

> - **Q4 (default-owner precedence on Create)** — RESOLVED 2026-05-17 (Slice 3 #13): `POST /vocs` does not resolve any default owner. `owner_user_id` and `owner_team_id` are NULL on the created VOC; ownership is set during manual triage in #14 (PATCH /vocs/:id). Revisit when default-owner policy ships in a later slice.

- [ ] **Step 11.4: Commit**

```bash
git add docs/frontend/specs/voc.md
git commit -m "docs(slice3): voc.md §5.7/§8.1/§10 alignment with #13 implementation"
```

---

## Task 12: Final verification gate

- [ ] **Step 12.1: Full backend + shared test suites**

Run:
```bash
pnpm --filter @fops/shared test
pnpm --filter @fops/backend test
pnpm --filter @fops/backend typecheck
pnpm check:boundaries
```
Expected: all PASS.

- [ ] **Step 12.2: Fresh DB smoke**

Per `[[project_slice3_12_done]]` invariant — verify migrations + seed still apply cleanly:

```bash
pnpm db:reset && pnpm db:migrate && pnpm db:seed
pnpm --filter @fops/backend test -- modules/voc/__tests__/create-voc.integration.test.ts
```
Expected: all PASS.

- [ ] **Step 12.3: Do NOT push, do NOT close issue**

Per `[[feedback_orchestration]]`: stop after local verify; user pushes + closes #13 manually after review.

---

## Self-review notes

- **Spec coverage:** every AC bullet in #13 maps to a step or test (Task 10.1–10.11 cover ACs 1–13).
- **No placeholders:** every code block is concrete; ADR text and spec patches are the actual replacement strings.
- **Type consistency:** `Tx`, `CreateVocRequest`, `VocEnvelope`, `RichContentErrorCode`, `Surface`, `ReporterFacingStatus` flow consistently between Tasks 3 → 5 → 6 → 7 → 8.
- **Open follow-ups for #14+:** `validation.unexpected_field` reused for PATCH forbidden-field guard; `next_reporter_states` reader already in #12; `permission_decisions` envelope populated when #14 wires the check-service results.
