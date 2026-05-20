OpenAI Codex v0.131.0
--------
workdir: /Users/hyojung/Desktop/2026/FeedbackOps
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019e42f6-03b3-7980-940d-4c232ebb59f0
--------
user
You are a focused reviewer of an implementation. Cycle 3. NOT general adversarial — narrowed to TWO lenses:

LENS 1 — COMPONENTIZATION: Are abstractions at the right level? Are there duplicated patterns that should be extracted (AGENTS.md two-consumer rule)? Are there over-abstracted components that should be inlined? Is the public API of @fops/ui exported cleanly? Are there code-smell components that future #19/#20/#21 will fight (god components, prop-drilling, leaking implementation details)?

LENS 2 — FE↔BE WIRE CORRECTNESS: Does the FE actually match the BE contract? errorMapper covers every BE-emitted code? apiClient header set matches BE rate-limit/idempotency/If-Match rules? wire schema types are imported from @fops/shared, not duplicated? RichEditor doc shape matches BE TipTap JSON schema? Sanitizer surface keys match BE-known surfaces? Are there silent gaps where the BE expects something the FE doesn't send (or vice-versa)?

Repo: /Users/hyojung/Desktop/2026/FeedbackOps
Branch: feature/18-fe-prologue at HEAD 9cec64c
Base: develop at e6577eb

## READ FIRST

LENS 1 (componentization):
1. `packages/ui/src/index.ts` — public export surface
2. `packages/ui/src/components/shadcn/*.tsx` — 22 primitives — check for unnecessary divergence from upstream shadcn / duplicated CVA patterns
3. `packages/ui/src/components/Button.tsx` — front-of-house primitive
4. `packages/ui/src/components/{ManagedSystemPicker,AnalyticsAreaPicker}.tsx` — sibling pickers; is there a shared base hiding?
5. `packages/ui/src/layout/{PageShell,ListShell,WorkbenchShell,ShellHeader,useDetailPanelSlot}.tsx` — 3-shell taxonomy + slot hook
6. `packages/ui/src/rich-content/{RichEditor,RichContentRenderer}.tsx` — TipTap surfaces
7. `apps/frontend/src/lib/layout/{AppFrame,AppRail,AppSidebar}.tsx` — frame composition
8. `apps/frontend/src/lib/api/{client,errorMapper,useIdempotencyKey,types,index}.ts` — api primitives
9. `apps/frontend/src/routes/_authed.tsx` + `_authed/vocs.tsx` + `_authed/admin/*.tsx` — route shells
10. `docs/frontend/specs/voc.md` §3 component inventory + spec calls
11. `apps/frontend/AGENTS.md` (FE extraction rules — two-consumer rule, dumb-prop, packages/ui export)
12. `apps/frontend/CONTEXT.md`
13. `packages/ui/CONTEXT.md` if exists

LENS 2 (FE↔BE wire):
14. `apps/backend/src/modules/voc/routes.ts` (FULL — every route, every header, every response shape FE will hit in #19/#20/#21)
15. `apps/backend/src/lib/errors/envelope.ts` (full ErrorEnvelope shape)
16. `apps/backend/src/lib/errors/registry.ts` if exists (codes that are EMITTED vs ones FE has to know)
17. `packages/shared/src/errors/codes.ts` (the contract — FE catalog must cover)
18. `packages/shared/src/vocs/index.ts` + sub-files (wire schemas)
19. `apps/backend/src/lib/rich-content/sanitizer.ts` (surface keys + caps + canonical doc shape)
20. `apps/backend/src/modules/voc/repo/idempotency.ts` (idempotency hash inputs — FE useIdempotencyKey must satisfy)
21. `apps/backend/src/lib/etag.ts` if exists (If-Match / If-None-Match shape)
22. `apps/backend/src/lib/rate-limit/` — rate-limit headers FE may need to surface
23. `apps/frontend/src/lib/api/errorMapper.ts` (CATALOG) vs the above two
24. `apps/frontend/src/lib/api/client.ts` (headers list) vs BE expectation
25. `apps/frontend/src/lib/api/types.ts` (ApiErrorEnvelope) vs `packages/shared/src/errors/codes.ts`
26. `packages/ui/src/rich-content/RichEditor.tsx` extensions vs BE sanitizer surface allowlists

## OUTPUT FORMAT

Write to stdout (capture to file via shell redirect):

```markdown
# Implementation Review — Slice 3 #18 FE Prologue · Cycle 3 (componentization + FE↔BE wire)

## LENS 1 — Componentization findings

### Severity summary
P0: N · P1: N · P2: N · P3: N

### Findings
[per finding — title, file:line, issue, why-it-matters, suggested fix]

## LENS 2 — FE↔BE wire findings

### Severity summary
P0: N · P1: N · P2: N · P3: N

### Findings
[per finding — title, file:line, issue, why-it-matters, suggested fix]

## Cross-cutting concerns
[bullets — anything that spans both lenses]

## Quality call
Paragraph. Ship-ready? Risk areas? Blocker count?

## What I did NOT review
[bullets]
```

## Constraints

- Be specific. Cite file:line.
- Componentization focus: find DUPLICATION (two pickers, two shells, two toast invocations doing the same thing differently) AND find OVER-ABSTRACTION (a wrapper that has only one caller and adds no value).
- FE↔BE focus: look for codes the BE EMITS that the FE doesn't MAP, header names that disagree, wire schema TYPES that are duplicated in FE instead of imported from @fops/shared.
- AGENTS.md two-consumer rule applies — extracting a component now if it has only one current consumer is PREMATURE; flag if I find that.
- Find 4-8 specific findings, not 20 vague ones.

hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
codex
I’ll use the review workflow and context-mode routing for this pass, then keep the output narrowed to the two requested lenses with concrete file:line citations.
mcp: context-mode/ctx_index started
mcp: context-mode/ctx_index (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
I’m going to index the requested files and diff metadata, then use small scripts to extract route/header/error/schema lines instead of dumping whole files. That should give enough precision for citations without flooding the context.
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
The first batch confirmed the branch and diff, but the broad line-map didn’t produce useful indexed snippets. I’m narrowing the extraction to the specific contracts and component pairs that can become findings.
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'pwd; ls -la; ls -la packages/ui/src | head' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
/Users/hyojung/Desktop/2026/FeedbackOps
total 704
drwxr-xr-x@ 32 hyojung  staff    1024 May 20 09:58 .
drwxr-xr-x@ 26 hyojung  staff     832 May 19 22:33 ..
-rw-r--r--@  1 hyojung  staff   10244 May 20 09:27 .DS_Store
drwxr-xr-x@  3 hyojung  staff      96 May 16 11:59 .agents
drwxr-xr-x@  4 hyojung  staff     128 May 20 00:30 .claude
drwxr-xr-x@  7 hyojung  staff     224 May 20 00:48 .codex
drwxr-xr-x@ 16 hyojung  staff     512 May 20 10:19 .git
drwxr-xr-x@  3 hyojung  staff      96 May 18 00:37 .githooks
-rw-r--r--@  1 hyojung  staff     282 May 20 00:01 .gitignore
-rw-r--r--@  1 hyojung  staff       3 May 16 21:24 .nvmrc
drwxr-xr-x@  6 hyojung  staff     192 May 19 00:43 .playwright-mcp
drwxr-xr-x@ 35 hyojung  staff    1120 May 20 10:17 .review
drwxr-xr-x@  5 hyojung  staff     160 May 17 12:23 .turbo
-rw-r--r--@  1 hyojung  staff    8274 May 18 00:37 AGENTS.md
-rw-r--r--@  1 hyojung  staff     398 May 17 02:47 CLAUDE.md
-rw-r--r--@  1 hyojung  staff    1820 May 16 12:04 CONTEXT-MAP.md
-rw-r--r--@  1 hyojung  staff   29689 May 16 22:53 CONTEXT.md
-rw-r--r--@  1 hyojung  staff   21739 May 20 09:30 DESIGN.md
drwxr-xr-x@  4 hyojung  staff     128 May 16 11:57 apps
-rw-r--r--@  1 hyojung  staff     907 May 20 09:58 biome.json
-rw-r--r--@  1 hyojung  staff    1522 May 16 22:45 docker-compose.dev.yml
drwxr-xr-x@ 15 hyojung  staff     480 May 19 09:52 docs
drwxr-xr-x@  9 hyojung  staff     288 May 20 01:37 node_modules
-rw-r--r--@  1 hyojung  staff     554 May 19 09:52 package.json
drwxr-xr-x@  4 hyojung  staff     128 May 16 11:57 packages
-rw-r--r--@  1 hyojung  staff  232480 May 20 09:30 pnpm-lock.yaml
-rw-r--r--@  1 hyojung  staff      40 May 16 21:24 pnpm-workspace.yaml
drwxr-xr-x@ 11 hyojung  staff     352 May 20 10:07 report
drwxr-xr-x@  5 hyojung  staff     160 May 19 09:52 scripts
-rw-r--r--@  1 hyojung  staff    3481 May 16 11:59 skills-lock.json
-rw-r--r--@  1 hyojung  staff     631 May 16 21:24 tsconfig.base.json
-rw-r--r--@  1 hyojung  staff     370 May 16 21:24 turbo.json
total 8
drwxr-xr-x@  9 hyojung  staff   288 May 20 10:02 .
drwxr-xr-x@ 14 hyojung  staff   448 May 20 10:05 ..
drwxr-xr-x@  3 hyojung  staff    96 May 20 01:24 __tests__
drwxr-xr-x@  6 hyojung  staff   192 May 20 09:30 components
-rw-r--r--@  1 hyojung  staff  2528 May 20 10:03 index.ts
drwxr-xr-x@  7 hyojung  staff   224 May 20 02:36 layout
drwxr-xr-x@  5 hyojung  staff   160 May 20 10:03 rich-content
drwxr-xr-x@  5 hyojung  staff   160 May 20 09:43 styles
drwxr-xr-x@  3 hyojung  staff    96 May 16 23:11 utils

hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute_file started
mcp: context-mode/ctx_execute_file (failed)
user cancelled MCP tool call
codex
Context-mode is available but the targeted file processor is being cancelled in this session, so I’m switching to tightly filtered local commands with small output caps. I’ll keep each extraction narrow and line-numbered.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node -e \"const fs=require('fs'); const files=['apps/frontend/src/lib/api/client.ts','apps/frontend/src/lib/api/errorMapper.ts','apps/frontend/src/lib/api/types.ts','apps/frontend/src/lib/api/useIdempotencyKey.ts','apps/backend/src/modules/voc/routes.ts','apps/backend/src/lib/errors/envelope.ts','apps/backend/src/lib/errors/registry.ts','packages/shared/src/errors/codes.ts','packages/shared/src/vocs/index.ts','apps/backend/src/modules/voc/repo/idempotency.ts','apps/backend/src/lib/etag.ts']; const rx=/export|ErrorCode|code:|error|headers|Idempotency|idempotency|If-Match|If-None-Match|ETag|etag|RateLimit|rate-limit|router\\.|\\.get\\(|\\.post\\(|\\.patch\\(|\\.delete\\(|@fops\\/shared|z\\.|schema|parse|Envelope|fetch|Content-Type|Accept|Authorization|X-/i; for (const f of files){console.log('\\n## '+f); if("'!fs.existsSync(f)){console.log('"'MISSING'); continue} fs.readFileSync(f,'utf8').split('\\n').forEach((l,i)=>{if(rx.test(l)) console.log((i+1)+': '+l.slice(0,220))})}\"" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:

## apps/frontend/src/lib/api/client.ts
1: import { ApiError, type ApiErrorEnvelope } from './types';
3: export interface ApiClientOptions {
5:   idempotencyKey?: string;
9:   headers?: Record<string, string>;
12: export interface ApiResponse<T> {
15:   etag: string | undefined;
19: // PUT is intentionally excluded: the locked API contract auto-mints Idempotency-Key
23: export async function apiClient<T = unknown>(
29:   const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
31:   if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
34:     headers['Idempotency-Key'] = opts.idempotencyKey ?? mintInlineKey();
36:   if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
37:   if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;
39:   const fetchInit: RequestInit = {
41:     headers,
44:   if (opts.signal != null) fetchInit.signal = opts.signal;
46:     fetchInit.body = JSON.stringify(opts.body);
48:   const res = await fetch(path, fetchInit);
50:   const etag = res.headers.get('etag') ?? undefined;
51:   const requestId = res.headers.get('x-request-id') ?? undefined;
54:     return { status: 304, data: undefined as T, etag, requestId };
58:   const data = text ? (JSON.parse(text) as unknown) : undefined;
61:     const envelope: ApiErrorEnvelope =
63:         ? (data as ApiErrorEnvelope)
64:         : { code: 'internal.unexpected', message: `HTTP ${res.status}` };
65:     throw new ApiError(res.status, envelope, requestId);
68:   return { status: res.status, data: data as T, etag, requestId };

## apps/frontend/src/lib/api/errorMapper.ts
1: import { ERROR_CODES, type ErrorCode } from '@fops/shared';
2: import type { ApiErrorEnvelope, MappedError, Tone } from './types';
4: export const GENERIC_ERROR_MESSAGE = '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
11: const CATALOG: Partial<Record<ErrorCode, CatalogEntry>> = {
14:     tone: 'error',
17:   'auth.session_required': { tone: 'error', message: '로그인이 필요합니다.' },
22:   'auth.workspace_mismatch': { tone: 'error', message: '워크스페이스 접근 권한이 없습니다.' },
25:   'permission.denied': { tone: 'error', message: '권한이 없습니다.' },
27:     tone: 'error',
42:   'validation.failed': { tone: 'error', message: '입력값이 올바르지 않습니다.' },
43:   'validation.malformed_request': { tone: 'error', message: '요청 형식이 잘못되었습니다.' },
44:   'validation.unknown_capability': { tone: 'error', message: '알 수 없는 권한입니다.' },
45:   'validation.malformed_idempotency_key': {
46:     tone: 'error',
47:     message: 'Idempotency-Key가 잘못된 형식입니다. 새로고침 후 다시 시도해 주세요.',
50:     tone: 'error',
53:   'validation.immutable_field': { tone: 'error', message: '이 필드는 변경할 수 없습니다.' },
55:     tone: 'error',
60:   'conflict.idempotency_key_reuse': {
61:     tone: 'error',
72:   'conflict.duplicate_slug': { tone: 'error', message: '이미 사용 중인 식별자입니다.' },
74:     tone: 'error',
78:     tone: 'error',
86:     tone: 'error',
91:   'not_found.record': { tone: 'error', message: '존재하지 않거나 접근할 수 없는 항목입니다.' },
94:   'internal.unexpected': { tone: 'error', message: GENERIC_ERROR_MESSAGE },
98:     tone: 'error',
102:     tone: 'error',
108:     tone: 'error',
112:     tone: 'error',
133: export function errorMapper(
134:   envelope: ApiErrorEnvelope,
136: ): MappedError {
137:   const entry = CATALOG[envelope.code];
140:   let action: MappedError['action'];
143:     message = typeof entry.message === 'function' ? entry.message(envelope.detail) : entry.message;
146:     message = GENERIC_ERROR_MESSAGE;
147:     tone = 'error';
150:   if (envelope.code === 'conflict.stale_write' && opts?.onRetry) {
157: // Sanity invariant — fail at module load if catalog drifts from ERROR_CODES.
158: export const __codeCount = ERROR_CODES.length;

## apps/frontend/src/lib/api/types.ts
1: import type { ErrorCode } from '@fops/shared';
3: export interface ApiErrorEnvelope {
4:   code: ErrorCode;
14: export class ApiError extends Error {
17:     public readonly envelope: ApiErrorEnvelope,
20:     super(envelope.message);
21:     this.name = 'ApiError';
23:   get code(): ErrorCode {
24:     return this.envelope.code;
27:     return this.envelope.detail;
31: export type Tone = 'error' | 'warning' | 'info';
32: export interface MappedError {

## apps/frontend/src/lib/api/useIdempotencyKey.ts
19:  * Stable Idempotency-Key per call site. Re-mints automatically when `ifMatchEtag` changes
20:  * (BE rule: idempotency hash includes If-Match; same key + new etag → conflict.idempotency_key_reuse).
23:  * Key is derived SYNCHRONOUSLY in the same render where ifMatchEtag changes, so callers
26: export function useIdempotencyKey(ifMatchEtag?: string) {
27:   // Single ref holds { etag, key } together to allow synchronous derivation during render.
28:   const ref = useRef<{ etag: string | undefined; key: string }>({
29:     etag: ifMatchEtag,
33:   // Synchronous derivation: if etag changed, mint a new key before returning.
34:   if (ref.current.etag !== ifMatchEtag) {
35:     ref.current = { etag: ifMatchEtag, key: mintKey() };
43:     ref.current = { etag: ref.current.etag, key: mintKey() };

## apps/backend/src/modules/voc/routes.ts
2: // HTTP parsing + forbidden-field stripping + idempotency frame; the
11:   FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES,
13:   FORBIDDEN_PATCH_FIELD_ERROR_CODES,
14:   createVocRequestSchema,
15:   editDescriptionRequestSchema,
16:   getConversationQuerySchema,
17:   internalCommentRequestSchema,
18:   listVocsQuerySchema,
19:   patchVocRequestSchema,
20:   publicUpdateRequestSchema,
21:   reporterReplyRequestSchema,
23: } from '@fops/shared';
26: import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
30: import { hashRequestBody } from '../core/idempotency/canonicalize.js';
31: import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
36: const IDEMPOTENCY_KEY_REGEX =
42: export interface VocRoutesOptions {
47:   idempotencyService: IdempotencyService;
50:   rateLimitConfig?: {
57: export const vocRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
58:   const { db, sessionService, vocService, vocReadService, idempotencyService, conversationService, workspaceId, rateLimitConfig } = opts;
60:   function requireIfMatch(headers: Record<string, unknown>): string {
61:     const raw = headers['if-match'];
64:       throw new HttpError('validation.failed', 'If-Match header required', {
65:         fields: [{ path: ['headers', 'if-match'], code: 'required' }],
71:   function requireIdempotencyKey(headers: Record<string, unknown>): string {
72:     const raw = headers['idempotency-key'];
75:       throw new HttpError('validation.failed', 'Idempotency-Key header required', {
76:         fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
79:     if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
80:       throw new HttpError(
81:         'validation.malformed_idempotency_key',
82:         'Idempotency-Key must be a UUIDv4',
92:     ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
95:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
97:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
102:         return sendError(reply, 'voc.severity_not_user_settable', 'severity is set during triage', {
103:           fields: [{ path: ['severity'], code: 'unexpected_field' }],
111:           return sendError(reply, 'validation.unexpected_field', `${f} is server-resolved`, {
112:             fields: [{ path: [f], code: 'unexpected_field' }],
117:       // 3. Schema validation.
118:       const parsed = createVocRequestSchema.safeParse(rawBody);
119:       if (!parsed.success) {
120:         return sendError(reply, 'validation.failed', 'invalid request body', {
121:           fields: fieldsFromZodIssues(parsed.error.issues),
124:       const input: CreateVocRequest = parsed.data;
126:       // 4. Idempotency + service in one transaction (ADR-0015 protocol).
134:         // a VOC row + audit row (the loser's idempotency INSERT is
138:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
140:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
145:           throw new HttpError(
146:             'conflict.idempotency_key_reuse',
147:             'Idempotency-Key reused with different request body',
150:         const envelope = await vocService.createVoc({
155:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
156:         return { status: 201, body: envelope };
163:   // TODO(#14 follow-up): triage rate-limit bucket per spec (60/min vs shared mutation 10/min)
168:     ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
171:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
173:       // 1. Idempotency-Key header.
174:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
176:       // 2. If-Match header (optimistic concurrency).
177:       const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);
183:       // 3. Strip forbidden fields before Zod parse.
186:       // guard but is then rejected by patchVocRequestSchema.strict() as an
187:       // unrecognized_keys error → validation.failed (generic), rather than the
188:       // precise validation.unexpected_field per-field error produced here.
189:       // This is acceptable — fuzzy casing is a client bug, not a spec contract.
193:           const code = FORBIDDEN_PATCH_FIELD_ERROR_CODES[f];
194:           return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id`, {
195:             fields: [{ path: [f], code: 'unexpected_field' }],
200:       // 4. Schema validation.
201:       const parsed = patchVocRequestSchema.safeParse(rawBody);
202:       if (!parsed.success) {
203:         return sendError(reply, 'validation.failed', 'invalid request body', {
204:           fields: fieldsFromZodIssues(parsed.error.issues),
208:       // 5. Idempotency frame (same pattern as POST /vocs).
210:       // refetch (new If-Match value) is NOT deduplicated against the original
211:       // request — different If-Match semantically represents a different intent.
214:       // idempotency contract: a client that retries the same intent with a
215:       // fresh If-Match (e.g. after a 409 stale_write → refetch → retry)
216:       // produces a different hash → 409 conflict.idempotency_key_reuse instead
218:       // Idempotency-Key for each distinct If-Match value. ADR-0015 is silent
219:       // on whether If-Match is "part of the body" for hashing purposes; this
228:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
230:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
235:           throw new HttpError(
236:             'conflict.idempotency_key_reuse',
237:             'Idempotency-Key reused with different request body',
242:         const envelope = await vocService.updateVoc({
251:           input: parsed.data,
254:         // 7. Record idempotency result and return 200.
255:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 200, envelope);
256:         return { status: 200, body: envelope };
272:     ...(rateLimitConfig
273:       ? { config: { rateLimit: (rateLimitConfig.reporterEdit ?? rateLimitConfig.mutation) as never } }
277:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
279:       // 1. Idempotency-Key header.
280:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
282:       // 2. If-Match header (optimistic concurrency).
283:       const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);
289:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
290:           fields: [{ path: ['id'], code: 'invalid' }],
296:       // 3. Strip forbidden fields before Zod parse for precise per-field errors.
301:           const code = FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES[f];
302:           return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id/description`, {
303:             fields: [{ path: [f], code: 'unexpected_field' }],
308:       // 4. Schema validation.
309:       const parsed = editDescriptionRequestSchema.safeParse(rawBody);
310:       if (!parsed.success) {
311:         return sendError(reply, 'validation.failed', 'invalid request body', {
312:           fields: fieldsFromZodIssues(parsed.error.issues),
316:       // 5. Idempotency frame (same pattern as PATCH /vocs/:id).
317:       // ifMatch included in hash — different If-Match = different intent.
321:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
323:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
328:           throw new HttpError(
329:             'conflict.idempotency_key_reuse',
330:             'Idempotency-Key reused with different request body',
335:         const envelope = await vocService.editVocDescription({
343:           input: parsed.data,
346:         // 7. Record idempotency result and return 200.
347:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 200, envelope);
348:         return { status: 200, body: envelope };
367:     ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
370:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
372:       const parsed = listVocsQuerySchema.safeParse(req.query);
373:       if (!parsed.success) {
374:         return sendError(reply, 'validation.failed', 'invalid query parameters', {
375:           fields: fieldsFromZodIssues(parsed.error.issues),
385:       const result = await vocReadService.listVocs({ actor, query: parsed.data });
393:   // ── GET /vocs/:id — detail + ETag (Slice 3 #15 C3) ───────────────────────
398:     ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
401:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
407:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
408:           fields: [{ path: ['id'], code: 'invalid' }],
419:       const { envelope, etag } = result;
421:       // WHY (M3): RFC 7232 allows multi-value If-None-Match headers
422:       // (comma-separated ETags) and wildcard '*'. Exact string compare misses these.
423:       const raw = req.headers['if-none-match'];
428:         .some((v) => v === '*' || v === etag);
431:         return reply.code(304).header('etag', etag).header('cache-control', 'private, no-cache').send();
435:         .header('etag', etag)
438:         .send(envelope);
447:     ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
450:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
456:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
457:           fields: [{ path: ['id'], code: 'invalid' }],
461:       const parsed = getConversationQuerySchema.safeParse(req.query);
462:       if (!parsed.success) {
463:         return sendError(reply, 'validation.failed', 'invalid query parameters', {
464:           fields: fieldsFromZodIssues(parsed.error.issues),
474:       const result = await vocReadService.getConversation({ actor, vocId, query: parsed.data });
483:   // TODO(F21 follow-up): dedicated 60/min rate-limit bucket (currently uses shared mutation tier)
488:     ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
491:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
493:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
498:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
499:           fields: [{ path: ['id'], code: 'invalid' }],
504:       const parsed = publicUpdateRequestSchema.safeParse(rawBody);
505:       if (!parsed.success) {
506:         return sendError(reply, 'validation.failed', 'invalid request body', {
507:           fields: fieldsFromZodIssues(parsed.error.issues),
513:       // idempotency replay across routes).
517:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
519:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
522:           throw new HttpError(
523:             'conflict.idempotency_key_reuse',
524:             'Idempotency-Key reused with different request body',
527:         const envelope = await conversationService.postPublicUpdate({
531:           input: parsed.data,
533:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
534:         return { status: 201, body: envelope };
541:   // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
546:     ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
549:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
551:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
556:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
557:           fields: [{ path: ['id'], code: 'invalid' }],
562:       const parsed = reporterReplyRequestSchema.safeParse(rawBody);
563:       if (!parsed.success) {
564:         return sendError(reply, 'validation.failed', 'invalid request body', {
565:           fields: fieldsFromZodIssues(parsed.error.issues),
572:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
574:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
577:           throw new HttpError(
578:             'conflict.idempotency_key_reuse',
579:             'Idempotency-Key reused with different request body',
582:         const envelope = await conversationService.postReporterReply({
586:           input: parsed.data,
588:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
589:         return { status: 201, body: envelope };
596:   // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
601:     ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
604:       if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
606:       const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
611:         return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
612:           fields: [{ path: ['id'], code: 'invalid' }],
617:       const parsed = internalCommentRequestSchema.safeParse(rawBody);
618:       if (!parsed.success) {
619:         return sendError(reply, 'validation.failed', 'invalid request body', {
620:           fields: fieldsFromZodIssues(parsed.error.issues),
627:           sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
629:         const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
632:           throw new HttpError(
633:             'conflict.idempotency_key_reuse',
634:             'Idempotency-Key reused with different request body',
637:         const envelope = await conversationService.postInternalComment({
641:           input: parsed.data,
643:         await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
644:         return { status: 201, body: envelope };

## apps/backend/src/lib/errors/envelope.ts
MISSING

## apps/backend/src/lib/errors/registry.ts
MISSING

## packages/shared/src/errors/codes.ts
1: // ADR-0012 stable error codes. Authoritative list lives in this file; both
2: // apps import from `@fops/shared`. Slice 1 ships only the codes the auth path
8: export const ERROR_CODES = [
24:   'conflict.idempotency_key_reuse',
28:   'validation.malformed_idempotency_key',
61: export const errorCodeSchema = z.enum(ERROR_CODES);
62: export type ErrorCode = z.infer<typeof errorCodeSchema>;
65:  * ADR-0012 response envelope. `detail` and `requestable_permission` are
68: export interface ErrorEnvelope {
69:   code: ErrorCode;

## packages/shared/src/vocs/index.ts
1: export * from './conversation-query.js';
2: export * from './conversation.js';
3: export * from './create-request.js';
4: export * from './detail.js';
5: export * from './edit-description-request.js';
6: export * from './internal-comment-request.js';
7: export * from './list-item.js';
8: export * from './list-query.js';
9: export * from './patch-request.js';
10: export * from './public-update-request.js';
11: export * from './reporter-reply-request.js';

## apps/backend/src/modules/voc/repo/idempotency.ts
MISSING

## apps/backend/src/lib/etag.ts
MISSING

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "rg --files | rg 'errors|idempotency|etag|rate-limit|vocs|rich-content|RichEditor|Picker|Shell|AppFrame|AppRail|AppSidebar|AGENTS.md|CONTEXT.md'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
apps/backend/src/modules/surveys/AGENTS.md
apps/backend/src/modules/findings/AGENTS.md
apps/backend/src/modules/voc/AGENTS.md
apps/backend/src/modules/voc/__tests__/list-vocs.integration.test.ts
apps/backend/src/modules/voc/__tests__/get-vocs-smoke.integration.test.ts
apps/backend/src/modules/dashboard/AGENTS.md
apps/backend/src/modules/permissions/AGENTS.md
apps/backend/src/modules/entity-linking/AGENTS.md
apps/backend/src/modules/core/jobs/idempotency-purge.ts
apps/backend/src/modules/core/jobs/__tests__/idempotency-purge.retry.unit.test.ts
apps/backend/src/modules/core/jobs/__tests__/idempotency-purge.integration.test.ts
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts
apps/backend/src/modules/core/jobs/rate-limits-purge.ts
apps/backend/src/modules/core/AGENTS.md
apps/backend/src/modules/core/idempotency/__tests__/canonicalize.test.ts
apps/backend/src/modules/core/idempotency/__tests__/idempotency-service.race.integration.test.ts
apps/backend/src/modules/core/idempotency/canonicalize.ts
apps/backend/src/modules/core/idempotency/idempotency-service.ts
apps/backend/src/modules/tasks/AGENTS.md
apps/backend/src/lib/rate-limit-pg-store.ts
apps/backend/AGENTS.md
apps/backend/CONTEXT.md
apps/backend/src/lib/errors.ts
apps/backend/src/lib/__tests__/errors.test.ts
CONTEXT.md
AGENTS.md
packages/shared/CONTEXT.md
packages/shared/AGENTS.md
apps/backend/src/lib/rich-content/surface-allowlists.ts
apps/backend/src/lib/rich-content/sanitize.ts
apps/backend/src/lib/rich-content/__tests__/surface-allowlists.test.ts
apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts
packages/ui/AGENTS.md
packages/ui/__tests__/rich-content.test.tsx
packages/ui/CONTEXT.md
packages/shared/src/errors/codes.ts
packages/ui/src/layout/ShellHeader.tsx
packages/ui/src/layout/ListShell.tsx
packages/ui/src/layout/PageShell.tsx
packages/ui/src/layout/WorkbenchShell.tsx
packages/shared/src/errors/__tests__/codes.test.ts
apps/frontend/CONTEXT.md
packages/ui/src/components/AnalyticsAreaPicker.tsx
packages/ui/src/rich-content/RichContentRenderer.tsx
docs/adr/0002-use-wysiwyg-first-rich-content-editor.md
docs/adr/0011-rich-content-editor-and-attachment-storage.md
docs/adr/0015-operational-safety-rate-limit-headers-migrations-idempotency.md
packages/ui/src/components/ManagedSystemPicker.tsx
packages/ui/src/rich-content/extensions/mention.ts
packages/ui/src/rich-content/extensions/attachmentRef.ts
packages/ui/src/rich-content/RichEditor.tsx
docs/superpowers/plans/2026-05-17-slice3-013-post-vocs-reporter-create.md
packages/shared/src/vocs/patch-request.ts
packages/shared/src/vocs/reporter-reply-request.ts
packages/shared/src/vocs/list-item.ts
packages/shared/src/vocs/index.ts
packages/shared/src/vocs/conversation.ts
packages/shared/src/vocs/public-update-request.ts
apps/frontend/AGENTS.md
packages/shared/src/vocs/edit-description-request.ts
packages/shared/src/vocs/conversation-query.ts
packages/shared/src/vocs/internal-comment-request.ts
packages/shared/src/vocs/create-request.ts
packages/shared/src/vocs/detail.ts
packages/shared/src/vocs/list-query.ts
packages/shared/src/vocs/__tests__/conversation-query.test.ts
packages/shared/src/vocs/__tests__/conversation.test.ts
packages/shared/src/vocs/__tests__/patch-request.test.ts
packages/shared/src/vocs/__tests__/list-item.test.ts
packages/shared/src/vocs/__tests__/list-query.test.ts
packages/shared/src/vocs/__tests__/edit-description-request.test.ts
packages/shared/src/vocs/__tests__/reporter-reply-request.test.ts
packages/shared/src/vocs/__tests__/create-request.test.ts
packages/shared/src/vocs/__tests__/internal-comment-request.test.ts
packages/shared/src/vocs/__tests__/detail.test.ts
packages/shared/src/vocs/__tests__/public-update-request.test.ts
apps/frontend/src/routes/__tests__/vocs.test.tsx
apps/frontend/src/features/surveys/AGENTS.md
apps/frontend/src/features/tasks/AGENTS.md
apps/frontend/src/routes/_authed/vocs.tsx
apps/frontend/src/features/voc/AGENTS.md
apps/frontend/src/features/home/AGENTS.md
apps/frontend/src/features/admin/AGENTS.md
docs/wiki/concepts/idempotency-and-concurrency.md
docs/wiki/concepts/rich-content-sanitizer.md
apps/frontend/src/features/integration/AGENTS.md
apps/frontend/src/features/my-work/AGENTS.md
apps/frontend/src/lib/layout/AppSidebar.tsx
apps/frontend/src/lib/layout/AppFrame.tsx
apps/frontend/src/lib/layout/AppRail.tsx
apps/frontend/src/lib/layout/__tests__/AppSidebar.test.tsx
apps/frontend/src/lib/layout/__tests__/AppFrame.test.tsx

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node - <<'NODE'
const fs=require('fs'); const files=['apps/backend/src/lib/errors.ts','apps/backend/src/lib/rate-limit-pg-store.ts','apps/backend/src/lib/rich-content/sanitize.ts','apps/backend/src/lib/rich-content/surface-allowlists.ts','apps/backend/src/modules/core/idempotency/idempotency-service.ts','apps/backend/src/modules/core/idempotency/canonicalize.ts','packages/shared/src/vocs/create-request.ts','packages/shared/src/vocs/patch-request.ts','packages/shared/src/vocs/detail.ts','packages/shared/src/vocs/conversation.ts','packages/shared/src/vocs/public-update-request.ts','packages/shared/src/vocs/reporter-reply-request.ts','packages/shared/src/vocs/internal-comment-request.ts','packages/shared/src/vocs/edit-description-request.ts']; const rx=/export|ErrorCode|code:|error|headers|Idempotency|idempotency|If-Match|If-None-Match|ETag|etag|RateLimit|rate-limit|x-ratelimit|retry-after|z\\.|schema|parse|Envelope|hash|canonical|surface|allow|sanitize|doc|paragraph|text|mention|attachment|rich|JSON/i; for (const f of files){console.log('\\n## '+f); if("'!fs.existsSync(f)){console.log('"'MISSING'); continue} fs.readFileSync(f,'utf8').split('\\n').forEach((l,i)=>{if(rx.test(l)) console.log((i+1)+': '+l.slice(0,240))})}
NODE" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:

## apps/backend/src/lib/errors.ts
1: // Backend-side helpers for the ADR-0012 error envelope. Maps `code` family to
2: // HTTP status per the table in ADR-0012:25-34. Controllers throw an HttpError
3: // or call `sendError` from a handler; application services raise the same
4: // instance and a Fastify error handler renders the envelope.
6: import type { ErrorCode } from '@fops/shared';
17:   ['rich_content.', 422],
18:   ['attachment.', 422],
25: export function statusForCode(code: ErrorCode): number {
32: export class HttpError extends Error {
33:   readonly code: ErrorCode;
35:   constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
42: export function sendError(
44:   code: ErrorCode,
57: // expose only the path + error code the client needs to identify which
59: export type ZodIssueShape = { path?: unknown; code?: unknown };
60: export function fieldsFromZodIssues(issues: ReadonlyArray<ZodIssueShape>): Array<{
62:   code: string;
66:     code: typeof iss.code === 'string' ? iss.code : 'invalid',

## apps/backend/src/lib/rate-limit-pg-store.ts
1: // Postgres-backed store for @fastify/rate-limit. ADR-0015:7-8 requires that
17: export interface PgStoreOptions {
23: export interface IncrResult {
30:  * @fastify/rate-limit plugin instantiates whatever class is passed via
34: export function createPgRateLimitStore(pool: pg.Pool, routeGroup: string) {
35:   return class BoundPgStore extends PgRateLimitStore {
42: export class PgRateLimitStore {
49:   incr(key: string, cb: (err: Error | null, result?: IncrResult) => void): void {
76:           cb(new Error('rate_limits upsert returned no row'));
81:       .catch((err) => cb(err as Error));
84:   child(routeOptions: Record<string, unknown>): PgRateLimitStore {
89:     const child = Object.create(Object.getPrototypeOf(this) as object) as PgRateLimitStore;

## apps/backend/src/lib/rich-content/sanitize.ts
1: // Authoritative server-side TipTap sanitizer (ADR-0011). The function is
6: // Rev 2 (issue #23): rebuilds a canonical doc (only {type, attrs?, marks?,
7: // text?, content?}) so unknown top-level fields cannot leak to the renderer.
8: // Also validates per-attr value schemas (uuid, url, bounded string).
10: import type { TipTapDoc } from '@fops/shared';
12: import { SURFACE_ALLOWLISTS, type AttrSchema, type Surface } from './surface-allowlists.js';
14: // ── Re-exported types (ADR-0012 closed enum — do not add codes here; see F-ADR-0012-ATTR-CODE) ──
16: export type RichContentErrorCode =
17:   | 'rich_content.disallowed_node'
18:   | 'rich_content.external_image_forbidden';
21: // Service callers map this to fields[].code (disallowed_attr_key / invalid_attr_value).
22: // Undefined means the general disallowed_node case.
23: export type RichContentFieldsCode =
24:   | 'disallowed_node'
25:   | 'disallowed_attr_key'
28: export interface RichContentError {
29:   code: RichContentErrorCode;
32:   fields_code?: RichContentFieldsCode;
35: export type SanitizeResult =
36:   | { ok: true; doc: TipTapDoc }
37:   | { ok: false; error: RichContentError };
45:   text?: unknown;
58:   text?: string;
63: type VisitResult = { node: CleanNode } | { error: RichContentError };
69: // ── Attr schema validators ────────────────────────────────────────────────────
72:   schema: AttrSchema,
74: ): string | null /* null = ok, string = error reason */ {
75:   if (schema.kind === 'uuid') {
81:   if (schema.kind === 'url') {
85:     if (value.length > schema.maxLen) {
86:       return `exceeds max length ${schema.maxLen}`;
88:     let parsed: URL;
90:       parsed = new URL(value);
94:     if (!schema.schemes.has(parsed.protocol)) {
95:       return `URL scheme ${parsed.protocol} not allowed`;
99:     if (parsed.username !== '' || parsed.password !== '') {
104:   if (schema.kind === 'string') {
105:     if (schema.nullable && value === null) {
109:       return schema.nullable ? `must be a string or null` : `must be a string`;
111:     if (value.length > schema.maxLen) {
112:       return `exceeds max length ${schema.maxLen}`;
116:   return `unknown schema kind`;
128:   attrSchemas: Readonly<Record<string, AttrSchema>> | undefined,
131: ): { error: RichContentError } | { cleanAttrs: Record<string, unknown> } {
132:   // If rawAttrs is present but not a plain object → shape error.
135:       error: {
136:         code: 'rich_content.disallowed_node',
139:         // no fields_code — shape failure maps to default disallowed_node
146:   // No schema entry → attrs must be absent or empty.
147:   if (!attrSchemas) {
151:         error: {
152:           code: 'rich_content.disallowed_node',
153:           reason: `no attrs are allowed on this node/mark; found key '${keys[0]}'`,
155:           // no fields_code — node has no attr schema at all; treat as disallowed_node
162:   // Schema entry exists — check required keys, unknown keys, value shape.
163:   // Check required first so missing-required surfaces before unknown-key.
164:   for (const [key, schema] of Object.entries(attrSchemas)) {
165:     if (schema.required && !(key in attrsObj)) {
167:         error: {
168:           code: 'rich_content.disallowed_node',
171:           fields_code: 'invalid_attr_value',
179:     if (!(key in attrSchemas)) {
181:         error: {
182:           code: 'rich_content.disallowed_node',
183:           reason: `attr key '${key}' is not allowed`,
185:           fields_code: 'disallowed_attr_key',
193:   for (const [key, schema] of Object.entries(attrSchemas)) {
199:     const reason = validateAttrValue(schema, value);
202:         error: {
203:           code: 'rich_content.disallowed_node',
206:           fields_code: 'invalid_attr_value',
216: // ── Main sanitizer ────────────────────────────────────────────────────────────
218: export function sanitizeTipTap(args: {
219:   surface: Surface;
220:   doc: TipTapDoc;
221: }): SanitizeResult {
222:   const allow = SURFACE_ALLOWLISTS[args.surface];
223:   const root = args.doc as unknown as RawNode;
225:   if (!root || root.type !== 'doc') {
226:     return err('rich_content.disallowed_node', 'root must be a doc node', '$');
229:   let totalText = 0;
233:   const visitMark = (raw: unknown, path: string): { mark: CleanMark } | { error: RichContentError } => {
235:     if (markCount > allow.maxMarks) {
237:         error: {
238:           code: 'rich_content.disallowed_node',
239:           reason: `max mark count exceeded (cap: ${allow.maxMarks})`,
246:         error: {
247:           code: 'rich_content.disallowed_node',
254:     if (!allow.marks.has(markType)) {
256:         error: {
257:           code: 'rich_content.disallowed_node',
258:           reason: `mark ${markType} not allowed`,
263:     const markAttrSchemas = allow.markAttrs[markType];
264:     const attrsResult = validateAttrs(markAttrSchemas, raw.attrs, path);
265:     if ('error' in attrsResult) return attrsResult;
276:     if (nodeCount > allow.maxNodes) {
278:         error: {
279:           code: 'rich_content.disallowed_node',
280:           reason: `max node count exceeded (cap: ${allow.maxNodes})`,
285:     if (depth > allow.maxDepth) {
287:         error: {
288:           code: 'rich_content.disallowed_node',
289:           reason: `max depth exceeded (cap: ${allow.maxDepth})`,
296:         error: {
297:           code: 'rich_content.disallowed_node',
309:         error: {
310:           code: 'rich_content.external_image_forbidden',
317:     // 2. Node type allowlist.
318:     if (!allow.nodes.has(node.type)) {
320:         error: {
321:           code: 'rich_content.disallowed_node',
322:           reason: `node ${node.type} not allowed`,
328:     // 3. Text byte cap.
329:     if (typeof node.text === 'string') {
330:       totalText += Buffer.byteLength(node.text, 'utf8');
331:       if (totalText > allow.maxTextBytes) {
333:           error: {
334:             code: 'rich_content.disallowed_node',
335:             reason: `text content exceeds max bytes (cap: ${allow.maxTextBytes})`,
343:     const nodeAttrSchemas = allow.nodeAttrs[node.type];
344:     const attrsResult = validateAttrs(nodeAttrSchemas, node.attrs, path);
345:     if ('error' in attrsResult) return attrsResult;
347:     // 5. Marks validation (rebuild canonical mark list).
352:         if ('error' in markResult) return markResult;
362:         if ('error' in childResult) return childResult;
367:     // 7. Build canonical clean node (omit empty attrs, empty marks, empty content).
372:     if (typeof node.text === 'string') {
373:       cleanNode.text = node.text;
386:   if ('error' in rootResult) return { ok: false, error: rootResult.error };
387:   return { ok: true, doc: rootResult.node as unknown as TipTapDoc };
392: function err(code: RichContentErrorCode, reason: string, path: string): SanitizeResult {
393:   return { ok: false, error: { code, reason, path } };

## apps/backend/src/lib/rich-content/surface-allowlists.ts
1: // apps/backend/src/lib/rich-content/surface-allowlists.ts
2: // Per-surface node + mark allowlists with per-attr value schemas.
3: // Spec: docs/frontend/specs/voc.md §5.7. ADR-0011 names this layer authoritative.
5: // Layering note: the sanitizer enforces attr *shape* here (type, format, length).
6: // Service-layer business rules (e.g. rejecting non-empty attachments[] until the
10: export const SURFACES = [
16: export type Surface = (typeof SURFACES)[number];
18: // ── AttrSchema ────────────────────────────────────────────────────────────────
20: export type AttrSchema =
25: // ── SurfaceAllowlist ──────────────────────────────────────────────────────────
27: // DoS caps — these are hard structural limits, NOT UX allowances.
29: // (deep nesting) or burning CPU (extremely wide / mark-heavy documents).
31: // Depth counts edges from the root doc node (depth 0) to the deepest descendant.
32: // A typical rich TipTap document with ~6 list levels and inline structure reaches
35: // Node and mark counts are cumulative over the whole document (not per-level).
39: // Per-surface override is reserved for future tuning; all surfaces share these
41: export interface SurfaceAllowlist {
44:   // nodeAttrs: node type → allowed attr key → value schema.
46:   nodeAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
47:   // markAttrs: mark type → allowed attr key → value schema.
49:   markAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
50:   // Retained for back-compat reads in tests; sanitizer now uses link's AttrSchema.
51:   allowedLinkSchemes: ReadonlySet<string>;
52:   // hard cap on total text content (chars). Spec: 50 KB.
53:   maxTextBytes: number;
64: // ── Shared attr schemas ───────────────────────────────────────────────────────
66: const uuidRequired: AttrSchema = { kind: 'uuid', required: true };
68: const attachmentRefAttrs: Readonly<Record<string, AttrSchema>> = {
72: const linkMarkAttrs: Readonly<Record<string, AttrSchema>> = {
76: // ── Surface definitions ───────────────────────────────────────────────────────
78: export const SURFACE_ALLOWLISTS: Readonly<Record<Surface, SurfaceAllowlist>> = {
81:       'doc', 'paragraph', 'text',
83:       'attachmentRef',
87:       attachmentRef: attachmentRefAttrs,
92:     allowedLinkSchemes: HTTP_ONLY,
93:     maxTextBytes: 50 * 1024,
99:   // public-update: no links, no attachments, no mentions, no images.
102:     nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
106:     allowedLinkSchemes: new Set<string>(),
107:     maxTextBytes: 50 * 1024,
113:   // reporter-reply: attachmentRef node allowed (value layer rejects non-empty
114:   // attachments[] until storage slice ships); link mark allowed http/https.
117:       'doc', 'paragraph', 'text',
119:       'attachmentRef',
123:       attachmentRef: attachmentRefAttrs,
128:     allowedLinkSchemes: HTTP_ONLY,
129:     maxTextBytes: 50 * 1024,
135:   // internal-comment: full feature set — codeBlock, mention, attachmentRef,
139:       'doc', 'paragraph', 'text',
142:       'mention', 'attachmentRef',
146:       attachmentRef: attachmentRefAttrs,
147:       mention: {
148:         // Canonical attr name per conversation-service.ts:517 (codex major finding).
158:     allowedLinkSchemes: HTTP_ONLY,
159:     maxTextBytes: 50 * 1024,

## apps/backend/src/modules/core/idempotency/idempotency-service.ts
1: // Idempotency lookup/reserve service. Owned by the Core module per
2: // docs/implementation/02-domain-module-boundaries.md.
5: //   1. Lookup (actor_id, key) in core.idempotency_keys.
6: //   2. Hit + matching request_hash → return stored response.
7: //   3. Hit + mismatched hash       → throw HitMismatchError (controller → 409).
16: //     const hit = await idempotencyService.lookup(tx, actor_id, key, hash);
18: //     if (hit.kind === 'mismatch') throw new HttpError('conflict.idempotency_key_reuse', ...);
20: //     await idempotencyService.record(tx, actor_id, key, hash, status, body);
27: import { idempotencyKeys } from '../../../db/schema/core.js';
29: export type { Tx };
31: export type IdempotencyLookupResult =
36: export function createIdempotencyService() {
41:     requestHash: string,
42:   ): Promise<IdempotencyLookupResult> {
45:         requestHash: idempotencyKeys.requestHash,
46:         responseStatus: idempotencyKeys.responseStatus,
47:         responseBody: idempotencyKeys.responseBody,
49:       .from(idempotencyKeys)
50:       .where(and(eq(idempotencyKeys.actorId, actorId), eq(idempotencyKeys.key, key)))
54:     if (row.requestHash !== requestHash) return { kind: 'mismatch' };
62:     requestHash: string,
77:       .insert(idempotencyKeys)
81:         requestHash,
86:         target: [idempotencyKeys.actorId, idempotencyKeys.key],
93: export type IdempotencyService = ReturnType<typeof createIdempotencyService>;

## apps/backend/src/modules/core/idempotency/canonicalize.ts
1: // Canonical body hashing for the idempotency middleware.
2: // ADR-0015:71-90 mandates a deterministic `request_hash` so retries with the
3: // same `(actor_id, Idempotency-Key)` can be matched against the original
4: // payload. We canonicalize by recursively sorting object keys before
5: // JSON.stringify so member ordering changes ('a' first vs 'b' first) do not
6: // produce a hash mismatch. Arrays preserve order (semantically significant
9: import { createHash } from 'node:crypto';
13: export function canonicalizeJson(value: unknown): unknown {
16:   if (Array.isArray(value)) return value.map(canonicalizeJson);
19:     out[key] = canonicalizeJson((value as Record<string, unknown>)[key]);
24: export function hashRequestBody(body: unknown): string {
25:   const json = JSON.stringify(canonicalizeJson(body ?? {}));
26:   return createHash('sha256').update(json).digest('hex');

## packages/shared/src/vocs/create-request.ts
3: export const SOURCE_CONTEXTS = [
9: export const sourceContextSchema = z.enum(SOURCE_CONTEXTS);
10: export type SourceContext = z.infer<typeof sourceContextSchema>;
12: // TipTap doc — opaque jsonb at the wire boundary; sanitizer in apps/backend
13: // validates structure. Keep loose here to avoid duplicating the surface
14: // allowlists across packages.
15: export const tipTapDocSchema = z.object({
16:   type: z.literal('doc'),
17:   content: z.array(z.unknown()).optional(),
19: export type TipTapDoc = z.infer<typeof tipTapDocSchema>;
22: export const attachmentRefSchema = z.object({
23:   id: z.string().uuid(),
24:   name: z.string().min(1),
25:   size_bytes: z.number().int().nonnegative(),
26:   mime_type: z.string().min(1),
27:   storage_uri: z.string().min(1),
29: export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
31: export const FORBIDDEN_CREATE_FIELDS = [
40: export type ForbiddenCreateField = (typeof FORBIDDEN_CREATE_FIELDS)[number];
42: export const createVocRequestSchema = z.object({
43:   primary_managed_system_id: z.string().uuid(),
44:   title: z.string().min(1).max(200),
45:   description_rich_content: tipTapDocSchema,
46:   analytics_area_id: z.string().uuid().optional(),
47:   source_context: sourceContextSchema.default('direct_use'),
48:   attachments: z.array(attachmentRefSchema).optional(),
50: export type CreateVocRequest = z.infer<typeof createVocRequestSchema>;

## packages/shared/src/vocs/patch-request.ts
3: import type { ErrorCode } from '../errors/codes.js';
5: const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
6: const triageStateSchema = z.enum([
13: // Fields that are forbidden on PATCH /vocs/:id. Each maps to a specific error
14: // code documented in the spec §8.4.
15: export const FORBIDDEN_PATCH_FIELDS = [
20:   'description_rich_content',
28: export type ForbiddenPatchField = (typeof FORBIDDEN_PATCH_FIELDS)[number];
32: export const FORBIDDEN_PATCH_FIELD_ERROR_CODES: Readonly<
33:   Record<ForbiddenPatchField, ErrorCode>
37:   description_rich_content: 'validation.unexpected_field',
45: export const patchVocRequestSchema = z
47:     severity: severitySchema.nullable().optional(),
48:     owner_user_id: z.string().uuid().nullable().optional(),
49:     owner_team_id: z.string().uuid().nullable().optional(),
50:     analytics_area_id: z.string().uuid().nullable().optional(),
51:     triage_state: triageStateSchema.optional(),
52:     postpone_review: z.boolean().optional(),
54:   // Unknown keys are rejected so mistyped or unsupported fields surface
74: export type PatchVocRequest = z.infer<typeof patchVocRequestSchema>;

## packages/shared/src/vocs/detail.ts
3: import { conversationEntrySchema } from './conversation.js';
4: import { reporterFacingStatusEnumSchema, vocListItemSchema } from './list-item.js';
6: export const vocDetailEnvelopeSchema = vocListItemSchema.extend({
7:   // TipTap doc — opaque jsonb; backend validates structure.
8:   description_rich_content: z.unknown(),
10:   next_actions: z.array(z.unknown()),
11:   // Allowed next reporter states from the current status; forbidden map carries
13:   next_reporter_states: z.object({
14:     allowed: z.array(reporterFacingStatusEnumSchema),
15:     forbidden: z.record(reporterFacingStatusEnumSchema, z.string()),
18:   linked_execution: z.object({
19:     findingRef: z.null(),
20:     taskRef: z.null(),
24:   conversation_timeline: z.array(conversationEntrySchema),
25:   conversation_page: z.object({
26:     cursor: z.string().optional(),
27:     has_more: z.boolean(),
30:   permission_decisions: z.record(z.string(), z.unknown()),
32: export type VocDetailEnvelope = z.infer<typeof vocDetailEnvelopeSchema>;
37: export const vocSummaryEnvelopeSchema = z.object({
38:   id: z.string().uuid(),
39:   display_id: z.string(),
40:   primary_managed_system_id: z.string().uuid(),
41:   reporter_facing_status: reporterFacingStatusEnumSchema,
42:   created_at: z.string().datetime(),
45:   // avoid coupling the shared schema to auth-service internals.
46:   permission_decisions: z.record(z.string(), z.unknown()),
48: export type VocSummaryEnvelope = z.infer<typeof vocSummaryEnvelopeSchema>;

## packages/shared/src/vocs/conversation.ts
3: export const conversationKindSchema = z.enum([
8: export type ConversationKind = z.infer<typeof conversationKindSchema>;
12: // union) keeps the wire shape flat and avoids a nested `data` envelope.
13: export const conversationEntrySchema = z.object({
14:   id: z.string().uuid(),
15:   kind: conversationKindSchema,
16:   actor_id: z.string().uuid(),
17:   // TipTap doc — opaque at the wire boundary; backend validates structure.
18:   body_rich_content: z.unknown(),
19:   created_at: z.string().datetime(),
20:   visibility: z.enum(['public', 'reporter', 'internal']),
22:   reporter_facing_status_before: z.string().optional(),
23:   reporter_facing_status_after: z.string().optional(),
24:   skip_public_update: z.boolean().optional(),
25:   skip_reason: z.string().nullable().optional(),
27: export type ConversationEntry = z.infer<typeof conversationEntrySchema>;

## packages/shared/src/vocs/public-update-request.ts
3: import { tipTapDocSchema } from './create-request.js';
4: import { reporterFacingStatusEnumSchema } from './list-item.js';
11:     skip_public_update: z.literal(false),
12:     body_rich_content: tipTapDocSchema,
13:     next_reporter_facing_status: reporterFacingStatusEnumSchema,
20:     skip_public_update: z.literal(true),
21:     skip_reason: z.string().refine((s) => s.trim().length >= 8, {
24:     next_reporter_facing_status: reporterFacingStatusEnumSchema,
28: export const publicUpdateRequestSchema = z.discriminatedUnion('skip_public_update', [
33: export type PublicUpdateRequest = z.infer<typeof publicUpdateRequestSchema>;

## packages/shared/src/vocs/reporter-reply-request.ts
3: import { tipTapDocSchema } from './create-request.js';
5: // Minimal attachment reference for the wire boundary.
6: // Attachment upload ships in Slice 3 #22; value-layer rejects non-empty arrays
7: // until then (service raises attachment.unsupported_pending_storage_slice).
8: const attachmentRefSchema = z.object({ id: z.string().uuid() });
10: export const reporterReplyRequestSchema = z
12:     body_rich_content: tipTapDocSchema,
13:     attachments: z.array(attachmentRefSchema).optional(),
17: export type ReporterReplyRequest = z.infer<typeof reporterReplyRequestSchema>;

## packages/shared/src/vocs/internal-comment-request.ts
3: import { tipTapDocSchema } from './create-request.js';
5: export const internalCommentRequestSchema = z
7:     body_rich_content: tipTapDocSchema,
8:     mentions: z.array(z.string().uuid()).max(50).optional(),
12: export type InternalCommentRequest = z.infer<typeof internalCommentRequestSchema>;

## packages/shared/src/vocs/edit-description-request.ts
3: import type { ErrorCode } from '../errors/codes.js';
4: import { attachmentRefSchema, tipTapDocSchema } from './create-request.js';
6: // ── editDescriptionRequestSchema ───────────────────────────────────────────
8: // field outside the allowlist is rejected as `unrecognized_keys` by Zod —
9: // the schema's `.strict()` is the security boundary, not the forbidden-field
12: export const editDescriptionRequestSchema = z
14:     title: z.string().min(1).max(200).optional(),
15:     description_rich_content: tipTapDocSchema.optional(),
16:     attachments: z.array(attachmentRefSchema).optional(),
24: export type EditDescriptionRequest = z.infer<typeof editDescriptionRequestSchema>;
31: export const FORBIDDEN_EDIT_DESCRIPTION_FIELDS = [
39:   'source_context',
50: export type ForbiddenEditDescriptionField =
53: export const FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES: Readonly<
54:   Record<ForbiddenEditDescriptionField, ErrorCode>
63:   source_context: 'validation.unexpected_field',

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba packages/shared/src/errors/codes.ts | sed -n '1,90p'; printf '\\n--- errorMapper ---\\n'; nl -ba apps/frontend/src/lib/api/errorMapper.ts | sed -n '1,180p'; printf '\\n--- api tests? ---\\n'; nl -ba apps/frontend/src/lib/api/__tests__/errorMapper.test.ts | sed -n '1,220p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
     1	// ADR-0012 stable error codes. Authoritative list lives in this file; both
     2	// apps import from `@fops/shared`. Slice 1 ships only the codes the auth path
     3	// emits — additional codes are added by their owning slice in lockstep with
     4	// the i18n catalog (when that lands).
     5	
     6	import { z } from 'zod';
     7	
     8	export const ERROR_CODES = [
     9	  // auth.* → 401
    10	  'auth.session_invalid',
    11	  'auth.session_required',
    12	  'auth.session_expired',
    13	  // permission.* → 403
    14	  'auth.workspace_mismatch',
    15	  'permission.denied',
    16	  // rate_limited.* → 429
    17	  'rate_limited.actor',
    18	  'rate_limited.ip',
    19	  // validation.* → 422
    20	  'validation.failed',
    21	  'validation.malformed_request',
    22	  'validation.unknown_capability',
    23	  // conflict.* → 409
    24	  'conflict.idempotency_key_reuse',
    25	  'conflict.capability_already_granted',
    26	  'conflict.permission_request_duplicate',
    27	  // validation.* → 422 (continued)
    28	  'validation.malformed_idempotency_key',
    29	  'validation.sensitive_reason_required',
    30	  'validation.immutable_field',
    31	  // conflict.* → 409 (Slice 2 #10/#11)
    32	  'conflict.duplicate_slug',
    33	  'conflict.parent_archived',
    34	  // conflict.* → 409 (ADR-0019 Section A — archived row is itself
    35	  // immutable; distinct from `conflict.parent_archived` which rejects
    36	  // because the referenced parent is archived).
    37	  'conflict.record_archived',
    38	  // not_found.* → 404
    39	  'not_found.record',
    40	  // internal.* → 500
    41	  'internal.unexpected',
    42	  // validation.* / voc.* / rich_content.* / attachment.* → 422 (Slice 3 #13)
    43	  'voc.severity_not_user_settable',
    44	  'validation.unexpected_field',
    45	  'rich_content.disallowed_node',
    46	  'rich_content.external_image_forbidden',
    47	  'attachment.unsupported_pending_storage_slice',
    48	  // conflict.* → 409 (Slice 3 #14 — optimistic concurrency)
    49	  'conflict.stale_write',
    50	  // voc.* → 422 (Slice 3 #14 — forbidden field on PATCH)
    51	  'voc.reporter_status_via_public_update_only',
    52	  // permission.* → 403 (Slice 3 #14 — MS-scope required)
    53	  'permission.scope_required',
    54	  // reporter_facing_status.* → 422 (Slice 3 #16 — transition validation + gate)
    55	  'reporter_facing_status.invalid_transition',
    56	  'reporter_facing_status.gate_blocked',
    57	  // conflict.* → 409 (Slice 3 #17 — Reporter edit blocked by committed triage)
    58	  'conflict.triage_already_committed',
    59	] as const;
    60	
    61	export const errorCodeSchema = z.enum(ERROR_CODES);
    62	export type ErrorCode = z.infer<typeof errorCodeSchema>;
    63	
    64	/**
    65	 * ADR-0012 response envelope. `detail` and `requestable_permission` are
    66	 * optional and code-specific; the shape itself is universal.
    67	 */
    68	export interface ErrorEnvelope {
    69	  code: ErrorCode;
    70	  message: string;
    71	  detail?: Record<string, unknown>;
    72	  requestable_permission?: {
    73	    permission: string;
    74	    managed_system_id?: string;
    75	    reason_required?: boolean;
    76	  };
    77	}

--- errorMapper ---
     1	import { ERROR_CODES, type ErrorCode } from '@fops/shared';
     2	import type { ApiErrorEnvelope, MappedError, Tone } from './types';
     3	
     4	export const GENERIC_ERROR_MESSAGE = '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
     5	
     6	interface CatalogEntry {
     7	  tone: Tone;
     8	  message: string | ((detail?: Record<string, unknown>) => string);
     9	}
    10	
    11	const CATALOG: Partial<Record<ErrorCode, CatalogEntry>> = {
    12	  // auth.*
    13	  'auth.session_invalid': {
    14	    tone: 'error',
    15	    message: '세션이 유효하지 않습니다. 다시 로그인해 주세요.',
    16	  },
    17	  'auth.session_required': { tone: 'error', message: '로그인이 필요합니다.' },
    18	  'auth.session_expired': {
    19	    tone: 'warning',
    20	    message: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    21	  },
    22	  'auth.workspace_mismatch': { tone: 'error', message: '워크스페이스 접근 권한이 없습니다.' },
    23	
    24	  // permission.*
    25	  'permission.denied': { tone: 'error', message: '권한이 없습니다.' },
    26	  'permission.scope_required': {
    27	    tone: 'error',
    28	    message: '해당 Managed System에 대한 권한이 없습니다.',
    29	  },
    30	
    31	  // rate_limited.*
    32	  'rate_limited.actor': {
    33	    tone: 'warning',
    34	    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    35	  },
    36	  'rate_limited.ip': {
    37	    tone: 'warning',
    38	    message: '동일 IP에서의 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    39	  },
    40	
    41	  // validation.*
    42	  'validation.failed': { tone: 'error', message: '입력값이 올바르지 않습니다.' },
    43	  'validation.malformed_request': { tone: 'error', message: '요청 형식이 잘못되었습니다.' },
    44	  'validation.unknown_capability': { tone: 'error', message: '알 수 없는 권한입니다.' },
    45	  'validation.malformed_idempotency_key': {
    46	    tone: 'error',
    47	    message: 'Idempotency-Key가 잘못된 형식입니다. 새로고침 후 다시 시도해 주세요.',
    48	  },
    49	  'validation.sensitive_reason_required': {
    50	    tone: 'error',
    51	    message: '민감한 작업입니다. 사유를 입력해 주세요.',
    52	  },
    53	  'validation.immutable_field': { tone: 'error', message: '이 필드는 변경할 수 없습니다.' },
    54	  'validation.unexpected_field': {
    55	    tone: 'error',
    56	    message: '허용되지 않는 필드가 포함되어 있습니다.',
    57	  },
    58	
    59	  // conflict.*
    60	  'conflict.idempotency_key_reuse': {
    61	    tone: 'error',
    62	    message: '같은 요청 키로 다른 작업을 시도했습니다. 새로고침 후 다시 시도해 주세요.',
    63	  },
    64	  'conflict.capability_already_granted': {
    65	    tone: 'info',
    66	    message: '이미 권한이 부여되어 있습니다.',
    67	  },
    68	  'conflict.permission_request_duplicate': {
    69	    tone: 'info',
    70	    message: '동일한 권한 요청이 이미 진행 중입니다.',
    71	  },
    72	  'conflict.duplicate_slug': { tone: 'error', message: '이미 사용 중인 식별자입니다.' },
    73	  'conflict.parent_archived': {
    74	    tone: 'error',
    75	    message: '상위 항목이 보관되어 더 이상 변경할 수 없습니다.',
    76	  },
    77	  'conflict.record_archived': {
    78	    tone: 'error',
    79	    message: '이 항목은 보관되어 더 이상 변경할 수 없습니다.',
    80	  },
    81	  'conflict.stale_write': {
    82	    tone: 'warning',
    83	    message: '다른 사용자가 먼저 변경했습니다. 최신 내용을 불러올까요?',
    84	  },
    85	  'conflict.triage_already_committed': {
    86	    tone: 'error',
    87	    message: '이미 트리아지가 완료되어 본인이 직접 수정할 수 없습니다.',
    88	  },
    89	
    90	  // not_found.*
    91	  'not_found.record': { tone: 'error', message: '존재하지 않거나 접근할 수 없는 항목입니다.' },
    92	
    93	  // internal.*
    94	  'internal.unexpected': { tone: 'error', message: GENERIC_ERROR_MESSAGE },
    95	
    96	  // voc.*
    97	  'voc.severity_not_user_settable': {
    98	    tone: 'error',
    99	    message: '심각도는 트리아지 단계에서만 설정할 수 있습니다.',
   100	  },
   101	  'voc.reporter_status_via_public_update_only': {
   102	    tone: 'error',
   103	    message: 'Reporter-facing status는 공개 업데이트를 통해서만 변경됩니다.',
   104	  },
   105	
   106	  // rich_content.*
   107	  'rich_content.disallowed_node': {
   108	    tone: 'error',
   109	    message: '허용되지 않는 콘텐츠 요소가 포함되어 있습니다.',
   110	  },
   111	  'rich_content.external_image_forbidden': {
   112	    tone: 'error',
   113	    message: '외부 이미지 링크는 허용되지 않습니다.',
   114	  },
   115	
   116	  // attachment.*
   117	  'attachment.unsupported_pending_storage_slice': {
   118	    tone: 'warning',
   119	    message: '첨부 파일은 다음 단계에서 지원됩니다.',
   120	  },
   121	
   122	  // reporter_facing_status.*
   123	  'reporter_facing_status.invalid_transition': {
   124	    tone: 'warning',
   125	    message: '허용되지 않는 상태 전환입니다.',
   126	  },
   127	  'reporter_facing_status.gate_blocked': {
   128	    tone: 'warning',
   129	    message: '권한 게이트로 상태를 변경할 수 없습니다.',
   130	  },
   131	};
   132	
   133	export function errorMapper(
   134	  envelope: ApiErrorEnvelope,
   135	  opts?: { onRetry?: () => void },
   136	): MappedError {
   137	  const entry = CATALOG[envelope.code];
   138	  let message: string;
   139	  let tone: Tone;
   140	  let action: MappedError['action'];
   141	
   142	  if (entry) {
   143	    message = typeof entry.message === 'function' ? entry.message(envelope.detail) : entry.message;
   144	    tone = entry.tone;
   145	  } else {
   146	    message = GENERIC_ERROR_MESSAGE;
   147	    tone = 'error';
   148	  }
   149	
   150	  if (envelope.code === 'conflict.stale_write' && opts?.onRetry) {
   151	    action = { label: '최신 내용 불러오기', run: opts.onRetry };
   152	  }
   153	
   154	  return { tone, message, action };
   155	}
   156	
   157	// Sanity invariant — fail at module load if catalog drifts from ERROR_CODES.
   158	export const __codeCount = ERROR_CODES.length;

--- api tests? ---
     1	import { ERROR_CODES, type ErrorCode } from '@fops/shared';
     2	import { describe, expect, it } from 'vitest';
     3	import { GENERIC_ERROR_MESSAGE, errorMapper } from '../errorMapper';
     4	
     5	const VALID_TONES = new Set(['error', 'warning', 'info']);
     6	
     7	const SLICE_3_OWNER_PREFIXES: ReadonlyArray<string> = [
     8	  'voc.',
     9	  'rich_content.',
    10	  'attachment.',
    11	  'reporter_facing_status.',
    12	];
    13	const SLICE_3_OWNER_CODES_EXACT: ReadonlyArray<ErrorCode> = [
    14	  'conflict.stale_write',
    15	  'conflict.triage_already_committed',
    16	  'conflict.idempotency_key_reuse',
    17	];
    18	
    19	function isSlice3OwnerCode(code: ErrorCode): boolean {
    20	  return (
    21	    SLICE_3_OWNER_PREFIXES.some((p) => code.startsWith(p)) ||
    22	    SLICE_3_OWNER_CODES_EXACT.includes(code)
    23	  );
    24	}
    25	
    26	describe('errorMapper — ERROR_CODES coverage', () => {
    27	  it('every ERROR_CODES code maps to a non-empty Korean message', () => {
    28	    for (const code of ERROR_CODES) {
    29	      const mapped = errorMapper({ code, message: '' });
    30	      expect(mapped.message, `code ${code}`).toBeTruthy();
    31	      expect(mapped.message.length, `code ${code}`).toBeGreaterThan(0);
    32	    }
    33	  });
    34	
    35	  it('every code has tone in {error, warning, info}', () => {
    36	    for (const code of ERROR_CODES) {
    37	      const mapped = errorMapper({ code, message: '' });
    38	      expect(VALID_TONES.has(mapped.tone), `code ${code} tone=${mapped.tone}`).toBe(true);
    39	    }
    40	  });
    41	
    42	  it('Slice 3 owner codes have non-fallback Korean copy', () => {
    43	    for (const code of ERROR_CODES) {
    44	      if (!isSlice3OwnerCode(code)) continue;
    45	      const mapped = errorMapper({ code, message: '' });
    46	      expect(mapped.message, `Slice 3 owner code ${code} must not fall back to generic`).not.toBe(
    47	        GENERIC_ERROR_MESSAGE,
    48	      );
    49	    }
    50	  });
    51	
    52	  it('conflict.stale_write maps to warning + retry action when onRetry provided', () => {
    53	    let called = false;
    54	    const mapped = errorMapper(
    55	      { code: 'conflict.stale_write', message: '' },
    56	      {
    57	        onRetry: () => {
    58	          called = true;
    59	        },
    60	      },
    61	    );
    62	    expect(mapped.tone).toBe('warning');
    63	    expect(mapped.action).toBeDefined();
    64	    expect(mapped.action?.label).toBeTruthy();
    65	    mapped.action?.run();
    66	    expect(called).toBe(true);
    67	  });
    68	
    69	  it('unknown code falls back to generic error', () => {
    70	    const mapped = errorMapper({ code: 'made.up.code' as ErrorCode, message: '' });
    71	    expect(mapped.message).toBe(GENERIC_ERROR_MESSAGE);
    72	    expect(mapped.tone).toBe('error');
    73	  });
    74	});

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node - <<'NODE'
const fs=require('fs'); const files=['packages/ui/src/index.ts','packages/ui/src/components/Button.tsx','packages/ui/src/components/ManagedSystemPicker.tsx','packages/ui/src/components/AnalyticsAreaPicker.tsx','packages/ui/src/layout/PageShell.tsx','packages/ui/src/layout/ListShell.tsx','packages/ui/src/layout/WorkbenchShell.tsx','packages/ui/src/layout/ShellHeader.tsx','packages/ui/src/layout/useDetailPanelSlot.ts','apps/frontend/src/lib/layout/AppFrame.tsx','apps/frontend/src/lib/layout/AppRail.tsx','apps/frontend/src/lib/layout/AppSidebar.tsx','apps/frontend/AGENTS.md','packages/ui/CONTEXT.md','docs/frontend/specs/voc.md']; const rx=/export|interface|type |function|const |children|render|slot|Shell|Picker|Combobox|items|options|value|onValueChange|selected|PageShell|ListShell|WorkbenchShell|AppFrame|AppRail|AppSidebar|two-consumer|consumer|extract|@fops\\/ui|component inventory|VOC|RichEditor|RichContent/i; for (const f of files){console.log('\\n## '+f); if("'!fs.existsSync(f)){console.log('"'MISSING'); continue} fs.readFileSync(f,'utf8').split('\\n').forEach((l,i)=>{if(rx.test(l)) console.log((i+1)+': '+l.slice(0,240))})}
NODE" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:

## packages/ui/src/index.ts
1: export { Button, buttonVariants } from './components/Button.js';
2: export type { ButtonProps } from './components/Button.js';
3: export {
4:   ManagedSystemPicker,
5:   type ManagedSystemPickerProps,
6:   type PickerOption,
7: } from './components/ManagedSystemPicker.js';
8: export {
9:   AnalyticsAreaPicker,
10:   type AnalyticsAreaPickerProps,
11: } from './components/AnalyticsAreaPicker.js';
12: export { cn } from './utils/cn.js';
15: // Note: shadcn/button re-exports Button/buttonVariants already exported above — omitted to avoid collision
16: export * from './components/shadcn/input.js';
17: export * from './components/shadcn/textarea.js';
18: export * from './components/shadcn/label.js';
19: export * from './components/shadcn/select.js';
20: export * from './components/shadcn/checkbox.js';
21: export * from './components/shadcn/radio-group.js';
22: export * from './components/shadcn/toggle-group.js';
23: export * from './components/shadcn/card.js';
24: export * from './components/shadcn/dialog.js';
25: export * from './components/shadcn/alert-dialog.js';
26: export * from './components/shadcn/alert.js';
27: export * from './components/shadcn/tooltip.js';
28: export * from './components/shadcn/hover-card.js';
29: export * from './components/shadcn/popover.js';
30: export * from './components/shadcn/sheet.js';
31: export * from './components/shadcn/tabs.js';
32: export * from './components/shadcn/skeleton.js';
33: export * from './components/shadcn/avatar.js';
34: export * from './components/shadcn/badge.js';
35: export * from './components/shadcn/dropdown-menu.js';
36: export * from './components/shadcn/combobox.js';
39: export {
40:   RichEditor,
41:   type RichEditorProps,
42:   type RichEditorSurface,
43:   type TipTapDoc,
44: } from './rich-content/RichEditor';
45: export {
46:   RichContentRenderer,
47:   type RichContentRendererProps,
48:   type RichContentMode,
49: } from './rich-content/RichContentRenderer';
50: export { AttachmentRef, type AttachmentRefAttrs } from './rich-content/extensions/attachmentRef';
51: export { Mention, type MentionAttrs } from './rich-content/extensions/mention';
53: // Layout shells (ADR-0020 — exactly three shells: PageShell / ListShell / WorkbenchShell)
54: export { PageShell, type PageShellProps } from './layout/PageShell';
55: export { ListShell, type ListShellProps } from './layout/ListShell';
56: export { WorkbenchShell, type WorkbenchShellProps } from './layout/WorkbenchShell';
57: export { ShellHeader, type ShellHeaderProps } from './layout/ShellHeader';
58: export { useDetailPanelSlot, DetailPanelSlotContext } from './layout/useDetailPanelSlot';

## packages/ui/src/components/Button.tsx
2: import { Slot } from '@radix-ui/react-slot';
3: import { cva, type VariantProps } from 'class-variance-authority';
13:  * silently in prod (renders the child WITHOUT the loading affordance). Radix Slot enforces single-child
16: const buttonVariants = cva(
17:   'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-surface-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-
40: type ShadcnVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
41: type LegacyVariant = 'primary' | 'subtle';
42: type ButtonVariant = ShadcnVariant | LegacyVariant;
43: type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
45: const VARIANT_ALIAS: Record<LegacyVariant, ShadcnVariant> = {
50: function resolveVariant(v?: ButtonVariant): ShadcnVariant {
56: export interface ButtonProps
57:   extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
62:   children?: React.ReactNode;
65: export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
67:     { className, variant, size, loading, asChild = false, disabled, children, ...props },
73:           'Button: `loading` is incompatible with `asChild` — Slot enforces single-child contract.',
77:         'Button: `loading` is incompatible with `asChild`; rendering child without loading affordance.',
79:       const Comp = Slot;
89:           {children as React.ReactElement}
94:     const Comp = asChild ? Slot : 'button';
106:             {children}
109:           children
117: export { buttonVariants };

## packages/ui/src/components/ManagedSystemPicker.tsx
1: // ManagedSystemPicker — dumb component (AGENTS.md:76, ADR-0018 picker Q7).
2: // No fetch, no API import; the consuming route supplies pre-fetched options.
4: // Dumb-prop contract preserved (PickerOption[], onChange(string|null)).
9: export interface PickerOption {
15: export interface ManagedSystemPickerProps {
16:   options: PickerOption[];
17:   value: string | null;
20:   /** When true, the rendered label appends ` (archived)` for archived rows. */
22:   /** Accessible name for the picker group (also used as aria-label fallback). */
29: export function ManagedSystemPicker(props: ManagedSystemPickerProps) {
30:   const {
31:     options,
32:     value,
41:   function handleValueChange(next: string) {
49:       value={value ?? ''}
50:       onValueChange={handleValueChange}
55:       {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
56:       data-testid={testId ?? 'managed-system-picker'}
59:       {options.map((opt) => {
60:         const label =
65:             value={opt.id}

## packages/ui/src/components/AnalyticsAreaPicker.tsx
1: // AnalyticsAreaPicker — dumb component (AGENTS.md:76, grill Q7 lock).
2: // Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
3: // the caller picks a Managed System and pre-filters `options` accordingly.
8: import type { PickerOption } from './ManagedSystemPicker.js';
10: export interface AnalyticsAreaPickerProps {
11:   options: PickerOption[];
12:   value: string | null;
21: export function AnalyticsAreaPicker(props: AnalyticsAreaPickerProps) {
22:   const {
23:     options,
24:     value,
33:   function handleValueChange(next: string) {
40:       value={value ?? ''}
41:       onValueChange={handleValueChange}
46:       {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
47:       data-testid={testId ?? 'analytics-area-picker'}
50:       {options.map((opt) => {
51:         const label =
56:             value={opt.id}

## packages/ui/src/layout/PageShell.tsx
1: import type * as React from 'react';
3: import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
4: import { useDetailPanelSlot } from './useDetailPanelSlot';
6: export interface PageShellProps {
7:   /** Header content — title + optional actions. Uses ShellHeader (50px). */
8:   header?: ShellHeaderProps;
10:   children: React.ReactNode;
11:   /** Optional detail-panel intent. Forwarded to AppFrame's global slot via useDetailPanelSlot. */
18:  * PageShell — full-page content (Home, Settings, New VOC, Roadmap, Survey list).
19:  * Layout: 50px header + scrollable content. NO list rail. detailPanel forwards to AppFrame slot.
21: export function PageShell({
23:   children,
27: }: PageShellProps) {
28:   useDetailPanelSlot(detailPanel);
32:       data-shell="page"
34:       {header && <ShellHeader {...header} />}
35:       <div className={cn('flex-1 min-h-0 overflow-y-auto', contentClassName)}>{children}</div>

## packages/ui/src/layout/ListShell.tsx
1: import type * as React from 'react';
3: import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
4: import { useDetailPanelSlot } from './useDetailPanelSlot';
6: export interface ListShellProps {
7:   /** Toolbar (filter + sort + search). 50px ShellHeader variant="toolbar". */
8:   toolbar?: ShellHeaderProps;
9:   /** List rows. ListShell does NOT scroll itself — give the list its own overflow. */
13:   /** Optional detail-panel intent. Forwarded to AppFrame's global slot. */
19:  * ListShell — filter+list+detail routes (VOC inbox/my, Tasks, Findings, Evidence, Entity Links).
20:  * Layout: 50px toolbar + optional tabs + main list. detailPanel forwards to AppFrame slot.
22: export function ListShell({ toolbar, list, tabs, detailPanel, className }: ListShellProps) {
23:   useDetailPanelSlot(detailPanel);
27:       data-shell="list"
29:       {toolbar && <ShellHeader {...toolbar} variant="toolbar" />}

## packages/ui/src/layout/WorkbenchShell.tsx
1: import type * as React from 'react';
3: import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
4: import { useDetailPanelSlot } from './useDetailPanelSlot';
6: export interface WorkbenchShellProps {
8:   toolbar?: ShellHeaderProps;
10:   children: React.ReactNode;
11:   /** Optional detail-panel intent. Forwarded to AppFrame's global slot. */
17:  * WorkbenchShell — work surfaces that aren't simple lists (Triage Console, Tasks board,
18:  * Survey builder/result). Layout: 50px toolbar + workspace body. detailPanel forwards to AppFrame.
20: export function WorkbenchShell({ toolbar, children, detailPanel, className }: WorkbenchShellProps) {
21:   useDetailPanelSlot(detailPanel);
25:       data-shell="workbench"
27:       {toolbar && <ShellHeader {...toolbar} variant="toolbar" />}
28:       <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

## packages/ui/src/layout/ShellHeader.tsx
1: import type * as React from 'react';
4: export interface ShellHeaderProps {
9:   /** Toolbar slot — filters, actions, search. Right-aligned. */
17:  * Shared 50px header used by all three shells + detail panel + sidebar system header.
20: export function ShellHeader({
26: }: ShellHeaderProps) {
30:         'flex items-center justify-between gap-3 px-4 h-toolbar border-b border-border-subtle bg-surface-canvas',
35:       data-shell-header={variant}
38:       <div className="flex items-center gap-2 min-w-0 flex-1">
42:       {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}

## packages/ui/src/layout/useDetailPanelSlot.ts
2: import type { ReactNode } from 'react';
4: interface DetailPanelSlotContext {
9: export const DetailPanelSlotContext = createContext<DetailPanelSlotContext | null>(null);
12:  * Hook a shell uses to forward its `detailPanel?` prop into the AppFrame's global slot.
13:  * One slot, one registrant per lifetime. Calling from two shells with overlapping lifetimes
16:  * AppFrame in apps/frontend/src/lib/layout/ provides the context. If a shell renders outside
17:  * AppFrame (storybook, ad-hoc tests), the hook is a no-op.
19: export function useDetailPanelSlot(node: ReactNode | undefined): void {
20:   const ctx = useContext(DetailPanelSlotContext);
21:   const keyRef = useRef<string>(Math.random().toString(36).slice(2));

## apps/frontend/src/lib/layout/AppFrame.tsx
2: import { DetailPanelSlotContext, cn } from '@fops/ui';
3: import { AppRail } from './AppRail';
4: import { AppSidebar, type SidebarNavEntry } from './AppSidebar';
6: export interface AppFrameProps {
9:   /** The shell-rendered route content. AppFrame is NOT itself a shell. */
10:   children: React.ReactNode;
14: interface SlotEntry {
20:  * App frame for authenticated routes. Composes Rail(52) + Sidebar(240/56) + shell outlet + DetailPanelSlot(440).
22:  * NOT a shell — does NOT live in packages/ui. The shell taxonomy is fixed at exactly three
23:  * (PageShell / ListShell / WorkbenchShell per ADR-0020). AppFrame composes one of those as its outlet.
25: export function AppFrame({ sidebarEntries, workspaceName, children, className }: AppFrameProps) {
26:   const [slots, setSlots] = React.useState<SlotEntry[]>([]);
28:   const setContent = React.useCallback((key: string, node: React.ReactNode) => {
29:     setSlots((prev) => {
30:       const filtered = prev.filter((s) => s.key !== key);
33:           `[AppFrame] DetailPanelSlot already has a registrant. New registration "${key}" overrides previous keys: ${filtered.map((s) => s.key).join(', ')}. Only one shell should forward detailPanel per route.`,
40:   const clear = React.useCallback((key: string) => {
41:     setSlots((prev) => prev.filter((s) => s.key !== key));
44:   const slotNode = slots[slots.length - 1]?.node;
45:   const slotOpen = slotNode !== undefined && slotNode !== null;
47:   // Memoize context value so shells' useDetailPanelSlot effect does not re-fire
48:   // on every AppFrame re-render. Without this, ctx reference changes each render
49:   // → effect re-runs → setContent → setState → re-render → infinite loop.
50:   const ctxValue = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);
53:     <DetailPanelSlotContext.Provider value={ctxValue}>
55:         <AppRail />
57:           <AppSidebar entries={sidebarEntries} workspaceName={workspaceName} />
59:           <AppSidebar entries={sidebarEntries} />
62:           {children}
67:             slotOpen ? '' : 'w-0',
70:           data-testid="app-detail-slot"
71:           data-open={slotOpen ? 'true' : 'false'}
73:             slotOpen
78:           {slotOpen && slotNode}
81:     </DetailPanelSlotContext.Provider>

## apps/frontend/src/lib/layout/AppRail.tsx
1: import { cn } from '@fops/ui';
4: export interface AppRailProps {
10:  * Per-feature entries land in their own issue (AGENTS.md two-consumer rule). #18 ships placeholders.
12: export function AppRail({ className }: AppRailProps) {
16:         'flex flex-col items-center gap-3 py-3 bg-surface-sidebar border-r border-border-subtle',
25:         className="w-8 h-8 rounded-md bg-surface-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary"
33:         className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
40:         className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
47:         className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"

## apps/frontend/src/lib/layout/AppSidebar.tsx
3: import { cn } from '@fops/ui';
5: export interface SidebarNavEntry {
13: export interface AppSidebarProps {
21: const STORAGE_KEY = 'appSidebarCollapsed';
23: function readInitialCollapsed(defaultValue: boolean): boolean {
24:   if (typeof window === 'undefined') return defaultValue;
28:     return defaultValue;
32: export function AppSidebar({
37: }: AppSidebarProps) {
38:   const [collapsed, setCollapsed] = React.useState(() => readInitialCollapsed(defaultCollapsed));
40:   const toggle = React.useCallback(() => {
42:       const next = !prev;
66:         className="flex items-center justify-between border-b border-border-subtle px-3"
75:           className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
93:                   'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md mx-2 text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
94:                   e.active && 'bg-surface-row-selected text-text-primary',

## apps/frontend/AGENTS.md
14: - Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
17: - Reuse `ObjectList`, `DetailPanel`, `StatusBadge`, `SignalBadge`, `PermissionBlockedPanel`, `RichContentEditor`, and `LinkedEntityTrail` before making a screen-specific variant.
20: - Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
23: - Top-level feature folders are `home`, `my-work`, `voc`, `surveys`, `tasks`, `integration`, and `admin`.
42: - Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.

## packages/ui/CONTEXT.md

## docs/frontend/specs/voc.md
1: # VOC Frontend Implementation Spec — Slice 3
4: > Stack: React 18 + TypeScript 5 + Tailwind 3 + shadcn/ui (production), TipTap (rich content, per ADR-0002 / ADR-0011), TanStack Router (production route shell — see `apps/frontend/src/routes/`).
5: > Authority: AGENTS.md > CONTEXT.md > docs/adr > docs/implementation. Spec docs win every disagreement with the prototype (HANDOFF.md Rule 4).
11: ### What this spec covers (Slice 3 VOC)
13: - **Create VOC** — `/vocs?action=create` form, including attachments dropzone, MS / AA pickers, `voc-description` rich editor surface.
14: - **VOC Inbox** — `/vocs?view=inbox` list-first + RightDetailPanel, with tab filters (Untriaged / High / Unassigned / Similar / No-link), `<ListFilterButton>`, `<ListSortButton>`, bulk-select toolbar.
15: - **My VOCs** — `/vocs?view=my` reuses Inbox list mechanics filtered by `reporter_id = me`.
16: - **Triage Console** — `/vocs?view=triage`, expanded-row queue, severity-decide / owner-assign / AA-link / cluster confirm, optimistic mutation + 4-second undo toast.
17: - **VOC Detail Panel** — identity, triage block, description (TipTap read render), linked-execution section, linked-entity trail, public timeline, internal timeline, three-tab composer (Public Update / Reporter Reply / Internal Comment), Re
21: - **VOC Cluster** (`/vocs/clusters`) — Slice 3+ (separate spec).
22: - **Finding create flow from VOC** (`POST /vocs/:id/create-finding` UI) — Slice 5 (`docs/frontend/specs/finding.md`, TBD).
23: - **Task Request from VOC** (`POST /vocs/:id/request-task` UI) — Slice 6 (`docs/frontend/specs/task-request.md`, TBD).
26: - **Mobile / tablet layouts** — desktop-only per HANDOFF §11; basic responsive guardrails inherited from `AppShell`.
34: | VOC system design | `docs/design/04-voc-system.md` |
38: | API contract | `docs/implementation/03-api-contracts.md` §VOC Create And Conversation |
45: | Prototype operating rules | `docs/design-prototype/HANDOFF.md`, `docs/design-prototype/DESIGN-MAP.md` |
46: | Prototype visual baselines | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png`, `voc-triage-console.png`, `voc-new.png`, `voc-clusters.png` (+ `manifest.json` for `mustSurvive` contract) |
47: | Frontend module guide | `apps/frontend/AGENTS.md`, `apps/frontend/src/features/voc/AGENTS.md` (TBD — write at S3-006 prologue) |
54: Production uses TanStack Router (`apps/frontend/src/routes/`) with query-param state. The prototype's `#route=voc&view=inbox&selected=...` maps to `/vocs?view=inbox&selected=...`.
58: | R-VOC-INBOX | `/vocs?view=inbox` | `apps/frontend/src/features/voc/routes/InboxRoute.tsx` → `<VocInboxScreen>` | `view=inbox` | `managedSystem=:msId\|all`, `selected=:vocId`, `tab=untriaged\|high\|unassigned\|similar\|no-link`, `filter.se
59: | R-VOC-MY | `/vocs?view=my` | Same screen, `reporter_id=me` server filter | `view=my` | `selected=:vocId` | `<VocDetailPanel>` | Same | "내가 제출한 VOC가 없습니다" + Submit CTA | Same | Always available to authenticated actor |
60: | R-VOC-TRIAGE | `/vocs?view=triage` | `apps/frontend/src/features/voc/routes/TriageRoute.tsx` → `<VocTriageScreen>` | `view=triage` | `triage=unassigned\|untriaged\|high\|waiting`, `managedSystem=:msId\|all`, `selected=:vocId` | `<TriagePa
61: | R-VOC-CREATE | `/vocs?action=create` | `apps/frontend/src/features/voc/routes/CreateRoute.tsx` → `<VocCreateScreen>` | `action=create` | `managedSystem=:msId` (seeds picker), `prefill=…` (future) | none (full-page form) | Skeleton form | 
62: | R-VOC-DETAIL | `/vocs?view=inbox&selected=:vocId` (no standalone page in Slice 3) | `<VocDetailPanel>` mounts inside whichever list route owns selection | `selected=:vocId` | — | n/a (panel itself) | Panel skeleton blocks | n/a | If `GET 
65: - Filter, tab, sort, and `selected` MUST round-trip through URL; refresh on a selected URL must restore the panel.
66: - Closing the panel clears `selected=` but preserves filters, sort, tab, scroll.
68: - For Developers, `managedSystem=all` resolves to the actor's effective scope union (per ADR-0019 Section D + backend `actor.effective_scope`); for Users on My VOCs, `all` is hidden.
72: **Future Slice 3+ routes (called out but not implemented here):** `/vocs/clusters?selected=:clusterId` — owned by VOC Cluster spec.
78: Production tree under `apps/frontend/src/features/voc/`. Shared primitives live in `packages/ui/src/` (extracted only after a second feature consumer exists, per `apps/frontend/AGENTS.md`).
82: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
84: | `<DetailPanelHeader kind="voc" id … extras>` | `<DetailPanelHeader>` in `packages/ui/src/panel/` (custom — no shadcn equivalent) | none (Tailwind + `lucide-react` for icons) | `kind: 'voc' \| 'finding' \| 'task' \| ...10 kinds`, `id: stri
85: | `<PanelTitleBlock>` | `<PanelTitleBlock>` in `packages/ui/src/panel/` | none | `title: string`, `children: ReactNode` (badges row) | Default; long-title truncation via Tailwind `line-clamp-2` |
86: | `<NestedTextBlock>` | `<NestedTextBlock>` in `packages/ui/src/panel/` | none | `padding?: number`, `children: ReactNode` | Default only |
87: | `<FieldRow>` | `<FieldRow>` in `packages/ui/src/panel/` | none | `label: string`, `children: ReactNode` | Default |
88: | `<PanelSectionTitle>` | `<PanelSectionTitle>` in `packages/ui/src/panel/` | none | `children: ReactNode`, `action?: ReactNode` | Default |
89: | `<Callout tone icon title action>` | `<Callout>` in `packages/ui/src/feedback/` | shadcn `<Alert>` (variant prop replaced by `tone`) | `tone: 'amber' \| 'red' \| 'blue' \| 'cyan' \| 'emerald'`, `icon: IconName`, `title: string`, `action?:
95: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
97: | `<VocList>` + `<VocRow>` | `<VocList>` + `<VocRow>` in `features/voc/components/list/` | none (Tailwind grid, `<Checkbox>` from shadcn for row checkbox) | `vocs: VocListItem[]`, `selectedId: string \| null`, `onSelect: (id) => void`, `che
98: | Bulk action bar (inline in `<VocList>`) | `<VocBulkActionBar>` in `features/voc/components/list/` | shadcn `<Button>` | `selectedIds: string[]`, `onAssign`, `onSetSeverity`, `onAddToCluster`, `onCreateFinding`, `onClear` | hidden when `se
99: | `<ListToolbar tabs activeTab onTabChange action>` | `<ListToolbar>` in `packages/ui/src/toolbar/` | shadcn `<Tabs>` for tab strip | `tabs: TabDescriptor[]`, `activeTab: string`, `onTabChange`, `action?: ReactNode`, `children?: ReactNode` 
100: | `<ListFilterButton categories applied onChange onClear>` | `<ListFilterButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<Checkbox>` group | `categories: FilterCategory[]`, `applied: Record<string, Set<string>>`, `onChange: (
101: | `<ListSortButton fields value onChange>` | `<ListSortButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<RadioGroup>` | `fields: SortField[]`, `value: string` (`'<field>:<asc\|desc>'`), `onChange` | closed · open · sorted (chi
102: | `<SearchInput placeholder>` | `<SearchInput>` in `packages/ui/src/forms/` | shadcn `<Input>` + leading icon | `placeholder`, `value?`, `onChange?`, `onSubmit?` | default · focus · with-value |
107: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
109: | `<TriageQueueRow>` (expanded 96px row) | `<TriageRow>` in `features/voc/components/triage/` | none | `voc: TriageQueueItem`, `selected`, `onSelect` | default · selected · stale (when optimistic-removed elsewhere) |
110: | `<TriagePanel>` | `<TriagePanel>` in `features/voc/components/triage/` | shadcn `<RadioGroup>` for severity, `<Button>` ghost for cluster decision | `voc: VocDetail`, `onAct: (kind: 'confirm' \| 'finding' \| 'skip') => void` | dirty · cle
111: | Severity picker grid | `<SeverityPicker>` in `features/voc/components/triage/` | shadcn `<ToggleGroup>` | `value`, `onChange`, `disabled?` | 4 options, color bar per option |
112: | Owner picker rows | `<OwnerPicker>` in `features/voc/components/triage/` | shadcn `<Combobox>` (when count > 5) or `<RadioGroup>` rows | `candidates: ActorChoice[]`, `value: string \| null`, `onChange`, `loadMore?` | default · loading sug
117: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
119: | `<PageShell>` | `<PageShell>` in `packages/ui/src/layout/` | none | `title`, `subtitle?`, `eyebrow?`, `actions?`, `back?`, `fluid?` | default |
120: | `<FieldLabel required tip>` | `<FieldLabel>` in `packages/ui/src/forms/` | shadcn `<Label>` + `<Tooltip>` (for `tip`) | `required?: boolean`, `tip?: string`, `children: ReactNode` | required · with-tip · default |
121: | Managed System chip selector | `<ManagedSystemPicker>` in `packages/ui/src/pickers/` (already named in `component-inventory.md`) | shadcn `<ToggleGroup>` (chip style) | `value: string`, `onChange`, `options: ManagedSystemRef[]`, `disabled
122: | Analytics Area chip selector | `<AnalyticsAreaPicker>` in `packages/ui/src/pickers/` | shadcn `<ToggleGroup>` | `managedSystemId: string`, `value: string \| null`, `onChange`, `allowEmpty: true` (defaults to true; user may pick 없음) | defa
123: | Source segmented control | shadcn `<Tabs>` (segmented variant) wrapped as `<SourceContextSegmented>` in `features/voc/components/create/` | shadcn `<Tabs>` | `value: 'Direct Use' \| 'Proxy Report' \| 'Operational Discovery' \| 'Stakeholde
124: | Dropzone + file list | `<AttachmentDropzone>` + `<AttachmentRow>` in `features/voc/components/create/` | none (HTML5 drag/drop + shadcn `<Card>` for rows) | `attachments: PendingAttachment[]`, `onAdd`, `onRemove`, `maxBytes: 25 * 1024 * 1
125: | `<RichEditor surface="voc-description">` | `<RichEditor>` in `packages/ui/src/rich-content/` (TipTap-based per ADR-0011) | none (TipTap React) | `surface: 'voc-description' \| 'reporter-reply' \| 'public-update' \| 'internal-comment'`, `v
130: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
132: | Composer tab strip | `<ComposerTabs>` in `features/voc/components/detail/` | shadcn `<Tabs>` | `value: 'public' \| 'reply' \| 'internal'`, `onChange` | tab-active per surface; the `internal` tab Preview button is disabled (intentional, pe
133: | Public-update composer body | `<PublicUpdateComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="public-update">` + `<ReporterStatusChangeBlock>` + `<ComposerFooter>` | `voc: VocDetail`, `task: TaskRef \| null`
134: | Reporter-reply composer | `<ReporterReplyComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="reporter-reply">` | `voc`, `draftDoc`, `onChange`, `onSend`, `onPreview` | dirty · clean · sending |
135: | Internal-comment composer | `<InternalCommentComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="internal-comment">` | `voc`, `draftDoc`, `onChange`, `onAdd` | dirty · clean · sending |
136: | `<ReporterStatusChangeBlock>` | `<ReporterStatusChangeBlock>` in `features/voc/components/detail/` (NOT extracted to `packages/ui` — single consumer per Pack 8 comment) | shadcn `<Select>` for picker | `voc: VocDetail`, `task: TaskRef \| 
137: | `<ComposerPublicPreview>` (inside modal) | `<ComposerPublicPreview>` in `features/voc/components/detail/` | none | `voc`, `owner`, `nextStatus`, `draftDoc` | with-body · empty-body (italic placeholder) |
138: | `<ComposerReplyPreview>` (inside modal) | `<ComposerReplyPreview>` in `features/voc/components/detail/` | none | `voc`, `owner`, `reporter`, `draftDoc` | with-body · empty-body |
139: | `<PreviewModal>` | `<PreviewModal>` in `packages/ui/src/feedback/` | shadcn `<Dialog>` (size `lg`) | `open`, `onClose`, `title`, `children` | open · closed |
143: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
145: | `<ReporterStatusBadge status>` | `<ReporterStatusBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (pill variant — `rounded-full`) | `status: ReporterFacingStatus` (8 enum values) | 8 colors via `--status-reporter-*`; **always pill-
146: | `<InternalTaskBadge status>` | `<InternalTaskBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (squared variant — `rounded-sm`) | `status: InternalTaskStatus` (7 enum values) | 7 colors via `--status-internal-*`; **always squared** 
148: | `<ManagedSystemPill id>` | `<ManagedSystemPill>` in `packages/ui/src/badges/` | shadcn `<Badge>` (variant outline + 12px color mark) | `id: string` (resolves to `{ name, color, mark }` via `useManagedSystem(id)`) | 4 MSs in MVP fixtures; 
149: | `<OutlineBadge>` | `<OutlineBadge>` in `packages/ui/src/badges/` | shadcn `<Badge variant="outline">` | `children`, `color?` | default |
150: | `<EntityIconBadge type size>` | `<EntityIconBadge>` in `packages/ui/src/badges/` | none | `type: 'voc' \| 'finding' \| 'task' \| 'request' \| 'evidence' \| 'survey' \| 'outcome'`, `size?: number` | 7 letter glyphs |
154: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
156: | `<PermissionBlockedPanel state category reason requiredScope summary>` | `<PermissionBlockedPanel>` in `packages/ui/src/permissions/` | shadcn `<Alert>` (custom layout) | `state: 'request_access' \| 'summary_visible' \| 'denied' \| 'block
157: | `<EntityHoverPreview type id blocked>` | `<EntityHoverPreview>` in `packages/ui/src/hover/` | shadcn `<HoverCard>` | `type: 'voc' \| 'finding' \| 'task' \| 'evidence' \| 'request'`, `id: string`, `blocked?: PermissionDecision \| null`, `c
159: | `<LinkedEntityTrail nodes selectedKey onNodeClick>` | `<LinkedEntityTrail>` in `packages/ui/src/entity/` | none | `nodes: TrailNode[]`, `selectedKey?: string`, `onNodeClick?` | default · selected-node · placeholder-node (dashed) · blocked
160: | `<UserChip user size sub>` | `<UserChip>` in `packages/ui/src/identity/` | none (Tailwind + `<Avatar>`) | `user: ActorRef`, `size?: 'sm' \| 'md'`, `sub?: string` | default · unknown (renders "Unknown") |
165: | Prototype surface | Production component | shadcn/ui base | Props | State variants |
168: | VOC command entries | descriptors registered in `features/voc/command-catalog.ts` | n/a | descriptors: `go-voc-inbox`, `go-voc-triage`, `go-voc-my`, `go-clusters`, `new-voc`, `open-<id>` (recent VOCs) | each carries `disabledReason?` from
172: `<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Combobox>`, `<Checkbox>`, `<RadioGroup>`, `<Tooltip>`, `<Popover>`, `<Dialog>`, `<Drawer>`, `<Toast>`, `<Skeleton>`. Use these directly — do not re-wrap.
178: Prototype mock entity → production DTO. **snake_case at HTTP boundary, camelCase in services + components** (per `apps/backend/AGENTS.md`). Frontend uses TypeScript types generated from Zod schemas in `packages/shared/src/vocs/`.
180: ### 4.1 VOC core record
182: | Prototype `Voc` field (`data.js`) | Production HTTP field (`docs/design/15-data-contracts.md`) | Frontend camelCase | Notes / gaps |
184: | `id` (e.g. `VOC-2814`) | `id: uuid` | `id: string` | Prototype uses readable slugs; production uses UUID v7. Display slugs (`VOC-####`) are derived server-side or rendered via `useVocDisplayId(id)`. **GAP:** the display-slug rendering rul
186: | `description` (plain string) | `description_rich_content: rich_content` (TipTap JSON, ADR-0011) | `descriptionRichContent: TipTapDoc` | Prototype stores plain text; production stores TipTap JSON in `jsonb`. Render via `<RichContentRendere
187: | `reporter` (`u-1`) | `reporter_id: uuid` | `reporterId: string` | Resolved via `useActor(reporterId)` hook; backend may inline `reporter: ActorRef` envelope on `GET /vocs/:id`. |
189: | `analyticsArea` | `analytics_area_id: uuid \| null` | `analyticsAreaId: string \| null` | Must belong to `primary_managed_system_id` (enforced server-side, validated client-side by picker). |
190: | `severity` | `severity: enum(low\|medium\|high\|critical) \| null` | `severity: Severity \| null` | Null until triage. Never submitted on create (FR-VOC-001). |
192: | `internalState` (`triaged`/`unassigned`) | `triage_state: enum(untriaged\|triaged\|needs_more_information\|dismissed_not_actionable)` | `triageState: TriageState` | Prototype values (`unassigned`, `in_progress`, `assigned`, `done`) do not
194: | n/a | `owner_team_id: uuid \| null` | `ownerTeamId: string \| null` | Teams are read-only in MVP per ADR-0018 / ADR-0019 Section C; the picker shows teams but cannot create them. |
197: | `similarCount` | `similar_count: integer` (from `GET /vocs/:id?include=similar_count`) | `similarCount: number` | **GAP:** API contract does not yet specify whether `similar_count` is inlined on list rows or fetched via `GET /vocs/:id/sim
198: | `linkedFindingId`, `linkedTaskId` | derived from `entity_links` per `docs/implementation/06-entity-linking-contract.md` | `linkedExecution: { findingRef?: EntityRef; taskRef?: EntityRef } \| null` | Backend should return inlined entity re
199: | `sourceContext` (display string) | `source_context: enum(direct_use\|proxy_report\|operational_discovery\|stakeholder_request)` | `sourceContext: SourceContext` | Prototype uses display strings (`'Direct Use'`); production uses the enum +
200: | `nextAction` (single string) | `next_actions: NextAction[]` per `docs/implementation/03-api-contracts.md` §Next Action Contract | `nextActions: NextAction[]` | Render the highest-priority `available` action in the sticky footer; surface t
201: | `cluster` (cluster id) | `cluster_id: uuid \| null` (TBD per VOC Cluster spec) | `clusterId: string \| null` | Cluster confirmation/dismissal lives in VOC Cluster spec; this spec only consumes presence. |
207: type PermissionDecisionState =
213: interface PermissionDecision {
226: Each entry is append-only (per `docs/implementation/03-api-contracts.md` §VOC Conversation).
228: | Field | Type | Notes |
231: | `voc_id: uuid` | required | |
238: **GAP:** `docs/design/15-data-contracts.md` lists VOC but does not enumerate the conversation tables. The shapes above are the minimum surface the frontend consumes; the migration spec lives in backend issue S3-001.
243: interface PendingAttachment {
254: Per-file limit: **25 MB** in the prototype Create form, **50 MB** in the RichEditor footer copy. Spec aligns to **25 MB per file** as the binding limit (the larger number is prototype copy drift). Production limit lives in ADR-0011 derivati
259: type ReporterFacingStatus =
263: interface ReporterStatusTransitions {
265:   forbidden: Partial<Record<ReporterFacingStatus, string>>; // value = reason
268: interface VocDetailEnvelope {
269:   // ...VOC fields...
278: Prototype hardcodes the matrix in `data.js · REPORTER_STATUS_TRANSITIONS`. Production reads it from `GET /vocs/:id`. The matrix in `data.js` is the spec for which transitions are allowed; backend S3-001 ships the same matrix server-side as 
288: | Inbox (`/vocs?view=inbox`) | `severity` (low/medium/high/critical), `reporterStatus` (8 states), `owner` (assigned / unassigned) | `createdAt`, `severity`, `reporterStatus` (each asc/desc) | `filter.severity=high,critical`, `filter.report
289: | Triage (`/vocs?view=triage`) | inline filter on the toolbar mirrors Inbox categories; **no Sort popover** — queue is sorted server-side as `unassigned first → severity desc → created asc` | n/a | `triage=unassigned\|untriaged\|high\|waiti
290: | My (`/vocs?view=my`) | `reporterStatus` only | `createdAt`, `reporterStatus` | same shape as Inbox |
292: **Multi-value encoding:** comma-separated in URL (`filter.severity=high,critical`); parsed back into `Set<string>` in component state.
294: **Group by:** **NOT supported on VOC surfaces in Slice 3** (group-by lives on Tasks board). State explicitly that the prototype Sort button is single-axis Sort only.
298: VOC verbs registered in `features/voc/command-catalog.ts`:
302: | `voc.navigate.inbox` | Navigate | "Go to · VOC · Inbox" | `/vocs?view=inbox` |
303: | `voc.navigate.triage` | Navigate | "Go to · VOC · Triage" | `/vocs?view=triage` |
304: | `voc.navigate.my` | Navigate | "Go to · VOC · My VOCs" | `/vocs?view=my` |
305: | `voc.create` | Create | "Create · New VOC" (`kbd: 'C'`) | `/vocs?action=create` |
306: | `voc.scope.switch` | Switch scope | "Switch · Managed System scope" | writes `managedSystem=:msId` |
307: | `voc.open.<id>` (recent 6) | Open | `${id} · ${title}` | `/vocs?view=inbox&selected=<id>` |
309: Per `docs/frontend/interaction-patterns.md` §Command menu: commands resolve via backend route-resolution endpoint when ambiguous (e.g. "Open VOC 2814" must be reachable even when the actor is on `/tasks`). Backend returns `route_intent: { r
313: Mirrors prototype `screen-voc-create.jsx · TriageScreen.handleAct`.
315: 1. User clicks `Triage 확정 & 다음 VOC` (or `Finding 만들기` / `보류`).
316: 2. Frontend computes `next` row, selects it, and removes the acted-on VOC from the local visible queue.
318: 4. Mutation fires: `PATCH /vocs/:id` with the triage payload, `Idempotency-Key: <uuidv4>` header (per ADR-0015).
320: 6. **On failure:** rollback local state (re-insert VOC), preserve user-entered values in the panel, toast with `tone: 'danger'`, show retry. Error body parsed per ADR-0012 (`code`, `message`, optional `requestable_permission`).
321: 7. **On undo:** the local optimistic state is reverted **before** the mutation completes (if still in-flight, send an abort signal; if already committed, send a compensating PATCH with the prior values + `Idempotency-Key: <different-uuid>`)
334: | Copy link | Copies `window.location.origin + /vocs?view=inbox&selected=<id>` to clipboard, toasts "링크가 복사되었습니다" | `navigator.clipboard.writeText` |
336: | Kebab → Mark read | `PATCH /vocs/:id/read-state` (TBD endpoint, S3-008 follow-up) | If not in Slice 3 backend, render the menu item with `disabledReason: 'Slice 3+에 출시 예정'` |
339: | Kebab → Archive | TBD (per Slice 2 archive policy in ADR-0019 Section A; archived VOCs are immutable) | Show confirmation dialog citing immutability |
341: For Slice 3, only Copy link + Expand land. The kebab menu items render but are disabled with the backend-provided reason (per `interaction-patterns.md` "Permission-blocked commands can appear disabled with reason").
345: - Triggered by the "Preview" button in `<ComposerFooter>`. Disabled on `internal` tab (intentional — internal notes have no public render).
346: - Renders `<ComposerPublicPreview>` or `<ComposerReplyPreview>` inside `<PreviewModal>`.
347: - Public preview reflects: VOC id, next `<ReporterStatusBadge>`, title, owner attribution, `descriptionRichContent` rendered through `<RichContentRenderer mode="reporter_visible">`, and a footer reminder ("첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다…").
350: ### 5.6 Permission-blocked surfaces (VOC)
352: VOC reads two `permission_decision` keys today:
357: | `source` (cross-reference only) | Not directly rendered by VOC; consumed by Evidence detail. Listed here for cross-spec consistency. |
359: Surface keys NOT consumed by VOC (listed for completeness — checked in other specs):
361: - `linkedVoc` → Task spec
363: `<PermissionBlockedPanel state="request_access">` CTA navigates to `/admin/permissions/requests?action=create&capability=read_finding&scope=<requiredScope>&source_entity=VOC:<vocId>&return=<currentUrl>`. Slice 3 does not ship in-product per
368: function usePermissionDecision(
370:   key: 'linkedFinding' | 'execution' | 'linkedVoc' | 'source'
374: ### 5.7 RichEditor per-surface contract
378: | `voc-description` | Bold, Italic, Underline, Code, List, Link, Attach | "본인이 직접 겪은 일을 기준으로 적어주세요. 첨부 파일은 25 MB 이하." | none |
385: Attachment uploads from inside the editor and from the Create form dropzone share the same backend interface (per ADR-0011 §Inline Attachments). The frontend abstraction: `useAttachmentUpload({ vocId?: string, scope: 'voc' | 'comment' })`.
389: - **Create form:** unsaved changes prompt `<DirtyConfirmation>` on navigate-away (browser back, sidebar nav click, ⌘K navigation). Save Draft button (prototype copy "초안 저장") is **NOT in Slice 3** — strip from the production form or surface 
390: - **Detail panel composers:** dirty state per surface (public / reply / internal). Switching tabs preserves each surface's draft in component state (per prototype `key={composerTab}` reset rule — production keeps drafts in a `useReducer` ke
391: - **Triage panel:** dirty when severity / owner / area / clusterAction differ from the loaded VOC. Confirm-and-next button is disabled until dirty.
395: **None in VOC scope.** Tasks board owns DnD. The Create form attachment dropzone is HTML5 drag/drop for file ingest only — not list reordering.
402: 2. Status picker is a `<Select>` listing **current first, then allowed transitions, then forbidden transitions (disabled with `· 차단됨` suffix)**. Allowed set comes from `voc.next_reporter_states.allowed`.
403: 3. If user selects a forbidden status (only possible via keyboard or stale data), a red `<Callout>` explains `voc.next_reporter_states.forbidden[next]` (e.g. "결과 확인 전에 해결됨으로 바꿀 수 없습니다.").
404: 4. If `voc.reporter_status_gate` blocks the staged status (e.g. linked Task not yet released), an amber `<Callout>` renders with an "Open task" CTA. **Publish button is disabled while the gate is active.**
405: 5. Reporter preview card mirrors the reporter inbox row: VOC id · new `<ReporterStatusBadge>` · 업데이트 chip · title · owner attribution · sanitized body excerpt · public-safe footer reminder.
406: 6. On Publish: `POST /vocs/:id/public-updates` with body `{ body_rich_content, next_reporter_facing_status, skip_public_update: false }`. **Status change and Public Update body are paired in one request** per ADR-0019 / API contract (atomic
413: | Severity decide | Click chip in `<SeverityPicker>` → local dirty state | none yet |
414: | Owner assign | Click `<OwnerPicker>` row → local dirty | none yet |
415: | AA link | Click `<AnalyticsAreaPicker>` chip → local dirty | none yet |
417: | Triage 확정 & 다음 VOC | Atomic `PATCH /vocs/:id` with `{ severity, owner_user_id, analytics_area_id, cluster_decision: 'confirm' \| 'dismiss' \| null, triage_state: 'triaged' }` + Idempotency-Key | `PATCH /vocs/:id` (backend service must app
418: | Finding 만들기 | Same triage commit, then navigate to Finding create flow (Slice 5) | flagged Slice 5; in Slice 3 just navigate to `/vocs?view=triage&selected=<id>` and toast that Finding creation is in Slice 5 |
422: - `voc_created`
423: - `voc_triage_committed` (severity / owner / AA / cluster decision)
424: - `voc_owner_assigned`
425: - `voc_severity_set`
426: - `voc_analytics_area_linked`
431: Full event vocab lives in backend audit module; this spec lists VOC-touching names so reviewers can validate Activity tab copy.
447: | `--surface-row-selected` | `bg-surface-row-selected` | `#1a1c20` | Row selected (`aria-selected=true`) |
475: | `--border-selected` | `border-border-selected` | `#5e6ad2` (Aether Blue) | Row selected ring |
492: ### 6.5 Internal task status (squared — `rounded-sm`) — referenced from VOC linked execution row, not authored here
515: | Token | Tailwind | Value | Usage |
517: | `--row-height-compact` | `h-row-compact` | 44px | List dense mode (not used in Slice 3 VOC) |
518: | `--row-height-default` | `h-row-default` | 60px | VOC Inbox / My rows |
546: VOC reads the following keys:
550: | `linkedFinding` | `GET /vocs/:id` envelope: `permission_decisions.linkedFinding` | Detail panel `Linked Finding` section + trail node + `Open finding` footer button (changes copy to `Request Finding access`) | `usePermissionDecision(voc, 
551: | `execution` | (not on VOC envelope — lives on Finding) | n/a here — cross-spec reference only | n/a |
552: | `linkedVoc` | (not on VOC envelope — lives on Task) | n/a here — cross-spec reference only | n/a |
553: | `source` | (not on VOC envelope — lives on Evidence) | n/a here — cross-spec reference only | n/a |
558: 1. Frontend renders VOC detail.
560: 3. If state === 'request_access': render CTA, on click navigate to /admin/permissions/requests?action=create with prefill.
561: 4. If state === 'summary_visible': render the safe summary slot.
562: 5. If state === 'denied' or 'blocked_not_requestable': render copy, no CTA.
563: 6. Below the panel, always render the audit footer:
573: All paths relative to the VOC service base (`/api` per `apps/backend/AGENTS.md` routing convention — confirm). All request bodies are snake_case JSON. All mutation endpoints accept optional `Idempotency-Key: <uuidv4>` (24-hour TTL). All res
575: ### 8.1 `POST /vocs` — Create
577: | Property | Value |
579: | Method / Path | `POST /vocs` |
582: | Forbidden fields | `reporter_id`, `severity`, `reporter_facing_status`, `triage_state`, `owner_user_id`, `owner_team_id`, `display_id` (per `packages/shared/src/vocs/create-request.ts FORBIDDEN_CREATE_FIELDS`) — client validation drops th
583: | Success response | `201 Created` with full VOC envelope including server-resolved `reporter_id`, `triage_state: 'untriaged'`, `reporter_facing_status: 'received'`, `next_actions`, `permission_decisions` |
584: | Error codes (ADR-0012) | `validation.failed` (422) · `validation.unexpected_field` (422 — forbidden server-resolved field in body) · `validation.malformed_idempotency_key` (422 — Idempotency-Key header present but not UUIDv4) · `voc.sever
586: | tx-scoped checks (ADR-0019 Section E pattern) | Service `createVoc` runs in a single tx; `SELECT … FOR UPDATE` on the parent MS row (and AA row, when present) to serialize against archive transactions. Per `apps/backend/AGENTS.md` Layer R
587: | Audit events | `voc_created` with `{ voc_id, primary_managed_system_id, analytics_area_id?, reporter_id, source_context }` |
589: ### 8.2 `GET /vocs` — List (Inbox / My / Triage)
591: | Property | Value |
593: | Method / Path | `GET /vocs` |
595: | Response | `{ items: VocListItem[], page: { cursor?, has_more: bool }, out_of_scope_summary?: { count, severity_distribution } }` |
596: | `out_of_scope_summary` | Present when actor's effective scope union contains VOCs the actor cannot see; powers the Triage `<PermissionBlockedPanel state="summary_visible">` peek banner |
597: | Errors | `permission.denied` (403 if actor lacks any VOC read scope) · `validation.failed` (bad cursor) |
598: | Caching | Stale-while-revalidate on TanStack Query, key `[ 'vocs', view, managedSystem, tab, filters, sort ]` |
600: ### 8.3 `GET /vocs/:id` — Detail
602: | Property | Value |
604: | Method / Path | `GET /vocs/:id` |
605: | Response | `VocDetailEnvelope` = `{ ...VocFields, next_actions, next_reporter_states, reporter_status_gate?, permission_decisions, linked_execution: { finding?, task? }, conversation_timeline?: ConversationEntry[] }` |
607: | Conversation pagination | If `conversation_timeline.has_more`, fetch via `GET /vocs/:id/conversation?cursor=`. **GAP:** decide whether timeline is inlined or always paginated — S3-002. |
609: ### 8.4 `PATCH /vocs/:id` — Triage commit / metadata edit
611: | Property | Value |
613: | Method / Path | `PATCH /vocs/:id` |
615: | Allowed fields | `severity` (Admin / Developer in MS scope only), `owner_user_id`, `owner_team_id`, `analytics_area_id`, `triage_state`, `cluster_decision` (`confirm` \| `dismiss` \| `null`). **NOT** `reporter_facing_status` (must go thro
616: | Forbidden in MVP | `severity` change after triage commits — clarify in §10 Q-SEVRETRIAGE; archived VOC rejects PATCH per ADR-0019 Section A (`409 conflict.record_archived`) |
618: | tx-scoped checks | `SELECT … FOR UPDATE` on the VOC row + parent MS row (ADR-0019 Section E extended pattern); permission re-check inside the same tx (ADR-0019 Section D step 5 for MS-scoped grants) |
619: | Audit events | `voc_triage_committed` (atomic), and individual events for any field that changed (`voc_owner_assigned`, `voc_severity_set`, `voc_analytics_area_linked`, `voc_cluster_decision_recorded`) |
621: ### 8.5 `POST /vocs/:id/public-updates`
623: | Property | Value |
625: | Method / Path | `POST /vocs/:id/public-updates` |
627: | Permission | Admin or Developer in same MS scope only (per `docs/design/04-voc-system.md:90`) |
636: ### 8.6 `POST /vocs/:id/reporter-replies`
638: | Property | Value |
640: | Method / Path | `POST /vocs/:id/reporter-replies` |
642: | Permission | Reporter on their own VOC only |
644: | Side effect | May return Waiting Reporter VOCs to the follow-up queue (per API contract); **must not** auto-change `reporter_facing_status` |
648: ### 8.7 `POST /vocs/:id/internal-comments`
650: | Property | Value |
652: | Method / Path | `POST /vocs/:id/internal-comments` |
659: ### 8.8 Headers, rate limit, error rendering
673: | `/vocs?view=inbox&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png` (full-page: `voc-inbox-detail-full.png`) | Reporter pill vs internal squared badge separation; 60px default row height; sticky `+ 
674: | `/vocs?view=triage&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-triage-console.png` | Expanded 96px rows; severity color bar; "Owner 없음" / "Area 미지정" red/amber meta tags; out-of-scope summary peek banner; 4-seco
675: | `/vocs?action=create` | `docs/design-prototype/screenshots/final-baselines/voc-new.png` | Two-column form (1fr + 320px sidebar); compact `<FieldLabel>` style; MS chip strip; AA chips disabled when MS unselected; HTML5 dropzone with 25 MB 
676: | `/vocs?view=my&selected=<id>` | reuse inbox baseline | Same as inbox but with `reporter_id=me` filter applied | Empty state copy differs ("내가 제출한 VOC가 없습니다") |
688: | Q1 (attachment storage) | Is the Slice 3 backend ready to accept attachment refs on `POST /vocs` (i.e. is the storage abstraction from ADR-0011 implemented), or does Slice 3 VOC ship without attachments? Frontend dropzone + `AttachmentRow
689: | Q2 (rich content format) | Confirm TipTap JSON in `jsonb` is locked for Slice 3 (ADR-0011 says yes; verify no downstream blocker). Frontend assumes TipTap throughout; if the decision flips to Lexical or sanitized HTML, every `<RichEditor>
690: | Q3 (Public Update + status change paired or separate) | The prototype always pairs them in one request. The API contract allows a `skip_public_update: true` path (status change without composing a public update body). Slice 3 UI: should t
691: | Q4 (AA owner vs MS default owner precedence) | ~~When the actor creates a VOC, multiple default-owner rules may apply…~~ **RESOLVED 2026-05-17 (Slice 3 #13):** `POST /vocs` does NOT resolve any default owner. `owner_user_id` and `owner_te
692: | Q5 (VOC Cluster scope in Slice 3) | Cluster confirm / dismiss is in the Triage panel mockup, but cluster CRUD lives in Slice 3+. Slice 3 VOC must either render the cluster section read-only (showing `similar_count` and an out-of-scope CTA
693: | Q6 (dev/test seed) | Production needs deterministic VOC seed data for E2E + integration tests. The prototype's `Vocs` fixture is the design intent; backend issue S3-001 must commit a parallel seed (or fixture loader) that hydrates `permis
694: | Q-DISPLAYID (newly surfaced) | The prototype renders `VOC-2814` as the human id. Production uses UUID v7. Who renders the display slug — backend (`display_id` column) or frontend (formatter that hashes UUID prefix)? Affects URLs (`/vocs?s
695: | Q-SEVRETRIAGE (newly surfaced) | Can severity change after triage commits, or is it locked? `docs/design/04-voc-system.md:117` says "severity is assigned during triage" but does not forbid retriage. Affects `PATCH /vocs/:id` allowed-field
696: | Q-CONVPAGINATION (newly surfaced) | Is `conversation_timeline` inlined on `GET /vocs/:id` or always paginated via `GET /vocs/:id/conversation`? Affects panel initial load size and timeline rendering. | Detail panel public + internal timel
697: | Q-STATUSGATECODE (newly surfaced) | The linked-Task gate (e.g. cannot mark `resolved` until task `released`) — does the backend return `reporter_facing_status.invalid_transition` (existing in ADR-0012 enum) or a new `reporter_facing_statu
705: | VOC Cluster CRUD, cluster detail panel | Slice 3+ spec (`docs/frontend/specs/voc-cluster.md`, TBD) |
706: | Finding create flow from VOC (`POST /vocs/:id/create-finding`) | Slice 5 (`docs/frontend/specs/finding.md`, TBD) |
707: | Task Request from VOC (`POST /vocs/:id/request-task`) | Slice 6 (`docs/frontend/specs/task-request.md`, TBD) |
713: | VOC read-state, snooze, archive | Slice 3+; menu items render disabled in Slice 3 |
714: | Saved list views (`/vocs?view=list`) | Slice 3+ |
715: | Draft VOC ("초안 저장") | Slice 5+ |
723: - [x] §3 component mapping covers every VOC-touching surface (header, list, toolbar, triage queue + panel, create form, composers, status block, badges, permission, hover, command)
724: - [x] §4 data mapping covers VOC record, permission envelope, conversation entries, pending attachment, reporter-status transitions
725: - [x] §5 interaction contract covers filters/sort, command palette, optimistic + undo, header actions, preview modal, permission surfaces, RichEditor allowlist, dirty save, drag/drop (explicitly none), reporter-status change, triage flow + 
727: - [x] §7 permission envelope maps four keys (only `linkedFinding` consumed by VOC) and specifies the `usePermissionDecision` hook + audit footer rule
728: - [x] §8 API mapping covers POST /vocs, GET /vocs, GET /vocs/:id, PATCH /vocs/:id, POST /vocs/:id/{public-updates, reporter-replies, internal-comments} with headers, errors, idempotency, tx checks, audit events

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba packages/ui/src/components/ManagedSystemPicker.tsx | sed -n '1,130p'; printf '\\n--- AA ---\\n'; nl -ba packages/ui/src/components/AnalyticsAreaPicker.tsx | sed -n '1,120p'; printf '\\n--- route vocs ---\\n'; nl -ba apps/frontend/src/routes/_authed/vocs.tsx | sed -n '1,220p'; printf '\\n--- authed ---\\n'; nl -ba apps/frontend/src/routes/_authed.tsx | sed -n '1,180p'; printf '\\n--- admin ms ---\\n'; nl -ba apps/frontend/src/routes/_authed/admin/managed-systems.tsx | sed -n '1,160p'; printf '\\n--- admin aa ---\\n'; nl -ba apps/frontend/src/routes/_authed/admin/analytics-areas.tsx | sed -n '1,180p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
     1	// ManagedSystemPicker — dumb component (AGENTS.md:76, ADR-0018 picker Q7).
     2	// No fetch, no API import; the consuming route supplies pre-fetched options.
     3	// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).
     4	// Dumb-prop contract preserved (PickerOption[], onChange(string|null)).
     5	
     6	import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';
     7	import { cn } from '../utils/cn.js';
     8	
     9	export interface PickerOption {
    10	  id: string;
    11	  label: string;
    12	  archived?: boolean;
    13	}
    14	
    15	export interface ManagedSystemPickerProps {
    16	  options: PickerOption[];
    17	  value: string | null;
    18	  onChange: (id: string | null) => void;
    19	  disabled?: boolean;
    20	  /** When true, the rendered label appends ` (archived)` for archived rows. */
    21	  includeArchivedInLabel?: boolean;
    22	  /** Accessible name for the picker group (also used as aria-label fallback). */
    23	  placeholder?: string;
    24	  /** Test id propagated as `data-testid`. */
    25	  testId?: string;
    26	  className?: string;
    27	}
    28	
    29	export function ManagedSystemPicker(props: ManagedSystemPickerProps) {
    30	  const {
    31	    options,
    32	    value,
    33	    onChange,
    34	    disabled,
    35	    includeArchivedInLabel,
    36	    placeholder,
    37	    testId,
    38	    className,
    39	  } = props;
    40	
    41	  function handleValueChange(next: string) {
    42	    // Radix ToggleGroup type="single" emits '' when the active item is re-toggled.
    43	    onChange(next === '' ? null : next);
    44	  }
    45	
    46	  return (
    47	    <ToggleGroup
    48	      type="single"
    49	      value={value ?? ''}
    50	      onValueChange={handleValueChange}
    51	      {...(disabled ? { disabled: true } : {})}
    52	      variant="outline"
    53	      size="sm"
    54	      aria-label={placeholder ?? 'Select Managed System'}
    55	      {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
    56	      data-testid={testId ?? 'managed-system-picker'}
    57	      className={cn('flex flex-wrap justify-start gap-2', className)}
    58	    >
    59	      {options.map((opt) => {
    60	        const label =
    61	          includeArchivedInLabel && opt.archived ? `${opt.label} (archived)` : opt.label;
    62	        return (
    63	          <ToggleGroupItem
    64	            key={opt.id}
    65	            value={opt.id}
    66	            aria-label={label}
    67	            className="rounded-pill border border-border-subtle px-3 data-[state=on]:bg-accent-primary data-[state=on]:text-text-inverse data-[state=on]:border-accent-primary"
    68	          >
    69	            {label}
    70	          </ToggleGroupItem>
    71	        );
    72	      })}
    73	    </ToggleGroup>
    74	  );
    75	}

--- AA ---
     1	// AnalyticsAreaPicker — dumb component (AGENTS.md:76, grill Q7 lock).
     2	// Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
     3	// the caller picks a Managed System and pre-filters `options` accordingly.
     4	// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).
     5	
     6	import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';
     7	import { cn } from '../utils/cn.js';
     8	import type { PickerOption } from './ManagedSystemPicker.js';
     9	
    10	export interface AnalyticsAreaPickerProps {
    11	  options: PickerOption[];
    12	  value: string | null;
    13	  onChange: (id: string | null) => void;
    14	  disabled?: boolean;
    15	  includeArchivedInLabel?: boolean;
    16	  placeholder?: string;
    17	  testId?: string;
    18	  className?: string;
    19	}
    20	
    21	export function AnalyticsAreaPicker(props: AnalyticsAreaPickerProps) {
    22	  const {
    23	    options,
    24	    value,
    25	    onChange,
    26	    disabled,
    27	    includeArchivedInLabel,
    28	    placeholder,
    29	    testId,
    30	    className,
    31	  } = props;
    32	
    33	  function handleValueChange(next: string) {
    34	    onChange(next === '' ? null : next);
    35	  }
    36	
    37	  return (
    38	    <ToggleGroup
    39	      type="single"
    40	      value={value ?? ''}
    41	      onValueChange={handleValueChange}
    42	      {...(disabled ? { disabled: true } : {})}
    43	      variant="outline"
    44	      size="sm"
    45	      aria-label={placeholder ?? 'Select Analytics Area'}
    46	      {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
    47	      data-testid={testId ?? 'analytics-area-picker'}
    48	      className={cn('flex flex-wrap justify-start gap-2', className)}
    49	    >
    50	      {options.map((opt) => {
    51	        const label =
    52	          includeArchivedInLabel && opt.archived ? `${opt.label} (archived)` : opt.label;
    53	        return (
    54	          <ToggleGroupItem
    55	            key={opt.id}
    56	            value={opt.id}
    57	            aria-label={label}
    58	            className="rounded-pill border border-border-subtle px-3 data-[state=on]:bg-accent-primary data-[state=on]:text-text-inverse data-[state=on]:border-accent-primary"
    59	          >
    60	            {label}
    61	          </ToggleGroupItem>
    62	        );
    63	      })}
    64	    </ToggleGroup>
    65	  );
    66	}

--- route vocs ---
     1	// /vocs — per-view shell selection route. Auth gate is inherited from
     2	// the /_authed pathless layout route. Shell selection follows ADR-0020
     3	// §taxonomy lock: inbox/my → ListShell, triage → WorkbenchShell,
     4	// action=create → PageShell. Feature content (list rows, detail panel,
     5	// create form, triage queue) lands in #19 / #20 / #21.
     6	
     7	import { ListShell, PageShell, WorkbenchShell } from '@fops/ui';
     8	import { Link, createFileRoute, useSearch } from '@tanstack/react-router';
     9	import { z } from 'zod';
    10	
    11	const vocSearchSchema = z
    12	  .object({
    13	    view: z.enum(['inbox', 'my', 'triage']).optional(),
    14	    action: z.enum(['create']).optional(),
    15	    selected: z.string().uuid().optional(),
    16	    managedSystem: z.string().optional(),
    17	    tab: z.string().optional(),
    18	    sort: z.string().optional(),
    19	    // filter.* keys reserved for #20 per-view filters. Declared as explicit
    20	    // dot-keys here to keep .strict() — no open-ended passthrough.
    21	    'filter.severity': z.string().optional(),
    22	    'filter.reporterStatus': z.string().optional(),
    23	    'filter.owner': z.string().optional(),
    24	  })
    25	  .strict(); // reject unknown query keys — prevents link-poisoning as #20 grows
    26	
    27	type VocSearch = z.infer<typeof vocSearchSchema>;
    28	
    29	export const Route = createFileRoute('/_authed/vocs')({
    30	  validateSearch: (raw) => vocSearchSchema.parse(raw),
    31	  component: VocRouteShell,
    32	});
    33	
    34	// Exported for testing — tests mount this component directly in a createRoute harness.
    35	export function VocRouteShell() {
    36	  // useSearch() (without route arg) reads from the nearest matched route context.
    37	  // This works in both the file-route context and test harnesses that mount
    38	  // this component as the route component.
    39	  const search = useSearch({ strict: false }) as VocSearch;
    40	
    41	  // Per-view shell selection. spec voc.md §2 + ADR-0020 §taxonomy lock.
    42	  if (search.action === 'create') {
    43	    return (
    44	      <PageShell header={{ title: 'New VOC' }}>
    45	        <Placeholder kind="create" />
    46	      </PageShell>
    47	    );
    48	  }
    49	  if (search.view === 'triage') {
    50	    return (
    51	      <WorkbenchShell toolbar={{ title: 'Triage Console' }}>
    52	        <Placeholder kind="triage" />
    53	      </WorkbenchShell>
    54	    );
    55	  }
    56	  // inbox / my / default
    57	  const view = search.view ?? 'inbox';
    58	  const title = view === 'my' ? 'My VOCs' : 'Inbox';
    59	  return (
    60	    <ListShell
    61	      toolbar={{
    62	        title,
    63	        actions: (
    64	          <Link
    65	            to="/vocs"
    66	            search={{ action: 'create' }}
    67	            className="text-sm text-accent-primary hover:underline"
    68	          >
    69	            + New VOC
    70	          </Link>
    71	        ),
    72	      }}
    73	      tabs={
    74	        <div className="flex gap-3 text-sm">
    75	          <ViewTab to={{ view: 'inbox' }} active={view === 'inbox'}>
    76	            Inbox
    77	          </ViewTab>
    78	          <ViewTab to={{ view: 'my' }} active={view === 'my'}>
    79	            My VOCs
    80	          </ViewTab>
    81	        </div>
    82	      }
    83	      list={<Placeholder kind={view} />}
    84	    />
    85	  );
    86	}
    87	
    88	function Placeholder({ kind }: { kind: string }) {
    89	  return (
    90	    <div className="p-8 text-center text-text-muted">
    91	      <p className="text-sm">
    92	        VOC routes — <code>{kind}</code> view.
    93	      </p>
    94	      <p className="text-xs mt-1">
    95	        Content lands in #19 (Create) / #20 (Inbox+Detail) / #21 (Triage).
    96	      </p>
    97	    </div>
    98	  );
    99	}
   100	
   101	function ViewTab({
   102	  to,
   103	  active,
   104	  children,
   105	}: {
   106	  to: { view: 'inbox' | 'my' | 'triage' };
   107	  active: boolean;
   108	  children: React.ReactNode;
   109	}) {
   110	  return (
   111	    <Link
   112	      to="/vocs"
   113	      search={to}
   114	      className={
   115	        active
   116	          ? 'border-b-2 border-accent-primary text-text-primary pb-1'
   117	          : 'text-text-muted hover:text-text-primary pb-1'
   118	      }
   119	    >
   120	      {children}
   121	    </Link>
   122	  );
   123	}

--- authed ---
     1	// _authed — pathless layout route. All authenticated routes live under this
     2	// file. URL paths are unchanged (/_authed is pathless in TanStack convention).
     3	//
     4	// Auth guard: beforeLoad runs fetchMe. If the session probe throws
     5	// UnauthenticatedError, the visitor is redirected to /login. Any other error
     6	// re-throws so TanStack Router surfaces it via the error boundary.
     7	//
     8	// AppFrame is mounted here, wrapping the downstream <Outlet>.
     9	// Shell taxonomy (PageShell / ListShell / WorkbenchShell) is applied per-route
    10	// INSIDE AppFrame — not here. ADR-0020 §taxonomy lock.
    11	
    12	import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
    13	import { AppFrame } from '../lib/layout/AppFrame';
    14	import { UnauthenticatedError, fetchMe } from '../lib/api.js';
    15	
    16	// Sidebar entries locked per Slice 3 #18 spec (C5).
    17	// Per-feature entries are added in their owning slice (AGENTS.md two-consumer rule).
    18	const SIDEBAR_ENTRIES = [
    19	  { id: 'inbox',    label: 'Inbox',            href: '/vocs?view=inbox' },
    20	  { id: 'my-vocs',  label: 'My VOCs',          href: '/vocs?view=my' },
    21	  { id: 'triage',   label: 'Triage',           href: '/vocs?view=triage' },
    22	  { id: 'create',   label: '+ New VOC',        href: '/vocs?action=create' },
    23	  // Admin entries — existing routes remain reachable via sidebar.
    24	  { id: 'admin-ms', label: 'Managed Systems',  href: '/admin/managed-systems' },
    25	  { id: 'admin-aa', label: 'Analytics Areas',  href: '/admin/analytics-areas' },
    26	];
    27	
    28	export const Route = createFileRoute('/_authed')({
    29	  beforeLoad: async ({ location }) => {
    30	    // Extracted verbatim from the per-route pattern used by all admin/* routes
    31	    // (managed-systems.tsx, analytics-areas.tsx, placeholder.tsx, index.tsx).
    32	    try {
    33	      await fetchMe();
    34	    } catch (err) {
    35	      if (err instanceof UnauthenticatedError) {
    36	        throw redirect({ to: '/login', search: { redirectTo: location.href } });
    37	      }
    38	      // Non-auth errors re-throw so TanStack Router's error boundary catches them.
    39	      throw err;
    40	    }
    41	  },
    42	  component: AuthedLayout,
    43	});
    44	
    45	function AuthedLayout() {
    46	  return (
    47	    <AppFrame sidebarEntries={SIDEBAR_ENTRIES}>
    48	      <Outlet />
    49	    </AppFrame>
    50	  );
    51	}

--- admin ms ---
     1	// /admin/managed-systems — Slice 2 #10 functional admin surface.
     2	//
     3	// Strict functional rendering only per the orchestrator's design-HTML-
     4	// pending rule: no visual polish, no shared MS picker component (that
     5	// lands with the AA slice). The route wraps the body in PermissionGate
     6	// (workspace.admin) and surfaces ADR-0012 error envelopes verbatim.
     7	
     8	import { Button } from '@fops/ui';
     9	import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
    10	import { createFileRoute } from '@tanstack/react-router';
    11	import { useState } from 'react';
    12	
    13	import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
    14	import {
    15	  ApiError,
    16	  type ManagedSystemDto,
    17	  type RegisterManagedSystemBody,
    18	  type UpdateManagedSystemBody,
    19	  archiveManagedSystem,
    20	  fetchManagedSystems,
    21	  registerManagedSystem,
    22	  updateManagedSystem,
    23	} from '../../../lib/api.js';
    24	
    25	export const Route = createFileRoute('/_authed/admin/managed-systems')({
    26	  component: ManagedSystemsAdminPage,
    27	});
    28	
    29	export function ManagedSystemsAdminPage() {
    30	  return (
    31	    <main className="mx-auto max-w-5xl p-8 space-y-6">
    32	      <h1 className="text-2xl font-semibold">Managed Systems</h1>
    33	      <PermissionGate capability="workspace.admin">
    34	        <ManagedSystemsBody />
    35	      </PermissionGate>
    36	    </main>
    37	  );
    38	}
    39	
    40	function envelopeMessage(err: unknown): string {
    41	  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
    42	  if (err instanceof Error) return err.message;
    43	  return 'unknown error';
    44	}
    45	
    46	const MANAGED_SYSTEMS_KEY = ['managed-systems'] as const;
    47	
    48	export function ManagedSystemsBody() {
    49	  const qc = useQueryClient();
    50	  const [includeArchived, setIncludeArchived] = useState(false);
    51	  const listQuery = useQuery({
    52	    queryKey: [...MANAGED_SYSTEMS_KEY, { includeArchived }] as const,
    53	    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    54	    retry: false,
    55	  });
    56	
    57	  async function invalidate() {
    58	    await qc.invalidateQueries({ queryKey: MANAGED_SYSTEMS_KEY });
    59	  }
    60	
    61	  return (
    62	    <section className="space-y-6">
    63	      <CreateForm onCreated={invalidate} />
    64	
    65	      <div className="space-y-2">
    66	        <label className="flex items-center gap-2 text-sm">
    67	          <input
    68	            type="checkbox"
    69	            checked={includeArchived}
    70	            onChange={(e) => setIncludeArchived(e.target.checked)}
    71	            data-testid="include-archived-checkbox"
    72	          />
    73	          Include archived
    74	        </label>
    75	
    76	        {listQuery.isPending ? (
    77	          <p className="text-sm text-text-muted">Loading…</p>
    78	        ) : listQuery.isError ? (
    79	          <p className="text-sm text-accent-danger">Error: {envelopeMessage(listQuery.error)}</p>
    80	        ) : listQuery.data.items.length === 0 ? (
    81	          <p className="text-sm text-text-muted">No managed systems.</p>
    82	        ) : (
    83	          <table
    84	            data-testid="managed-systems-table"
    85	            className="w-full border border-default text-sm"
    86	          >
    87	            <thead>
    88	              <tr className="text-left">
    89	                <th className="p-2">Slug</th>
    90	                <th className="p-2">Name</th>
    91	                <th className="p-2">External key</th>
    92	                <th className="p-2">Owner actor</th>
    93	                <th className="p-2">Owner team</th>
    94	                <th className="p-2">Archived</th>
    95	                <th className="p-2">Actions</th>
    96	              </tr>
    97	            </thead>
    98	            <tbody>
    99	              {listQuery.data.items.map((row) => (
   100	                <ManagedSystemRow key={row.id} row={row} onChanged={invalidate} />
   101	              ))}
   102	            </tbody>
   103	          </table>
   104	        )}
   105	      </div>
   106	    </section>
   107	  );
   108	}
   109	
   110	function CreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
   111	  const [slug, setSlug] = useState('');
   112	  const [name, setName] = useState('');
   113	  const [externalKey, setExternalKey] = useState('');
   114	  const [error, setError] = useState<string | null>(null);
   115	
   116	  const mutation = useMutation({
   117	    mutationFn: async (body: RegisterManagedSystemBody) => registerManagedSystem(body),
   118	    onSuccess: async () => {
   119	      setSlug('');
   120	      setName('');
   121	      setExternalKey('');
   122	      setError(null);
   123	      await onCreated();
   124	    },
   125	    onError: (err) => setError(envelopeMessage(err)),
   126	  });
   127	
   128	  return (
   129	    <form
   130	      data-testid="create-managed-system-form"
   131	      className="space-y-2 rounded-md border border-default p-3"
   132	      onSubmit={(e) => {
   133	        e.preventDefault();
   134	        setError(null);
   135	        const body: RegisterManagedSystemBody = { slug, name };
   136	        if (externalKey.length > 0) body.external_key = externalKey;
   137	        mutation.mutate(body);
   138	      }}
   139	    >
   140	      <h2 className="text-lg font-semibold">Register</h2>
   141	      <label className="block text-sm">
   142	        Slug
   143	        <input
   144	          className="ml-2 border px-1"
   145	          value={slug}
   146	          onChange={(e) => setSlug(e.target.value)}
   147	          required
   148	          data-testid="create-slug"
   149	        />
   150	      </label>
   151	      <label className="block text-sm">
   152	        Name
   153	        <input
   154	          className="ml-2 border px-1"
   155	          value={name}
   156	          onChange={(e) => setName(e.target.value)}
   157	          required
   158	          data-testid="create-name"
   159	        />
   160	      </label>

--- admin aa ---
     1	// /admin/analytics-areas — Slice 2 #11 functional admin surface.
     2	//
     3	// MS-picker at top is the optional parent selector. When unset, the list
     4	// is grouped by managed_system_id; when set, the page calls
     5	// GET /analytics-areas?managed_system_id=… and shows a flat list. Strict
     6	// functional rendering per the design-HTML-pending rule.
     7	
     8	import { AnalyticsAreaPicker, Button, ManagedSystemPicker, type PickerOption } from '@fops/ui';
     9	import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
    10	import { createFileRoute } from '@tanstack/react-router';
    11	import { useState } from 'react';
    12	
    13	import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
    14	import {
    15	  type AnalyticsAreaDto,
    16	  ApiError,
    17	  type ManagedSystemDto,
    18	  type RegisterAnalyticsAreaBody,
    19	  type UpdateAnalyticsAreaBody,
    20	  archiveAnalyticsArea,
    21	  fetchAnalyticsAreas,
    22	  fetchManagedSystems,
    23	  registerAnalyticsArea,
    24	  updateAnalyticsArea,
    25	} from '../../../lib/api.js';
    26	
    27	export const Route = createFileRoute('/_authed/admin/analytics-areas')({
    28	  component: AnalyticsAreasAdminPage,
    29	});
    30	
    31	export function AnalyticsAreasAdminPage() {
    32	  return (
    33	    <main className="mx-auto max-w-5xl p-8 space-y-6">
    34	      <h1 className="text-2xl font-semibold">Analytics Areas</h1>
    35	      <PermissionGate capability="workspace.admin">
    36	        <AnalyticsAreasBody />
    37	      </PermissionGate>
    38	    </main>
    39	  );
    40	}
    41	
    42	function envelopeMessage(err: unknown): string {
    43	  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
    44	  if (err instanceof Error) return err.message;
    45	  return 'unknown error';
    46	}
    47	
    48	const AA_KEY = ['analytics-areas'] as const;
    49	
    50	function msOptionsFrom(list: ManagedSystemDto[]): PickerOption[] {
    51	  return list.filter((m) => m.archived_at === null).map((m) => ({ id: m.id, label: m.name }));
    52	}
    53	
    54	function groupByMs(items: AnalyticsAreaDto[]): Map<string, AnalyticsAreaDto[]> {
    55	  const out = new Map<string, AnalyticsAreaDto[]>();
    56	  for (const a of items) {
    57	    const arr = out.get(a.managed_system_id) ?? [];
    58	    arr.push(a);
    59	    out.set(a.managed_system_id, arr);
    60	  }
    61	  return out;
    62	}
    63	
    64	export function AnalyticsAreasBody() {
    65	  const qc = useQueryClient();
    66	  const [filterMsId, setFilterMsId] = useState<string | null>(null);
    67	  const [includeArchived, setIncludeArchived] = useState(false);
    68	
    69	  const msQuery = useQuery({
    70	    queryKey: ['managed-systems', { includeArchived: false }] as const,
    71	    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    72	    retry: false,
    73	  });
    74	  const aaQuery = useQuery({
    75	    queryKey: [...AA_KEY, { filterMsId, includeArchived }] as const,
    76	    queryFn: ({ signal }) =>
    77	      fetchAnalyticsAreas({
    78	        ...(filterMsId ? { managedSystemId: filterMsId } : {}),
    79	        includeArchived,
    80	        signal,
    81	      }),
    82	    retry: false,
    83	  });
    84	
    85	  async function invalidate() {
    86	    await qc.invalidateQueries({ queryKey: AA_KEY });
    87	  }
    88	
    89	  const msOptions = msQuery.data ? msOptionsFrom(msQuery.data.items) : [];
    90	  const msNameById = new Map<string, string>(
    91	    (msQuery.data?.items ?? []).map((m) => [m.id, m.name]),
    92	  );
    93	
    94	  return (
    95	    <section className="space-y-6">
    96	      <div className="space-y-2">
    97	        <label className="block text-sm font-medium">Filter by Managed System (optional)</label>
    98	        <ManagedSystemPicker
    99	          options={msOptions}
   100	          value={filterMsId}
   101	          onChange={setFilterMsId}
   102	          placeholder="All Managed Systems"
   103	          testId="filter-managed-system-picker"
   104	        />
   105	        <label className="flex items-center gap-2 text-sm">
   106	          <input
   107	            type="checkbox"
   108	            checked={includeArchived}
   109	            onChange={(e) => setIncludeArchived(e.target.checked)}
   110	            data-testid="aa-include-archived-checkbox"
   111	          />
   112	          Include archived
   113	        </label>
   114	      </div>
   115	
   116	      <CreateForm msOptions={msOptions} onCreated={invalidate} />
   117	
   118	      {aaQuery.isPending ? (
   119	        <p className="text-sm text-text-muted">Loading…</p>
   120	      ) : aaQuery.isError ? (
   121	        <p className="text-sm text-accent-danger">Error: {envelopeMessage(aaQuery.error)}</p>
   122	      ) : aaQuery.data.items.length === 0 ? (
   123	        <p className="text-sm text-text-muted">No analytics areas.</p>
   124	      ) : filterMsId ? (
   125	        <AAFlatList items={aaQuery.data.items} onChanged={invalidate} />
   126	      ) : (
   127	        <AAGroupedList items={aaQuery.data.items} msNameById={msNameById} onChanged={invalidate} />
   128	      )}
   129	    </section>
   130	  );
   131	}
   132	
   133	function CreateForm({
   134	  msOptions,
   135	  onCreated,
   136	}: {
   137	  msOptions: PickerOption[];
   138	  onCreated: () => Promise<void>;
   139	}) {
   140	  const [msId, setMsId] = useState<string | null>(null);
   141	  const [slug, setSlug] = useState('');
   142	  const [name, setName] = useState('');
   143	  const [error, setError] = useState<string | null>(null);
   144	
   145	  const mutation = useMutation({
   146	    mutationFn: async (body: RegisterAnalyticsAreaBody) => registerAnalyticsArea(body),
   147	    onSuccess: async () => {
   148	      setSlug('');
   149	      setName('');
   150	      setError(null);
   151	      await onCreated();
   152	    },
   153	    onError: (err) => setError(envelopeMessage(err)),
   154	  });
   155	
   156	  return (
   157	    <form
   158	      data-testid="create-analytics-area-form"
   159	      className="space-y-2 rounded-md border border-default p-3"
   160	      onSubmit={(e) => {
   161	        e.preventDefault();
   162	        if (!msId) {
   163	          setError('validation.failed: managed_system_id required');
   164	          return;
   165	        }
   166	        mutation.mutate({ managed_system_id: msId, slug, name });
   167	      }}
   168	    >
   169	      <h2 className="text-lg font-semibold">Register Analytics Area</h2>
   170	      <label className="block text-sm">
   171	        Managed System
   172	        <ManagedSystemPicker
   173	          className="ml-2"
   174	          options={msOptions}
   175	          value={msId}
   176	          onChange={setMsId}
   177	          testId="create-ms-picker"
   178	        />
   179	      </label>
   180	      <label className="block text-sm">

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/frontend/src/routes/_authed/admin/analytics-areas.tsx | sed -n '180,360p'; printf '\\n--- ms rest ---\\n'; nl -ba apps/frontend/src/routes/_authed/admin/managed-systems.tsx | sed -n '160,360p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
   180	      <label className="block text-sm">
   181	        Slug
   182	        <input
   183	          className="ml-2 border px-1"
   184	          value={slug}
   185	          onChange={(e) => setSlug(e.target.value)}
   186	          required
   187	          data-testid="create-aa-slug"
   188	        />
   189	      </label>
   190	      <label className="block text-sm">
   191	        Name
   192	        <input
   193	          className="ml-2 border px-1"
   194	          value={name}
   195	          onChange={(e) => setName(e.target.value)}
   196	          required
   197	          data-testid="create-aa-name"
   198	        />
   199	      </label>
   200	      <Button type="submit" disabled={mutation.isPending} data-testid="create-aa-submit">
   201	        Register
   202	      </Button>
   203	      {error && (
   204	        <p data-testid="create-aa-error" className="text-sm text-accent-danger">
   205	          {error}
   206	        </p>
   207	      )}
   208	    </form>
   209	  );
   210	}
   211	
   212	function AAGroupedList({
   213	  items,
   214	  msNameById,
   215	  onChanged,
   216	}: {
   217	  items: AnalyticsAreaDto[];
   218	  msNameById: Map<string, string>;
   219	  onChanged: () => Promise<void>;
   220	}) {
   221	  const groups = groupByMs(items);
   222	  return (
   223	    <div data-testid="aa-grouped-list" className="space-y-4">
   224	      {[...groups.entries()].map(([msId, rows]) => (
   225	        <section key={msId} data-testid={`aa-group-${msId}`} className="space-y-2">
   226	          <h2 className="text-lg font-semibold">{msNameById.get(msId) ?? msId}</h2>
   227	          <AAFlatList items={rows} onChanged={onChanged} />
   228	        </section>
   229	      ))}
   230	    </div>
   231	  );
   232	}
   233	
   234	function AAFlatList({
   235	  items,
   236	  onChanged,
   237	}: {
   238	  items: AnalyticsAreaDto[];
   239	  onChanged: () => Promise<void>;
   240	}) {
   241	  return (
   242	    <table
   243	      data-testid="analytics-areas-table"
   244	      className="w-full border border-default text-sm"
   245	    >
   246	      <thead>
   247	        <tr className="text-left">
   248	          <th className="p-2">Slug</th>
   249	          <th className="p-2">Name</th>
   250	          <th className="p-2">Owner team</th>
   251	          <th className="p-2">Archived</th>
   252	          <th className="p-2">Actions</th>
   253	        </tr>
   254	      </thead>
   255	      <tbody>
   256	        {items.map((row) => (
   257	          <AnalyticsAreaRow key={row.id} row={row} onChanged={onChanged} />
   258	        ))}
   259	      </tbody>
   260	    </table>
   261	  );
   262	}
   263	
   264	function AnalyticsAreaRow({
   265	  row,
   266	  onChanged,
   267	}: {
   268	  row: AnalyticsAreaDto;
   269	  onChanged: () => Promise<void>;
   270	}) {
   271	  const [name, setName] = useState(row.name);
   272	  const [error, setError] = useState<string | null>(null);
   273	
   274	  const updateMutation = useMutation({
   275	    mutationFn: async () => {
   276	      const body: UpdateAnalyticsAreaBody = {};
   277	      if (name !== row.name) body.name = name;
   278	      return updateAnalyticsArea(row.id, body);
   279	    },
   280	    onSuccess: async () => {
   281	      setError(null);
   282	      await onChanged();
   283	    },
   284	    onError: (err) => setError(envelopeMessage(err)),
   285	  });
   286	
   287	  const archiveMutation = useMutation({
   288	    mutationFn: async () => archiveAnalyticsArea(row.id),
   289	    onSuccess: async () => {
   290	      setError(null);
   291	      await onChanged();
   292	    },
   293	    onError: (err) => setError(envelopeMessage(err)),
   294	  });
   295	
   296	  return (
   297	    <tr data-testid={`aa-row-${row.slug}`} className="border-t border-default">
   298	      <td className="p-2">{row.slug}</td>
   299	      <td className="p-2">
   300	        <input
   301	          className="border px-1"
   302	          value={name}
   303	          onChange={(e) => setName(e.target.value)}
   304	          disabled={row.archived_at !== null}
   305	          data-testid={`aa-name-input-${row.slug}`}
   306	        />
   307	      </td>
   308	      <td className="p-2 text-xs">{row.owner_team_id ?? '—'}</td>
   309	      <td className="p-2 text-xs">{row.archived_at ? 'yes' : 'no'}</td>
   310	      <td className="p-2 space-x-2">
   311	        <Button
   312	          type="button"
   313	          onClick={() => updateMutation.mutate()}
   314	          disabled={updateMutation.isPending || row.archived_at !== null}
   315	          data-testid={`aa-save-${row.slug}`}
   316	        >
   317	          Save
   318	        </Button>
   319	        <Button
   320	          type="button"
   321	          onClick={() => archiveMutation.mutate()}
   322	          disabled={archiveMutation.isPending || row.archived_at !== null}
   323	          data-testid={`aa-archive-${row.slug}`}
   324	        >
   325	          Archive
   326	        </Button>
   327	        {error && (
   328	          <p data-testid={`aa-row-error-${row.slug}`} className="text-xs text-accent-danger">
   329	            {error}
   330	          </p>
   331	        )}
   332	      </td>
   333	    </tr>
   334	  );
   335	}
   336	
   337	// Unused export silences "AnalyticsAreaPicker has no consumer" complaints
   338	// from boundary tooling; the picker is exported from @fops/ui and may be
   339	// consumed by routes that don't exist yet (Slice 3+).
   340	export const _unusedPickerImport = AnalyticsAreaPicker;

--- ms rest ---
   160	      </label>
   161	      <label className="block text-sm">
   162	        External key (optional)
   163	        <input
   164	          className="ml-2 border px-1"
   165	          value={externalKey}
   166	          onChange={(e) => setExternalKey(e.target.value)}
   167	          data-testid="create-external-key"
   168	        />
   169	      </label>
   170	      <Button type="submit" disabled={mutation.isPending} data-testid="create-submit">
   171	        Register
   172	      </Button>
   173	      {error && (
   174	        <p data-testid="create-error" className="text-sm text-accent-danger">
   175	          {error}
   176	        </p>
   177	      )}
   178	    </form>
   179	  );
   180	}
   181	
   182	function ManagedSystemRow({
   183	  row,
   184	  onChanged,
   185	}: {
   186	  row: ManagedSystemDto;
   187	  onChanged: () => Promise<void>;
   188	}) {
   189	  const [name, setName] = useState(row.name);
   190	  const [externalKey, setExternalKey] = useState(row.external_key ?? '');
   191	  const [error, setError] = useState<string | null>(null);
   192	
   193	  const updateMutation = useMutation({
   194	    mutationFn: async () => {
   195	      const body: UpdateManagedSystemBody = {};
   196	      if (name !== row.name) body.name = name;
   197	      const nextKey = externalKey.length > 0 ? externalKey : null;
   198	      if (nextKey !== row.external_key) body.external_key = nextKey;
   199	      return updateManagedSystem(row.id, body);
   200	    },
   201	    onSuccess: async () => {
   202	      setError(null);
   203	      await onChanged();
   204	    },
   205	    onError: (err) => setError(envelopeMessage(err)),
   206	  });
   207	
   208	  const archiveMutation = useMutation({
   209	    mutationFn: async () => archiveManagedSystem(row.id),
   210	    onSuccess: async () => {
   211	      setError(null);
   212	      await onChanged();
   213	    },
   214	    onError: (err) => setError(envelopeMessage(err)),
   215	  });
   216	
   217	  return (
   218	    <tr data-testid={`managed-system-row-${row.slug}`} className="border-t border-default">
   219	      <td className="p-2">{row.slug}</td>
   220	      <td className="p-2">
   221	        <input
   222	          className="border px-1"
   223	          value={name}
   224	          onChange={(e) => setName(e.target.value)}
   225	          disabled={row.archived_at !== null}
   226	          data-testid={`name-input-${row.slug}`}
   227	        />
   228	      </td>
   229	      <td className="p-2">
   230	        <input
   231	          className="border px-1"
   232	          value={externalKey}
   233	          onChange={(e) => setExternalKey(e.target.value)}
   234	          disabled={row.archived_at !== null}
   235	          data-testid={`external-key-input-${row.slug}`}
   236	        />
   237	      </td>
   238	      <td className="p-2 text-xs">{row.default_owner_actor_id ?? '—'}</td>
   239	      <td className="p-2 text-xs">{row.default_owner_team_id ?? '—'}</td>
   240	      <td className="p-2 text-xs">{row.archived_at ? 'yes' : 'no'}</td>
   241	      <td className="p-2 space-x-2">
   242	        <Button
   243	          type="button"
   244	          onClick={() => updateMutation.mutate()}
   245	          disabled={updateMutation.isPending || row.archived_at !== null}
   246	          data-testid={`save-${row.slug}`}
   247	        >
   248	          Save
   249	        </Button>
   250	        <Button
   251	          type="button"
   252	          onClick={() => archiveMutation.mutate()}
   253	          disabled={archiveMutation.isPending || row.archived_at !== null}
   254	          data-testid={`archive-${row.slug}`}
   255	        >
   256	          Archive
   257	        </Button>
   258	        {error && (
   259	          <p data-testid={`row-error-${row.slug}`} className="text-xs text-accent-danger">
   260	            {error}
   261	          </p>
   262	        )}
   263	      </td>
   264	    </tr>
   265	  );
   266	}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "rg -n \"interface (CreateVoc|PatchVoc|Voc|PublicUpdate|ReporterReply|InternalComment|VocDetail|VocList)|type (CreateVoc|PatchVoc|Voc|PublicUpdate|ReporterReply|InternalComment|VocDetail|VocList)|description_rich_content|body_rich_content|@fops/shared|ApiErrorEnvelope|ErrorEnvelope|rate_limited|Idempotency-Key|If-Match|If-None-Match|etag|x-request-id\" apps/frontend/src apps/frontend/src/lib/api packages/ui/src -g '*.ts' -g '*.tsx'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
apps/frontend/src/lib/api/client.ts:1:import { ApiError, type ApiErrorEnvelope } from './types';
apps/frontend/src/lib/api/client.ts:15:  etag: string | undefined;
apps/frontend/src/lib/api/client.ts:19:// PUT is intentionally excluded: the locked API contract auto-mints Idempotency-Key
apps/frontend/src/lib/api/client.ts:34:    headers['Idempotency-Key'] = opts.idempotencyKey ?? mintInlineKey();
apps/frontend/src/lib/api/client.ts:36:  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
apps/frontend/src/lib/api/client.ts:37:  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;
apps/frontend/src/lib/api/client.ts:50:  const etag = res.headers.get('etag') ?? undefined;
apps/frontend/src/lib/api/client.ts:51:  const requestId = res.headers.get('x-request-id') ?? undefined;
apps/frontend/src/lib/api/client.ts:54:    return { status: 304, data: undefined as T, etag, requestId };
apps/frontend/src/lib/api/client.ts:61:    const envelope: ApiErrorEnvelope =
apps/frontend/src/lib/api/client.ts:63:        ? (data as ApiErrorEnvelope)
apps/frontend/src/lib/api/client.ts:68:  return { status: res.status, data: data as T, etag, requestId };
apps/frontend/src/lib/api/types.ts:1:import type { ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/types.ts:3:export interface ApiErrorEnvelope {
apps/frontend/src/lib/api/types.ts:17:    public readonly envelope: ApiErrorEnvelope,
apps/frontend/src/lib/api/errorMapper.ts:1:import { ERROR_CODES, type ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/errorMapper.ts:2:import type { ApiErrorEnvelope, MappedError, Tone } from './types';
apps/frontend/src/lib/api/errorMapper.ts:31:  // rate_limited.*
apps/frontend/src/lib/api/errorMapper.ts:32:  'rate_limited.actor': {
apps/frontend/src/lib/api/errorMapper.ts:36:  'rate_limited.ip': {
apps/frontend/src/lib/api/errorMapper.ts:47:    message: 'Idempotency-Key가 잘못된 형식입니다. 새로고침 후 다시 시도해 주세요.',
apps/frontend/src/lib/api/errorMapper.ts:134:  envelope: ApiErrorEnvelope,
apps/frontend/src/lib/api/__tests__/client.test.ts:43:  it('POST attaches auto-minted Idempotency-Key UUID', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:48:    expect(headers['Idempotency-Key']).toBeTruthy();
apps/frontend/src/lib/api/__tests__/client.test.ts:49:    expect((headers['Idempotency-Key'] as string).length).toBeGreaterThanOrEqual(10);
apps/frontend/src/lib/api/__tests__/client.test.ts:52:  it('GET omits Idempotency-Key', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:57:    expect(headers['Idempotency-Key']).toBeUndefined();
apps/frontend/src/lib/api/__tests__/client.test.ts:60:  it('PATCH attaches If-Match when provided', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:65:    expect(headers['If-Match']).toBe('W/"abc"');
apps/frontend/src/lib/api/__tests__/client.test.ts:90:  it('304 returns etag without throwing', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:91:    const fetchMock = mockFetch({ ok: true, status: 304, headers: { etag: 'W/"abc"' } });
apps/frontend/src/lib/api/__tests__/client.test.ts:95:    expect(res.etag).toBe('W/"abc"');
apps/frontend/src/lib/api/__tests__/client.test.ts:98:  it('PUT does not auto-attach Idempotency-Key', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:103:    expect(headers['Idempotency-Key']).toBeUndefined();
apps/frontend/src/lib/api/useIdempotencyKey.ts:19: * Stable Idempotency-Key per call site. Re-mints automatically when `ifMatchEtag` changes
apps/frontend/src/lib/api/useIdempotencyKey.ts:20: * (BE rule: idempotency hash includes If-Match; same key + new etag → conflict.idempotency_key_reuse).
apps/frontend/src/lib/api/useIdempotencyKey.ts:27:  // Single ref holds { etag, key } together to allow synchronous derivation during render.
apps/frontend/src/lib/api/useIdempotencyKey.ts:28:  const ref = useRef<{ etag: string | undefined; key: string }>({
apps/frontend/src/lib/api/useIdempotencyKey.ts:29:    etag: ifMatchEtag,
apps/frontend/src/lib/api/useIdempotencyKey.ts:33:  // Synchronous derivation: if etag changed, mint a new key before returning.
apps/frontend/src/lib/api/useIdempotencyKey.ts:34:  if (ref.current.etag !== ifMatchEtag) {
apps/frontend/src/lib/api/useIdempotencyKey.ts:35:    ref.current = { etag: ifMatchEtag, key: mintKey() };
apps/frontend/src/lib/api/useIdempotencyKey.ts:43:    ref.current = { etag: ref.current.etag, key: mintKey() };
apps/frontend/src/lib/api/client.ts:1:import { ApiError, type ApiErrorEnvelope } from './types';
apps/frontend/src/lib/api/client.ts:15:  etag: string | undefined;
apps/frontend/src/lib/api/client.ts:19:// PUT is intentionally excluded: the locked API contract auto-mints Idempotency-Key
apps/frontend/src/lib/api/client.ts:34:    headers['Idempotency-Key'] = opts.idempotencyKey ?? mintInlineKey();
apps/frontend/src/lib/api/client.ts:36:  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
apps/frontend/src/lib/api/client.ts:37:  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;
apps/frontend/src/lib/api/client.ts:50:  const etag = res.headers.get('etag') ?? undefined;
apps/frontend/src/lib/api/client.ts:51:  const requestId = res.headers.get('x-request-id') ?? undefined;
apps/frontend/src/lib/api/client.ts:54:    return { status: 304, data: undefined as T, etag, requestId };
apps/frontend/src/lib/api/client.ts:61:    const envelope: ApiErrorEnvelope =
apps/frontend/src/lib/api/client.ts:63:        ? (data as ApiErrorEnvelope)
apps/frontend/src/lib/api/client.ts:68:  return { status: res.status, data: data as T, etag, requestId };
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:8:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:9:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:12:    rerender({ etag: 'W/"v1"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:18:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:19:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:22:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:29:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:30:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:33:    // Switch etag and immediately read key — no async wait.
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:34:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:37:    // Confirm key is stable on subsequent re-renders with same etag
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:38:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/lib/api/__tests__/client.test.ts:43:  it('POST attaches auto-minted Idempotency-Key UUID', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:48:    expect(headers['Idempotency-Key']).toBeTruthy();
apps/frontend/src/lib/api/__tests__/client.test.ts:49:    expect((headers['Idempotency-Key'] as string).length).toBeGreaterThanOrEqual(10);
apps/frontend/src/lib/api/__tests__/client.test.ts:52:  it('GET omits Idempotency-Key', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:57:    expect(headers['Idempotency-Key']).toBeUndefined();
apps/frontend/src/lib/api/__tests__/client.test.ts:60:  it('PATCH attaches If-Match when provided', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:65:    expect(headers['If-Match']).toBe('W/"abc"');
apps/frontend/src/lib/api/__tests__/client.test.ts:90:  it('304 returns etag without throwing', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:91:    const fetchMock = mockFetch({ ok: true, status: 304, headers: { etag: 'W/"abc"' } });
apps/frontend/src/lib/api/__tests__/client.test.ts:95:    expect(res.etag).toBe('W/"abc"');
apps/frontend/src/lib/api/__tests__/client.test.ts:98:  it('PUT does not auto-attach Idempotency-Key', async () => {
apps/frontend/src/lib/api/__tests__/client.test.ts:103:    expect(headers['Idempotency-Key']).toBeUndefined();
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:8:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:9:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:12:    rerender({ etag: 'W/"v1"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:18:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:19:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:22:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:29:      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:30:      { initialProps: { etag: 'W/"v1"' } },
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:33:    // Switch etag and immediately read key — no async wait.
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:34:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:37:    // Confirm key is stable on subsequent re-renders with same etag
apps/frontend/src/lib/api/__tests__/useIdempotencyKey.test.ts:38:    rerender({ etag: 'W/"v2"' });
apps/frontend/src/routes/dev-rich-editor.tsx:6:import type { ApiErrorEnvelope } from '../lib/api/types';
apps/frontend/src/routes/dev-rich-editor.tsx:15:/** Dev-only: fire a fake ApiErrorEnvelope through errorMapper → sonner toast. */
apps/frontend/src/routes/dev-rich-editor.tsx:16:function triggerToast(envelope: ApiErrorEnvelope, onRetry?: () => void) {
apps/frontend/src/lib/api/__tests__/errorMapper.test.ts:1:import { ERROR_CODES, type ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/__tests__/errorMapper.test.ts:1:import { ERROR_CODES, type ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/types.ts:1:import type { ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/types.ts:3:export interface ApiErrorEnvelope {
apps/frontend/src/lib/api/types.ts:17:    public readonly envelope: ApiErrorEnvelope,
apps/frontend/src/lib/api/errorMapper.ts:1:import { ERROR_CODES, type ErrorCode } from '@fops/shared';
apps/frontend/src/lib/api/errorMapper.ts:2:import type { ApiErrorEnvelope, MappedError, Tone } from './types';
apps/frontend/src/lib/api/errorMapper.ts:31:  // rate_limited.*
apps/frontend/src/lib/api/errorMapper.ts:32:  'rate_limited.actor': {
apps/frontend/src/lib/api/errorMapper.ts:36:  'rate_limited.ip': {
apps/frontend/src/lib/api/errorMapper.ts:47:    message: 'Idempotency-Key가 잘못된 형식입니다. 새로고침 후 다시 시도해 주세요.',
apps/frontend/src/lib/api/errorMapper.ts:134:  envelope: ApiErrorEnvelope,
apps/frontend/src/lib/api/useIdempotencyKey.ts:19: * Stable Idempotency-Key per call site. Re-mints automatically when `ifMatchEtag` changes
apps/frontend/src/lib/api/useIdempotencyKey.ts:20: * (BE rule: idempotency hash includes If-Match; same key + new etag → conflict.idempotency_key_reuse).
apps/frontend/src/lib/api/useIdempotencyKey.ts:27:  // Single ref holds { etag, key } together to allow synchronous derivation during render.
apps/frontend/src/lib/api/useIdempotencyKey.ts:28:  const ref = useRef<{ etag: string | undefined; key: string }>({
apps/frontend/src/lib/api/useIdempotencyKey.ts:29:    etag: ifMatchEtag,
apps/frontend/src/lib/api/useIdempotencyKey.ts:33:  // Synchronous derivation: if etag changed, mint a new key before returning.
apps/frontend/src/lib/api/useIdempotencyKey.ts:34:  if (ref.current.etag !== ifMatchEtag) {
apps/frontend/src/lib/api/useIdempotencyKey.ts:35:    ref.current = { etag: ifMatchEtag, key: mintKey() };
apps/frontend/src/lib/api/useIdempotencyKey.ts:43:    ref.current = { etag: ref.current.etag, key: mintKey() };
apps/frontend/src/routes/_authed/vocs.tsx:27:type VocSearch = z.infer<typeof vocSearchSchema>;
apps/frontend/src/lib/api.ts:97:export interface ApiErrorEnvelope {
apps/frontend/src/lib/api.ts:105:  readonly envelope: ApiErrorEnvelope;
apps/frontend/src/lib/api.ts:106:  constructor(status: number, envelope: ApiErrorEnvelope) {
apps/frontend/src/lib/api.ts:122:      'Idempotency-Key': options.idempotencyKey,
apps/frontend/src/lib/api.ts:132:  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
apps/frontend/src/lib/api.ts:134:    envelope = (await res.json()) as ApiErrorEnvelope;
apps/frontend/src/lib/api.ts:198:  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
apps/frontend/src/lib/api.ts:200:    envelope = (await res.json()) as ApiErrorEnvelope;
apps/frontend/src/lib/api.ts:227:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/lib/api.ts:247:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/lib/api.ts:266:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/lib/api.ts:324:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/lib/api.ts:344:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/lib/api.ts:363:  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
apps/frontend/src/features/admin/permissions/request-access-button.tsx:3:// Generates a stable `Idempotency-Key` per logical intent — the key is
apps/frontend/src/features/admin/permissions/request-access-button.tsx:40:  // Bumping `attempt` rotates the memoized Idempotency-Key, which we do
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:2://   - POSTs to /permission-requests with an Idempotency-Key UUIDv4 header.
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:39:  test('on click → POST /permission-requests with Idempotency-Key UUID + body', async () => {
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:61:    expect(headers['Idempotency-Key']).toMatch(UUID_REGEX);
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:97:  // F-002: per ADR-0015:71-90 the Idempotency-Key represents the same
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:102:  test('two concurrent clicks for the same capability send the same Idempotency-Key', async () => {
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:138:      expect(a.headers['Idempotency-Key']).toBe(b.headers['Idempotency-Key']);
apps/frontend/src/features/admin/permissions/__tests__/request-access-button.test.tsx:142:    expect(first.headers['Idempotency-Key']).toMatch(UUID_REGEX);

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/frontend/src/lib/api.ts | sed -n '80,150p'; printf '\\n--- later voc/api routes? ---\\n'; nl -ba apps/frontend/src/lib/api.ts | sed -n '150,390p'; printf '\\n--- new api index ---\\n'; nl -ba apps/frontend/src/lib/api/index.ts | sed -n '1,120p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
    80	  requested_managed_system_id?: string;
    81	  requested_object_type?: string;
    82	  requested_object_id?: string;
    83	  reason: string;
    84	  requested_expiration?: string;
    85	  source_object_type?: string;
    86	  source_object_id?: string;
    87	  source_action_id?: string;
    88	  return_route_intent?: string;
    89	}
    90	
    91	export interface CreatePermissionRequestSuccess {
    92	  id: string;
    93	  status: 'pending';
    94	  created_at: string;
    95	}
    96	
    97	export interface ApiErrorEnvelope {
    98	  code: string;
    99	  message: string;
   100	  detail?: Record<string, unknown>;
   101	}
   102	
   103	export class ApiError extends Error {
   104	  readonly status: number;
   105	  readonly envelope: ApiErrorEnvelope;
   106	  constructor(status: number, envelope: ApiErrorEnvelope) {
   107	    super(envelope.message);
   108	    this.status = status;
   109	    this.envelope = envelope;
   110	  }
   111	}
   112	
   113	export async function createPermissionRequest(
   114	  body: CreatePermissionRequestBody,
   115	  options: { idempotencyKey: string; signal?: AbortSignal },
   116	): Promise<CreatePermissionRequestSuccess> {
   117	  const init: RequestInit = {
   118	    method: 'POST',
   119	    credentials: 'same-origin',
   120	    headers: {
   121	      'content-type': 'application/json',
   122	      'Idempotency-Key': options.idempotencyKey,
   123	    },
   124	    body: JSON.stringify(body),
   125	  };
   126	  if (options.signal) init.signal = options.signal;
   127	  const res = await fetch('/permission-requests', init);
   128	  if (res.status === 401) throw new UnauthenticatedError();
   129	  if (res.status >= 200 && res.status < 300) {
   130	    return (await res.json()) as CreatePermissionRequestSuccess;
   131	  }
   132	  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
   133	  try {
   134	    envelope = (await res.json()) as ApiErrorEnvelope;
   135	  } catch {
   136	    // body wasn't JSON; keep default envelope
   137	  }
   138	  throw new ApiError(res.status, envelope);
   139	}
   140	
   141	export interface MinePermissionRequestRow {
   142	  id: string;
   143	  requested_capability: string;
   144	  requested_managed_system_id: string | null;
   145	  reason: string;
   146	  requested_object_type: string | null;
   147	  requested_object_id: string | null;
   148	  source_object_type: string | null;
   149	  source_object_id: string | null;
   150	  source_action_id: string | null;

--- later voc/api routes? ---
   150	  source_action_id: string | null;
   151	  status: 'pending' | 'needs_more_info';
   152	  created_at: string;
   153	}
   154	
   155	export async function fetchPermissionRequestsMine(
   156	  signal?: AbortSignal,
   157	): Promise<{ requests: MinePermissionRequestRow[] }> {
   158	  const init: RequestInit = { credentials: 'same-origin' };
   159	  if (signal) init.signal = signal;
   160	  const res = await fetch('/permission-requests/mine', init);
   161	  if (res.status === 401) throw new UnauthenticatedError();
   162	  if (!res.ok) throw new Error(`/permission-requests/mine failed: ${res.status}`);
   163	  return (await res.json()) as { requests: MinePermissionRequestRow[] };
   164	}
   165	
   166	// ── Managed Systems (Slice 2 #10) ───────────────────────────────────────
   167	
   168	export interface ManagedSystemDto {
   169	  id: string;
   170	  workspace_id: string;
   171	  slug: string;
   172	  name: string;
   173	  external_key: string | null;
   174	  default_owner_actor_id: string | null;
   175	  default_owner_team_id: string | null;
   176	  archived_at: string | null;
   177	  archived_by_actor_id: string | null;
   178	  created_at: string;
   179	  updated_at: string;
   180	}
   181	
   182	export interface RegisterManagedSystemBody {
   183	  slug: string;
   184	  name: string;
   185	  external_key?: string | null;
   186	  default_owner_actor_id?: string | null;
   187	  default_owner_team_id?: string | null;
   188	}
   189	
   190	export interface UpdateManagedSystemBody {
   191	  name?: string;
   192	  external_key?: string | null;
   193	  default_owner_actor_id?: string | null;
   194	  default_owner_team_id?: string | null;
   195	}
   196	
   197	async function readEnvelope(res: Response): Promise<never> {
   198	  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
   199	  try {
   200	    envelope = (await res.json()) as ApiErrorEnvelope;
   201	  } catch {
   202	    // body wasn't JSON
   203	  }
   204	  throw new ApiError(res.status, envelope);
   205	}
   206	
   207	export async function fetchManagedSystems(options?: {
   208	  includeArchived?: boolean;
   209	  signal?: AbortSignal;
   210	}): Promise<{ items: ManagedSystemDto[]; total: number }> {
   211	  const params = new URLSearchParams();
   212	  if (options?.includeArchived) params.set('include_archived', 'true');
   213	  const url = `/managed-systems${params.size ? `?${params.toString()}` : ''}`;
   214	  const init: RequestInit = { credentials: 'same-origin' };
   215	  if (options?.signal) init.signal = options.signal;
   216	  const res = await fetch(url, init);
   217	  if (res.status === 401) throw new UnauthenticatedError();
   218	  if (!res.ok) return readEnvelope(res);
   219	  return (await res.json()) as { items: ManagedSystemDto[]; total: number };
   220	}
   221	
   222	export async function registerManagedSystem(
   223	  body: RegisterManagedSystemBody,
   224	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   225	): Promise<ManagedSystemDto> {
   226	  const headers: Record<string, string> = { 'content-type': 'application/json' };
   227	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   228	  const init: RequestInit = {
   229	    method: 'POST',
   230	    credentials: 'same-origin',
   231	    headers,
   232	    body: JSON.stringify(body),
   233	  };
   234	  if (options?.signal) init.signal = options.signal;
   235	  const res = await fetch('/managed-systems', init);
   236	  if (res.status === 401) throw new UnauthenticatedError();
   237	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   238	  return (await res.json()) as ManagedSystemDto;
   239	}
   240	
   241	export async function updateManagedSystem(
   242	  id: string,
   243	  body: UpdateManagedSystemBody,
   244	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   245	): Promise<ManagedSystemDto> {
   246	  const headers: Record<string, string> = { 'content-type': 'application/json' };
   247	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   248	  const init: RequestInit = {
   249	    method: 'PATCH',
   250	    credentials: 'same-origin',
   251	    headers,
   252	    body: JSON.stringify(body),
   253	  };
   254	  if (options?.signal) init.signal = options.signal;
   255	  const res = await fetch(`/managed-systems/${id}`, init);
   256	  if (res.status === 401) throw new UnauthenticatedError();
   257	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   258	  return (await res.json()) as ManagedSystemDto;
   259	}
   260	
   261	export async function archiveManagedSystem(
   262	  id: string,
   263	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   264	): Promise<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }> {
   265	  const headers: Record<string, string> = {};
   266	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   267	  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
   268	  if (options?.signal) init.signal = options.signal;
   269	  const res = await fetch(`/managed-systems/${id}/archive`, init);
   270	  if (res.status === 401) throw new UnauthenticatedError();
   271	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   272	  return (await res.json()) as ManagedSystemDto & { cascaded_analytics_area_ids: string[] };
   273	}
   274	
   275	// ── Analytics Areas (Slice 2 #11) ───────────────────────────────────────
   276	
   277	export interface AnalyticsAreaDto {
   278	  id: string;
   279	  workspace_id: string;
   280	  managed_system_id: string;
   281	  slug: string;
   282	  name: string;
   283	  owner_team_id: string | null;
   284	  archived_at: string | null;
   285	  archived_by_actor_id: string | null;
   286	  created_at: string;
   287	  updated_at: string;
   288	}
   289	
   290	export interface RegisterAnalyticsAreaBody {
   291	  managed_system_id: string;
   292	  slug: string;
   293	  name: string;
   294	  owner_team_id?: string | null;
   295	}
   296	
   297	export interface UpdateAnalyticsAreaBody {
   298	  name?: string;
   299	  owner_team_id?: string | null;
   300	}
   301	
   302	export async function fetchAnalyticsAreas(options?: {
   303	  managedSystemId?: string;
   304	  includeArchived?: boolean;
   305	  signal?: AbortSignal;
   306	}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
   307	  const params = new URLSearchParams();
   308	  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
   309	  if (options?.includeArchived) params.set('include_archived', 'true');
   310	  const url = `/analytics-areas${params.size ? `?${params.toString()}` : ''}`;
   311	  const init: RequestInit = { credentials: 'same-origin' };
   312	  if (options?.signal) init.signal = options.signal;
   313	  const res = await fetch(url, init);
   314	  if (res.status === 401) throw new UnauthenticatedError();
   315	  if (!res.ok) return readEnvelope(res);
   316	  return (await res.json()) as { items: AnalyticsAreaDto[]; total: number };
   317	}
   318	
   319	export async function registerAnalyticsArea(
   320	  body: RegisterAnalyticsAreaBody,
   321	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   322	): Promise<AnalyticsAreaDto> {
   323	  const headers: Record<string, string> = { 'content-type': 'application/json' };
   324	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   325	  const init: RequestInit = {
   326	    method: 'POST',
   327	    credentials: 'same-origin',
   328	    headers,
   329	    body: JSON.stringify(body),
   330	  };
   331	  if (options?.signal) init.signal = options.signal;
   332	  const res = await fetch('/analytics-areas', init);
   333	  if (res.status === 401) throw new UnauthenticatedError();
   334	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   335	  return (await res.json()) as AnalyticsAreaDto;
   336	}
   337	
   338	export async function updateAnalyticsArea(
   339	  id: string,
   340	  body: UpdateAnalyticsAreaBody,
   341	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   342	): Promise<AnalyticsAreaDto> {
   343	  const headers: Record<string, string> = { 'content-type': 'application/json' };
   344	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   345	  const init: RequestInit = {
   346	    method: 'PATCH',
   347	    credentials: 'same-origin',
   348	    headers,
   349	    body: JSON.stringify(body),
   350	  };
   351	  if (options?.signal) init.signal = options.signal;
   352	  const res = await fetch(`/analytics-areas/${id}`, init);
   353	  if (res.status === 401) throw new UnauthenticatedError();
   354	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   355	  return (await res.json()) as AnalyticsAreaDto;
   356	}
   357	
   358	export async function archiveAnalyticsArea(
   359	  id: string,
   360	  options?: { idempotencyKey?: string; signal?: AbortSignal },
   361	): Promise<AnalyticsAreaDto> {
   362	  const headers: Record<string, string> = {};
   363	  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
   364	  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
   365	  if (options?.signal) init.signal = options.signal;
   366	  const res = await fetch(`/analytics-areas/${id}/archive`, init);
   367	  if (res.status === 401) throw new UnauthenticatedError();
   368	  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
   369	  return (await res.json()) as AnalyticsAreaDto;
   370	}
   371	
   372	export async function fetchPermissionCheck(
   373	  capability: string,
   374	  options?: { managedSystemId?: string; signal?: AbortSignal },
   375	): Promise<PermissionCheckResponse> {
   376	  const params = new URLSearchParams({ capability });
   377	  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
   378	  const init: RequestInit = { credentials: 'same-origin' };
   379	  if (options?.signal) init.signal = options.signal;
   380	  const res = await fetch(`/me/permissions/check?${params.toString()}`, init);
   381	  if (res.status === 401) throw new UnauthenticatedError();
   382	  if (!res.ok) throw new Error(`/me/permissions/check failed: ${res.status}`);
   383	  return (await res.json()) as PermissionCheckResponse;
   384	}

--- new api index ---
     1	export * from './types';
     2	export * from './errorMapper';
     3	export * from './useIdempotencyKey';
     4	export * from './client';

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba packages/ui/src/rich-content/RichEditor.tsx | sed -n '1,260p'; printf '\\n--- renderer ---\\n'; nl -ba packages/ui/src/rich-content/RichContentRenderer.tsx | sed -n '1,240p'; printf '\\n--- extensions ---\\n'; nl -ba packages/ui/src/rich-content/extensions/mention.ts | sed -n '1,140p'; printf '\\n--- attach ---\\n'; nl -ba packages/ui/src/rich-content/extensions/attachmentRef.ts | sed -n '1,160p'; printf '\\n--- allowlists ---\\n'; nl -ba apps/backend/src/lib/rich-content/surface-allowlists.ts | sed -n '76,165p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
     1	import type { JSONContent } from '@tiptap/core';
     2	import Link from '@tiptap/extension-link';
     3	import Placeholder from '@tiptap/extension-placeholder';
     4	import Underline from '@tiptap/extension-underline';
     5	import { type Editor, EditorContent, useEditor } from '@tiptap/react';
     6	import StarterKit from '@tiptap/starter-kit';
     7	import * as React from 'react';
     8	import { cn } from '../utils/cn';
     9	import { AttachmentRef } from './extensions/attachmentRef';
    10	import { Mention } from './extensions/mention';
    11	
    12	// TipTapDoc is a branded alias over JSONContent for type safety at feature boundaries.
    13	// The `content` array is typed as JSONContent[] to satisfy @tiptap/core's strict overloads.
    14	export type TipTapDoc = JSONContent & { type: 'doc' };
    15	
    16	/** Spec-locked surface identifiers. Typos compile-fail here instead of silently producing wrong toolbar config in #19. */
    17	export type RichEditorSurface =
    18	  | 'voc-description'
    19	  | 'reporter-reply'
    20	  | 'public-update'
    21	  | 'internal-comment';
    22	
    23	export interface RichEditorProps {
    24	  surface: RichEditorSurface;
    25	  value?: TipTapDoc;
    26	  defaultValue?: TipTapDoc;
    27	  onChange?: (doc: TipTapDoc) => void;
    28	  placeholder?: string;
    29	  disabled?: boolean;
    30	  minHeight?: string | number;
    31	  className?: string;
    32	  toolbar?: (editor: Editor | null) => React.ReactNode;
    33	}
    34	
    35	export function RichEditor({
    36	  surface,
    37	  value,
    38	  defaultValue,
    39	  onChange,
    40	  placeholder,
    41	  disabled,
    42	  minHeight,
    43	  className,
    44	  toolbar,
    45	}: RichEditorProps) {
    46	  const editor = useEditor({
    47	    extensions: [
    48	      StarterKit.configure({
    49	        // ADR-0011: image extension is NOT registered. Users cannot author images client-side; backend is authoritative.
    50	        // Disable built-ins that we configure separately below to avoid duplicate extension warnings.
    51	        link: false,
    52	        underline: false,
    53	      }),
    54	      Link.configure({ openOnClick: false }),
    55	      Underline,
    56	      Placeholder.configure({ placeholder: placeholder ?? '' }),
    57	      AttachmentRef,
    58	      Mention,
    59	    ],
    60	    content: value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    61	    editable: !disabled,
    62	    onUpdate({ editor }) {
    63	      const doc = editor.getJSON() as TipTapDoc;
    64	      onChange?.(doc);
    65	    },
    66	    immediatelyRender: false,
    67	  });
    68	
    69	  // Re-sync value when controlled
    70	  React.useEffect(() => {
    71	    if (!editor || !value) return;
    72	    const current = editor.getJSON();
    73	    if (JSON.stringify(current) !== JSON.stringify(value)) {
    74	      editor.commands.setContent(value);
    75	    }
    76	  }, [editor, value]);
    77	
    78	  // Re-apply editable when disabled changes
    79	  React.useEffect(() => {
    80	    if (!editor) return;
    81	    editor.setEditable(!disabled);
    82	  }, [editor, disabled]);
    83	
    84	  return (
    85	    <div
    86	      className={cn(
    87	        'rich-editor border border-border-subtle rounded-md bg-surface-canvas',
    88	        className,
    89	      )}
    90	      data-surface={surface}
    91	    >
    92	      {toolbar?.(editor)}
    93	      <EditorContent
    94	        editor={editor}
    95	        className="prose prose-sm max-w-none px-3 py-2 focus:outline-none"
    96	        style={
    97	          minHeight
    98	            ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }
    99	            : undefined
   100	        }
   101	      />
   102	    </div>
   103	  );
   104	}

--- renderer ---
     1	import type { JSONContent } from '@tiptap/core';
     2	import Link from '@tiptap/extension-link';
     3	import Underline from '@tiptap/extension-underline';
     4	import { generateHTML } from '@tiptap/html';
     5	import StarterKit from '@tiptap/starter-kit';
     6	import * as React from 'react';
     7	import { cn } from '../utils/cn';
     8	import type { TipTapDoc } from './RichEditor';
     9	import { AttachmentRef } from './extensions/attachmentRef';
    10	import { Mention } from './extensions/mention';
    11	
    12	export type RichContentMode = 'reporter_visible' | 'internal';
    13	
    14	export interface RichContentRendererProps {
    15	  doc: TipTapDoc;
    16	  mode: RichContentMode;
    17	  className?: string;
    18	}
    19	
    20	function stripMentions(doc: TipTapDoc): TipTapDoc {
    21	  function walk(node: JSONContent): JSONContent | null {
    22	    if (node.type === 'mention') return null;
    23	    if (Array.isArray(node.content)) {
    24	      const filtered = node.content.map(walk).filter((x): x is JSONContent => x !== null);
    25	      return { ...node, content: filtered };
    26	    }
    27	    return node;
    28	  }
    29	  return walk(doc) as TipTapDoc;
    30	}
    31	
    32	export function RichContentRenderer({ doc, mode, className }: RichContentRendererProps) {
    33	  const html = React.useMemo(() => {
    34	    // stripMentions is moved inside useMemo so generateHTML is only re-invoked
    35	    // when doc or mode actually change — not on every parent render.
    36	    const safe = mode === 'reporter_visible' ? stripMentions(doc) : doc;
    37	    return generateHTML(safe as JSONContent, [
    38	      StarterKit.configure({
    39	        // Disable built-ins that we configure separately below to avoid duplicate extension warnings.
    40	        link: false,
    41	        underline: false,
    42	      }),
    43	      Link.configure({ openOnClick: false }),
    44	      Underline,
    45	      AttachmentRef,
    46	      Mention,
    47	    ]);
    48	  }, [doc, mode]);
    49	
    50	  return (
    51	    <div
    52	      className={cn('prose prose-sm max-w-none', className)}
    53	      data-mode={mode}
    54	      // biome-ignore lint/security/noDangerouslySetInnerHtml: BE sanitizer is authoritative per ADR-0011
    55	      dangerouslySetInnerHTML={{ __html: html }}
    56	    />
    57	  );
    58	}

--- extensions ---
     1	import { Node, mergeAttributes } from '@tiptap/core';
     2	
     3	export interface MentionAttrs {
     4	  actor_id: string;
     5	  label: string;
     6	}
     7	
     8	export const Mention = Node.create({
     9	  name: 'mention',
    10	  group: 'inline',
    11	  inline: true,
    12	  atom: true,
    13	  selectable: true,
    14	  addAttributes() {
    15	    return {
    16	      actor_id: { default: null },
    17	      label: { default: null },
    18	    };
    19	  },
    20	  parseHTML() {
    21	    return [{ tag: 'span[data-type="mention"]' }];
    22	  },
    23	  renderHTML({ HTMLAttributes }) {
    24	    return [
    25	      'span',
    26	      mergeAttributes({ 'data-type': 'mention', class: 'mention-chip' }, HTMLAttributes),
    27	      `@${HTMLAttributes.label ?? 'mention'}`,
    28	    ];
    29	  },
    30	});

--- attach ---
     1	import { Node, mergeAttributes } from '@tiptap/core';
     2	
     3	export interface AttachmentRefAttrs {
     4	  id: string;
     5	  name: string;
     6	  sizeBytes: number;
     7	  mimeType: string;
     8	}
     9	
    10	export const AttachmentRef = Node.create({
    11	  name: 'attachmentRef',
    12	  group: 'block',
    13	  atom: true,
    14	  draggable: true,
    15	  selectable: true,
    16	  addAttributes() {
    17	    return {
    18	      id: { default: null },
    19	      name: { default: null },
    20	      sizeBytes: {
    21	        default: 0,
    22	        renderHTML: (attrs) => ({ 'data-size-bytes': attrs.sizeBytes }),
    23	        parseHTML: (el) => Number(el.getAttribute('data-size-bytes') ?? 0),
    24	      },
    25	      mimeType: { default: 'application/octet-stream' },
    26	    };
    27	  },
    28	  parseHTML() {
    29	    return [{ tag: 'div[data-type="attachment-ref"]' }];
    30	  },
    31	  renderHTML({ HTMLAttributes }) {
    32	    return [
    33	      'div',
    34	      mergeAttributes({ 'data-type': 'attachment-ref' }, HTMLAttributes),
    35	      ['span', { class: 'attachment-icon' }, '📎'],
    36	      ['span', { class: 'attachment-name' }, HTMLAttributes.name ?? 'attachment'],
    37	    ];
    38	  },
    39	});

--- allowlists ---
    76	// ── Surface definitions ───────────────────────────────────────────────────────
    77	
    78	export const SURFACE_ALLOWLISTS: Readonly<Record<Surface, SurfaceAllowlist>> = {
    79	  'voc-description': {
    80	    nodes: new Set([
    81	      'doc', 'paragraph', 'text',
    82	      'bulletList', 'orderedList', 'listItem',
    83	      'attachmentRef',
    84	    ]),
    85	    marks: new Set(['bold', 'italic', 'underline', 'code', 'link']),
    86	    nodeAttrs: {
    87	      attachmentRef: attachmentRefAttrs,
    88	    },
    89	    markAttrs: {
    90	      link: linkMarkAttrs,
    91	    },
    92	    allowedLinkSchemes: HTTP_ONLY,
    93	    maxTextBytes: 50 * 1024,
    94	    maxDepth: 32,
    95	    maxNodes: 5000,
    96	    maxMarks: 1000,
    97	  },
    98	
    99	  // public-update: no links, no attachments, no mentions, no images.
   100	  // No nodeAttrs or markAttrs entries: all attrs must be absent or empty.
   101	  'public-update': {
   102	    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
   103	    marks: new Set(['bold', 'italic']),
   104	    nodeAttrs: {},
   105	    markAttrs: {},
   106	    allowedLinkSchemes: new Set<string>(),
   107	    maxTextBytes: 50 * 1024,
   108	    maxDepth: 32,
   109	    maxNodes: 5000,
   110	    maxMarks: 1000,
   111	  },
   112	
   113	  // reporter-reply: attachmentRef node allowed (value layer rejects non-empty
   114	  // attachments[] until storage slice ships); link mark allowed http/https.
   115	  'reporter-reply': {
   116	    nodes: new Set([
   117	      'doc', 'paragraph', 'text',
   118	      'bulletList', 'orderedList', 'listItem',
   119	      'attachmentRef',
   120	    ]),
   121	    marks: new Set(['bold', 'italic', 'code', 'link']),
   122	    nodeAttrs: {
   123	      attachmentRef: attachmentRefAttrs,
   124	    },
   125	    markAttrs: {
   126	      link: linkMarkAttrs,
   127	    },
   128	    allowedLinkSchemes: HTTP_ONLY,
   129	    maxTextBytes: 50 * 1024,
   130	    maxDepth: 32,
   131	    maxNodes: 5000,
   132	    maxMarks: 1000,
   133	  },
   134	
   135	  // internal-comment: full feature set — codeBlock, mention, attachmentRef,
   136	  // bold, italic, code, link.
   137	  'internal-comment': {
   138	    nodes: new Set([
   139	      'doc', 'paragraph', 'text',
   140	      'codeBlock',
   141	      'bulletList', 'orderedList', 'listItem',
   142	      'mention', 'attachmentRef',
   143	    ]),
   144	    marks: new Set(['bold', 'italic', 'code', 'link']),
   145	    nodeAttrs: {
   146	      attachmentRef: attachmentRefAttrs,
   147	      mention: {
   148	        // Canonical attr name per conversation-service.ts:517 (codex major finding).
   149	        actor_id: uuidRequired,
   150	      },
   151	      codeBlock: {
   152	        language: { kind: 'string', maxLen: 32, nullable: true, required: false },
   153	      },
   154	    },
   155	    markAttrs: {
   156	      link: linkMarkAttrs,
   157	    },
   158	    allowedLinkSchemes: HTTP_ONLY,
   159	    maxTextBytes: 50 * 1024,
   160	    maxDepth: 32,
   161	    maxNodes: 5000,
   162	    maxMarks: 1000,
   163	  },
   164	};

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/backend/src/lib/rich-content/surface-allowlists.ts | sed -n '60,76p'; nl -ba packages/shared/src/vocs/create-request.ts | sed -n '12,30p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
    60	// ── Shared scheme sets ────────────────────────────────────────────────────────
    61	
    62	const HTTP_ONLY = new Set(['http:', 'https:']);
    63	
    64	// ── Shared attr schemas ───────────────────────────────────────────────────────
    65	
    66	const uuidRequired: AttrSchema = { kind: 'uuid', required: true };
    67	
    68	const attachmentRefAttrs: Readonly<Record<string, AttrSchema>> = {
    69	  id: uuidRequired,
    70	};
    71	
    72	const linkMarkAttrs: Readonly<Record<string, AttrSchema>> = {
    73	  href: { kind: 'url', schemes: HTTP_ONLY, maxLen: 2048, required: true },
    74	};
    75	
    76	// ── Surface definitions ───────────────────────────────────────────────────────
    12	// TipTap doc — opaque jsonb at the wire boundary; sanitizer in apps/backend
    13	// validates structure. Keep loose here to avoid duplicating the surface
    14	// allowlists across packages.
    15	export const tipTapDocSchema = z.object({
    16	  type: z.literal('doc'),
    17	  content: z.array(z.unknown()).optional(),
    18	});
    19	export type TipTapDoc = z.infer<typeof tipTapDocSchema>;
    20	
    21	// Slice 3 #22 will define this fully; the create-request only needs a stub.
    22	export const attachmentRefSchema = z.object({
    23	  id: z.string().uuid(),
    24	  name: z.string().min(1),
    25	  size_bytes: z.number().int().nonnegative(),
    26	  mime_type: z.string().min(1),
    27	  storage_uri: z.string().min(1),
    28	});
    29	export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
    30	

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'rg -n "rateLimit|RateLimit|rate-limit|x-ratelimit|retry-after|global|createPgRateLimitStore" apps/backend/src apps/backend/src/index.ts apps/backend/src/**/*.ts' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
apps/backend/src/db/schema/core.ts:162:// core.rate_limits — ADR-0015:9-14. Backing store for @fastify/rate-limit.
apps/backend/src/db/schema/core.ts:167:// Not workspace-scoped: rate-limit keys are anon-IP or per-Actor (Actor
apps/backend/src/db/schema/core.ts:168:// IDs are globally unique within the MVP single-tenant deployment).
apps/backend/src/db/schema/core.ts:170:export const rateLimits = coreSchema.table(
apps/backend/src/config.ts:22:  // spoof `X-Forwarded-For` to reset anon rate-limit buckets and audit IPs
apps/backend/src/db/__tests__/migration.test.ts:126:    // The rate-limit backing table (ADR-0015:7-8) must be writable by the
apps/backend/src/server.ts:3:import rateLimit from '@fastify/rate-limit';
apps/backend/src/server.ts:17:import { createPgRateLimitStore } from './lib/rate-limit-pg-store.js';
apps/backend/src/server.ts:98:    // `req.ip` and reset their anon rate-limit bucket (and the IP recorded
apps/backend/src/server.ts:137:  // ── @fastify/rate-limit ─ ADR-0015:7-18 ─────────────────────────────
apps/backend/src/server.ts:138:  // Postgres-backed via our custom store. The global tier is per-Actor when
apps/backend/src/server.ts:144:  await app.register(rateLimit, {
apps/backend/src/server.ts:145:    global: true,
apps/backend/src/server.ts:150:    store: createPgRateLimitStore(dbHandle.pool, 'global') as never,
apps/backend/src/server.ts:157:      'x-ratelimit-limit': true,
apps/backend/src/server.ts:158:      'x-ratelimit-remaining': true,
apps/backend/src/server.ts:159:      'x-ratelimit-reset': true,
apps/backend/src/server.ts:162:      'x-ratelimit-limit': true,
apps/backend/src/server.ts:163:      'x-ratelimit-remaining': true,
apps/backend/src/server.ts:164:      'x-ratelimit-reset': true,
apps/backend/src/server.ts:165:      'retry-after': true,
apps/backend/src/server.ts:174:  // Adversarial review API-C-2: `@fastify/rate-limit` runs as an
apps/backend/src/server.ts:190:        req.log?.warn?.({ err }, 'rate-limit actor lookup failed; falling back to ip');
apps/backend/src/server.ts:196:  app.decorate('rateLimitConfig', {
apps/backend/src/server.ts:201:      store: createPgRateLimitStore(dbHandle.pool, 'mutation') as never,
apps/backend/src/server.ts:207:      store: createPgRateLimitStore(dbHandle.pool, 'sensitive') as never,
apps/backend/src/server.ts:215:      store: createPgRateLimitStore(dbHandle.pool, 'read') as never,
apps/backend/src/server.ts:225:      store: createPgRateLimitStore(dbHandle.pool, 'reporter_edit') as never,
apps/backend/src/server.ts:332:    rateLimitConfig: {
apps/backend/src/server.ts:333:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:348:    rateLimitConfig: {
apps/backend/src/server.ts:349:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:364:    rateLimitConfig: {
apps/backend/src/server.ts:365:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:392:    rateLimitConfig: {
apps/backend/src/server.ts:393:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:394:      read: app.rateLimitConfig.read,
apps/backend/src/server.ts:395:      reporterEdit: app.rateLimitConfig.reporterEdit,
apps/backend/src/modules/auth/session-service.ts:297:     * touch `last_seen_at`. Intended for the `@fastify/rate-limit`
apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts:70:  it('registers the hourly rate-limits-purge cron in pgboss.schedule', async () => {
apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts:77:  it('records the rate-limits queue in pgboss.queue with ADR-0009 retry config', async () => {
apps/backend/src/modules/analytics-areas/routes.ts:44:  rateLimitConfig?: { mutation: Record<string, unknown> };
apps/backend/src/modules/analytics-areas/routes.ts:51:  const { sessionService, analyticsAreaService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/analytics-areas/routes.ts:70:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/analytics-areas/routes.ts:95:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/analytics-areas/routes.ts:138:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:5:// rate-limit store; without a purge, anonymous-IP keys grow unbounded.
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:15:import { purgeExpiredRateLimits } from '../rate-limits-purge.js';
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:43:       values ($1, 'global', 1, now() - interval '2 hours')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:47:    const { deleted } = await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:62:       values ($1, 'global', 1, now() - interval '30 minutes')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:66:    await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:81:       values ($1, 'global', 1, now() + interval '1 minute')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:85:    await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:1:// Hourly purge of expired rate-limit rows (F-018; ADR-0015:7-9).
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:4:// PgRateLimitStore resets `expires_at` on each call inside an active
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:28:export interface RateLimitsPurgePayload {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:32:export interface RateLimitsPurgeResult {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:41:export async function purgeExpiredRateLimits(deps: {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:43:}): Promise<RateLimitsPurgeResult> {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:56:export async function registerRateLimitsPurge(
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:67:  await boss.work<RateLimitsPurgePayload>(
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:69:    async (jobs: Array<{ id: string; data: RateLimitsPurgePayload }>) => {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:72:        const { deleted } = await purgeExpiredRateLimits({ db: deps.db });
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:342:  // rate-limit config. Fastify does not expose route.config post-registration
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:345:  // (not 404) to confirm rate-limit middleware didn't eat the route.
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:370:    // 200 confirms the route is wired and rate-limited correctly (well within 300/min).
apps/backend/src/modules/managed-systems/routes.ts:47:  rateLimitConfig?: { mutation: Record<string, unknown> };
apps/backend/src/modules/managed-systems/routes.ts:54:  const { sessionService, managedSystemService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/managed-systems/routes.ts:74:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/managed-systems/routes.ts:100:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/managed-systems/routes.ts:142:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:160:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:184:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:526:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/modules/permissions/routes.ts:25:  rateLimitConfig?: {
apps/backend/src/modules/permissions/routes.ts:52:  const { sessionService, checkService, requestService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/permissions/routes.ts:58:  // ADR-0015 mutation tier does not apply (GET). The global per-Actor limit
apps/backend/src/modules/permissions/routes.ts:140:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:772:  it('exceeding mutation tier → 429 rate_limited.actor with retry-after', async () => {
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:778:    //   - 429 envelope is `rate_limited.actor` with `retry-after` header
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:812:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:125:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:133:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:340:    // Fresh reporter actor to avoid polluting shared rate-limit bucket.
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:372:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/modules/voc/routes.ts:50:  rateLimitConfig?: {
apps/backend/src/modules/voc/routes.ts:58:  const { db, sessionService, vocService, vocReadService, idempotencyService, conversationService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/voc/routes.ts:92:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:163:  // TODO(#14 follow-up): triage rate-limit bucket per spec (60/min vs shared mutation 10/min)
apps/backend/src/modules/voc/routes.ts:168:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:272:    ...(rateLimitConfig
apps/backend/src/modules/voc/routes.ts:273:      ? { config: { rateLimit: (rateLimitConfig.reporterEdit ?? rateLimitConfig.mutation) as never } }
apps/backend/src/modules/voc/routes.ts:367:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:398:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:447:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:483:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket (currently uses shared mutation tier)
apps/backend/src/modules/voc/routes.ts:488:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:541:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
apps/backend/src/modules/voc/routes.ts:546:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:596:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
apps/backend/src/modules/voc/routes.ts:601:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/server.ts:3:import rateLimit from '@fastify/rate-limit';
apps/backend/src/server.ts:17:import { createPgRateLimitStore } from './lib/rate-limit-pg-store.js';
apps/backend/src/server.ts:98:    // `req.ip` and reset their anon rate-limit bucket (and the IP recorded
apps/backend/src/server.ts:137:  // ── @fastify/rate-limit ─ ADR-0015:7-18 ─────────────────────────────
apps/backend/src/server.ts:138:  // Postgres-backed via our custom store. The global tier is per-Actor when
apps/backend/src/server.ts:144:  await app.register(rateLimit, {
apps/backend/src/server.ts:145:    global: true,
apps/backend/src/server.ts:150:    store: createPgRateLimitStore(dbHandle.pool, 'global') as never,
apps/backend/src/server.ts:157:      'x-ratelimit-limit': true,
apps/backend/src/server.ts:158:      'x-ratelimit-remaining': true,
apps/backend/src/server.ts:159:      'x-ratelimit-reset': true,
apps/backend/src/server.ts:162:      'x-ratelimit-limit': true,
apps/backend/src/server.ts:163:      'x-ratelimit-remaining': true,
apps/backend/src/server.ts:164:      'x-ratelimit-reset': true,
apps/backend/src/server.ts:165:      'retry-after': true,
apps/backend/src/server.ts:174:  // Adversarial review API-C-2: `@fastify/rate-limit` runs as an
apps/backend/src/server.ts:190:        req.log?.warn?.({ err }, 'rate-limit actor lookup failed; falling back to ip');
apps/backend/src/server.ts:196:  app.decorate('rateLimitConfig', {
apps/backend/src/server.ts:201:      store: createPgRateLimitStore(dbHandle.pool, 'mutation') as never,
apps/backend/src/server.ts:207:      store: createPgRateLimitStore(dbHandle.pool, 'sensitive') as never,
apps/backend/src/server.ts:215:      store: createPgRateLimitStore(dbHandle.pool, 'read') as never,
apps/backend/src/server.ts:225:      store: createPgRateLimitStore(dbHandle.pool, 'reporter_edit') as never,
apps/backend/src/server.ts:332:    rateLimitConfig: {
apps/backend/src/server.ts:333:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:348:    rateLimitConfig: {
apps/backend/src/server.ts:349:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:364:    rateLimitConfig: {
apps/backend/src/server.ts:365:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:392:    rateLimitConfig: {
apps/backend/src/server.ts:393:      mutation: app.rateLimitConfig.mutation,
apps/backend/src/server.ts:394:      read: app.rateLimitConfig.read,
apps/backend/src/server.ts:395:      reporterEdit: app.rateLimitConfig.reporterEdit,
apps/backend/src/modules/voc/routes.ts:50:  rateLimitConfig?: {
apps/backend/src/modules/voc/routes.ts:58:  const { db, sessionService, vocService, vocReadService, idempotencyService, conversationService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/voc/routes.ts:92:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:163:  // TODO(#14 follow-up): triage rate-limit bucket per spec (60/min vs shared mutation 10/min)
apps/backend/src/modules/voc/routes.ts:168:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:272:    ...(rateLimitConfig
apps/backend/src/modules/voc/routes.ts:273:      ? { config: { rateLimit: (rateLimitConfig.reporterEdit ?? rateLimitConfig.mutation) as never } }
apps/backend/src/modules/voc/routes.ts:367:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:398:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:447:    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
apps/backend/src/modules/voc/routes.ts:483:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket (currently uses shared mutation tier)
apps/backend/src/modules/voc/routes.ts:488:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:541:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
apps/backend/src/modules/voc/routes.ts:546:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/routes.ts:596:  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
apps/backend/src/modules/voc/routes.ts:601:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/types/fastify.d.ts:28:    rateLimitConfig: {
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:772:  it('exceeding mutation tier → 429 rate_limited.actor with retry-after', async () => {
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:778:    //   - 429 envelope is `rate_limited.actor` with `retry-after` header
apps/backend/src/modules/voc/__tests__/create-voc.integration.test.ts:812:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/modules/voc/__tests__/_seed-helpers.ts:415:  // rate-limit-pg-store.ts). Dev test actors are identified by external_id prefix
apps/backend/src/types/fastify.d.ts:28:    rateLimitConfig: {
apps/backend/src/modules/managed-systems/routes.ts:47:  rateLimitConfig?: { mutation: Record<string, unknown> };
apps/backend/src/modules/managed-systems/routes.ts:54:  const { sessionService, managedSystemService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/managed-systems/routes.ts:74:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/managed-systems/routes.ts:100:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/managed-systems/routes.ts:142:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:131:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:141:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:648:    // Use fresh actor to avoid polluting shared rate-limit bucket.
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:674:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/modules/voc/__tests__/_seed-helpers.ts:415:  // rate-limit-pg-store.ts). Dev test actors are identified by external_id prefix
apps/backend/src/db/__tests__/migration.test.ts:126:    // The rate-limit backing table (ADR-0015:7-8) must be writable by the
apps/backend/src/modules/core/jobs/index.ts:11:import { registerRateLimitsPurge } from './rate-limits-purge.js';
apps/backend/src/modules/core/jobs/index.ts:20:  await registerRateLimitsPurge(boss, deps);
apps/backend/src/modules/core/jobs/index.ts:25:export { RATE_LIMITS_PURGE_QUEUE, RATE_LIMITS_PURGE_CRON } from './rate-limits-purge.js';
apps/backend/src/modules/core/jobs/index.ts:26:export { purgeExpiredRateLimits } from './rate-limits-purge.js';
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:131:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:141:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:648:    // Use fresh actor to avoid polluting shared rate-limit bucket.
apps/backend/src/modules/voc/__tests__/post-public-update.integration.test.ts:674:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/lib/rate-limit-pg-store.ts:1:// Postgres-backed store for @fastify/rate-limit. ADR-0015:7-8 requires that
apps/backend/src/lib/rate-limit-pg-store.ts:13:// the table without colliding with the global per-Actor / per-IP tier.
apps/backend/src/lib/rate-limit-pg-store.ts:20:  routeGroup?: string; // 'global' | 'mutation' | 'sensitive'; merged via child()
apps/backend/src/lib/rate-limit-pg-store.ts:30: * @fastify/rate-limit plugin instantiates whatever class is passed via
apps/backend/src/lib/rate-limit-pg-store.ts:34:export function createPgRateLimitStore(pool: pg.Pool, routeGroup: string) {
apps/backend/src/lib/rate-limit-pg-store.ts:35:  return class BoundPgStore extends PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:42:export class PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:46:    this.options = { routeGroup: 'global', ...options };
apps/backend/src/lib/rate-limit-pg-store.ts:51:    const routeGroup = this.options.routeGroup ?? 'global';
apps/backend/src/lib/rate-limit-pg-store.ts:84:  child(routeOptions: Record<string, unknown>): PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:89:    const child = Object.create(Object.getPrototypeOf(this) as object) as PgRateLimitStore;
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:125:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:133:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:340:    // Fresh reporter actor to avoid polluting shared rate-limit bucket.
apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts:372:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/lib/rate-limit-pg-store.ts:1:// Postgres-backed store for @fastify/rate-limit. ADR-0015:7-8 requires that
apps/backend/src/lib/rate-limit-pg-store.ts:13:// the table without colliding with the global per-Actor / per-IP tier.
apps/backend/src/lib/rate-limit-pg-store.ts:20:  routeGroup?: string; // 'global' | 'mutation' | 'sensitive'; merged via child()
apps/backend/src/lib/rate-limit-pg-store.ts:30: * @fastify/rate-limit plugin instantiates whatever class is passed via
apps/backend/src/lib/rate-limit-pg-store.ts:34:export function createPgRateLimitStore(pool: pg.Pool, routeGroup: string) {
apps/backend/src/lib/rate-limit-pg-store.ts:35:  return class BoundPgStore extends PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:42:export class PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:46:    this.options = { routeGroup: 'global', ...options };
apps/backend/src/lib/rate-limit-pg-store.ts:51:    const routeGroup = this.options.routeGroup ?? 'global';
apps/backend/src/lib/rate-limit-pg-store.ts:84:  child(routeOptions: Record<string, unknown>): PgRateLimitStore {
apps/backend/src/lib/rate-limit-pg-store.ts:89:    const child = Object.create(Object.getPrototypeOf(this) as object) as PgRateLimitStore;
apps/backend/src/db/schema/core.ts:162:// core.rate_limits — ADR-0015:9-14. Backing store for @fastify/rate-limit.
apps/backend/src/db/schema/core.ts:167:// Not workspace-scoped: rate-limit keys are anon-IP or per-Actor (Actor
apps/backend/src/db/schema/core.ts:168:// IDs are globally unique within the MVP single-tenant deployment).
apps/backend/src/db/schema/core.ts:170:export const rateLimits = coreSchema.table(
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:342:  // rate-limit config. Fastify does not expose route.config post-registration
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:345:  // (not 404) to confirm rate-limit middleware didn't eat the route.
apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:370:    // 200 confirms the route is wired and rate-limited correctly (well within 300/min).
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:160:  async function cleanupRateLimits() {
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:184:    await cleanupRateLimits();
apps/backend/src/modules/voc/__tests__/post-internal-comment.integration.test.ts:526:    expect(limited.headers['retry-after']).toBeDefined();
apps/backend/src/config.ts:22:  // spoof `X-Forwarded-For` to reset anon rate-limit buckets and audit IPs
apps/backend/src/modules/analytics-areas/routes.ts:44:  rateLimitConfig?: { mutation: Record<string, unknown> };
apps/backend/src/modules/analytics-areas/routes.ts:51:  const { sessionService, analyticsAreaService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/analytics-areas/routes.ts:70:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/analytics-areas/routes.ts:95:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/analytics-areas/routes.ts:138:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/core/jobs/index.ts:11:import { registerRateLimitsPurge } from './rate-limits-purge.js';
apps/backend/src/modules/core/jobs/index.ts:20:  await registerRateLimitsPurge(boss, deps);
apps/backend/src/modules/core/jobs/index.ts:25:export { RATE_LIMITS_PURGE_QUEUE, RATE_LIMITS_PURGE_CRON } from './rate-limits-purge.js';
apps/backend/src/modules/core/jobs/index.ts:26:export { purgeExpiredRateLimits } from './rate-limits-purge.js';
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:1:// Hourly purge of expired rate-limit rows (F-018; ADR-0015:7-9).
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:4:// PgRateLimitStore resets `expires_at` on each call inside an active
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:28:export interface RateLimitsPurgePayload {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:32:export interface RateLimitsPurgeResult {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:41:export async function purgeExpiredRateLimits(deps: {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:43:}): Promise<RateLimitsPurgeResult> {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:56:export async function registerRateLimitsPurge(
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:67:  await boss.work<RateLimitsPurgePayload>(
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:69:    async (jobs: Array<{ id: string; data: RateLimitsPurgePayload }>) => {
apps/backend/src/modules/core/jobs/rate-limits-purge.ts:72:        const { deleted } = await purgeExpiredRateLimits({ db: deps.db });
apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts:70:  it('registers the hourly rate-limits-purge cron in pgboss.schedule', async () => {
apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts:77:  it('records the rate-limits queue in pgboss.queue with ADR-0009 retry config', async () => {
apps/backend/src/modules/permissions/routes.ts:25:  rateLimitConfig?: {
apps/backend/src/modules/permissions/routes.ts:52:  const { sessionService, checkService, requestService, workspaceId, rateLimitConfig } = opts;
apps/backend/src/modules/permissions/routes.ts:58:  // ADR-0015 mutation tier does not apply (GET). The global per-Actor limit
apps/backend/src/modules/permissions/routes.ts:140:    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:5:// rate-limit store; without a purge, anonymous-IP keys grow unbounded.
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:15:import { purgeExpiredRateLimits } from '../rate-limits-purge.js';
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:43:       values ($1, 'global', 1, now() - interval '2 hours')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:47:    const { deleted } = await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:62:       values ($1, 'global', 1, now() - interval '30 minutes')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:66:    await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:81:       values ($1, 'global', 1, now() + interval '1 minute')`,
apps/backend/src/modules/core/jobs/__tests__/rate-limits-purge.integration.test.ts:85:    await purgeExpiredRateLimits({ db: appHandle.db });
apps/backend/src/modules/auth/session-service.ts:297:     * touch `last_seen_at`. Intended for the `@fastify/rate-limit`

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/backend/src/server.ts | sed -n '144,166p'; printf '\\n--- client lines ---\\n'; nl -ba apps/frontend/src/lib/api/client.ts | sed -n '12,70p'; printf '\\n--- api types new ---\\n'; nl -ba apps/frontend/src/lib/api/types.ts | sed -n '1,45p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
   144	  await app.register(rateLimit, {
   145	    global: true,
   146	    max: (req) => (req.session?.actor_id ? 100 : 50),
   147	    timeWindow: '1 minute',
   148	    allowList: (req) => req.url === '/health',
   149	    keyGenerator: (req) => req.session?.actor_id ?? req.ip,
   150	    store: createPgRateLimitStore(dbHandle.pool, 'global') as never,
   151	    errorResponseBuilder: (_req, ctx) => ({
   152	      code: 'rate_limited.actor',
   153	      message: 'rate limit exceeded',
   154	      detail: { retry_after_seconds: Math.ceil(ctx.ttl / 1000) },
   155	    }),
   156	    addHeadersOnExceeding: {
   157	      'x-ratelimit-limit': true,
   158	      'x-ratelimit-remaining': true,
   159	      'x-ratelimit-reset': true,
   160	    },
   161	    addHeaders: {
   162	      'x-ratelimit-limit': true,
   163	      'x-ratelimit-remaining': true,
   164	      'x-ratelimit-reset': true,
   165	      'retry-after': true,
   166	    },

--- client lines ---
    12	export interface ApiResponse<T> {
    13	  status: number;
    14	  data: T;
    15	  etag: string | undefined;
    16	  requestId: string | undefined;
    17	}
    18	
    19	// PUT is intentionally excluded: the locked API contract auto-mints Idempotency-Key
    20	// only for POST/PATCH/DELETE. Include PUT explicitly if a future endpoint opts in.
    21	const MUTATION_METHODS = new Set(['POST', 'PATCH', 'DELETE']);
    22	
    23	export async function apiClient<T = unknown>(
    24	  method: string,
    25	  path: string,
    26	  opts: ApiClientOptions = {},
    27	): Promise<ApiResponse<T>> {
    28	  const upper = method.toUpperCase();
    29	  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    30	
    31	  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    32	
    33	  if (MUTATION_METHODS.has(upper)) {
    34	    headers['Idempotency-Key'] = opts.idempotencyKey ?? mintInlineKey();
    35	  }
    36	  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
    37	  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;
    38	
    39	  const fetchInit: RequestInit = {
    40	    method: upper,
    41	    headers,
    42	    credentials: 'include',
    43	  };
    44	  if (opts.signal != null) fetchInit.signal = opts.signal;
    45	  if (opts.body !== undefined) {
    46	    fetchInit.body = JSON.stringify(opts.body);
    47	  }
    48	  const res = await fetch(path, fetchInit);
    49	
    50	  const etag = res.headers.get('etag') ?? undefined;
    51	  const requestId = res.headers.get('x-request-id') ?? undefined;
    52	
    53	  if (res.status === 304) {
    54	    return { status: 304, data: undefined as T, etag, requestId };
    55	  }
    56	
    57	  const text = await res.text();
    58	  const data = text ? (JSON.parse(text) as unknown) : undefined;
    59	
    60	  if (!res.ok) {
    61	    const envelope: ApiErrorEnvelope =
    62	      data && typeof data === 'object' && 'code' in data
    63	        ? (data as ApiErrorEnvelope)
    64	        : { code: 'internal.unexpected', message: `HTTP ${res.status}` };
    65	    throw new ApiError(res.status, envelope, requestId);
    66	  }
    67	
    68	  return { status: res.status, data: data as T, etag, requestId };
    69	}
    70	

--- api types new ---
     1	import type { ErrorCode } from '@fops/shared';
     2	
     3	export interface ApiErrorEnvelope {
     4	  code: ErrorCode;
     5	  message: string;
     6	  detail?: Record<string, unknown>;
     7	  requestable_permission?: {
     8	    permission: string;
     9	    managed_system_id?: string;
    10	    reason_required?: boolean;
    11	  };
    12	}
    13	
    14	export class ApiError extends Error {
    15	  constructor(
    16	    public readonly status: number,
    17	    public readonly envelope: ApiErrorEnvelope,
    18	    public readonly requestId?: string,
    19	  ) {
    20	    super(envelope.message);
    21	    this.name = 'ApiError';
    22	  }
    23	  get code(): ErrorCode {
    24	    return this.envelope.code;
    25	  }
    26	  get detail(): Record<string, unknown> | undefined {
    27	    return this.envelope.detail;
    28	  }
    29	}
    30	
    31	export type Tone = 'error' | 'warning' | 'info';
    32	export interface MappedError {
    33	  tone: Tone;
    34	  message: string;
    35	  action?: { label: string; run: () => void } | undefined;
    36	}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "ls packages/ui/src/components/shadcn; printf '\\n--- button? ---\\n'; nl -ba packages/ui/src/components/shadcn/button.tsx 2>/dev/null | sed -n '1,100p'; printf '\\n--- toggle ---\\n'; nl -ba packages/ui/src/components/shadcn/toggle-group.tsx | sed -n '1,180p'; printf '\\n--- combobox ---\\n'; nl -ba packages/ui/src/components/shadcn/combobox.tsx | sed -n '1,220p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
alert-dialog.tsx
alert.tsx
avatar.tsx
badge.tsx
button.tsx
card.tsx
checkbox.tsx
combobox.tsx
dialog.tsx
dropdown-menu.tsx
hover-card.tsx
input.tsx
label.tsx
popover.tsx
radio-group.tsx
select.tsx
sheet.tsx
skeleton.tsx
tabs.tsx
textarea.tsx
toggle-group.tsx
tooltip.tsx

--- button? ---
     1	export { Button, buttonVariants } from '../Button.js';
     2	export type { ButtonProps } from '../Button.js';

--- toggle ---
     1	import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
     2	import { type VariantProps, cva } from 'class-variance-authority';
     3	import * as React from 'react';
     4	import { cn } from '../../utils/cn.js';
     5	
     6	const toggleGroupItemVariants = cva(
     7	  'inline-flex items-center justify-center text-sm font-medium transition-colors',
     8	  {
     9	    variants: {
    10	      variant: {
    11	        default:
    12	          'bg-transparent hover:bg-surface-card hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary',
    13	        outline:
    14	          'border border-border-subtle bg-transparent hover:bg-surface-card hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary',
    15	      },
    16	      size: {
    17	        default: 'h-10 px-3',
    18	        sm: 'h-9 px-2.5',
    19	        lg: 'h-11 px-5',
    20	      },
    21	    },
    22	    defaultVariants: { variant: 'default', size: 'default' },
    23	  },
    24	);
    25	
    26	type ToggleGroupContext = VariantProps<typeof toggleGroupItemVariants>;
    27	const ToggleGroupContext = React.createContext<ToggleGroupContext>({
    28	  size: 'default',
    29	  variant: 'default',
    30	});
    31	
    32	export const ToggleGroup = React.forwardRef<
    33	  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
    34	  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    35	    VariantProps<typeof toggleGroupItemVariants>
    36	>(({ className, variant, size, children, ...props }, ref) => (
    37	  <ToggleGroupPrimitive.Root
    38	    ref={ref}
    39	    className={cn('flex items-center justify-center gap-1', className)}
    40	    {...props}
    41	  >
    42	    <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    43	  </ToggleGroupPrimitive.Root>
    44	));
    45	ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;
    46	
    47	export const ToggleGroupItem = React.forwardRef<
    48	  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
    49	  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    50	    VariantProps<typeof toggleGroupItemVariants>
    51	>(({ className, children, variant, size, ...props }, ref) => {
    52	  const context = React.useContext(ToggleGroupContext);
    53	  return (
    54	    <ToggleGroupPrimitive.Item
    55	      ref={ref}
    56	      className={cn(
    57	        toggleGroupItemVariants({
    58	          variant: context.variant || variant,
    59	          size: context.size || size,
    60	        }),
    61	        className,
    62	      )}
    63	      {...props}
    64	    >
    65	      {children}
    66	    </ToggleGroupPrimitive.Item>
    67	  );
    68	});
    69	ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

--- combobox ---
     1	import { Check, ChevronsUpDown } from 'lucide-react';
     2	/**
     3	 * Combobox — command-less pattern (ADR-0021 C1b).
     4	 *
     5	 * Uses Popover + a native <input> for search + a filtered listbox.
     6	 * Does NOT use cmdk / @radix-ui/react-command. cmdk is installed on the
     7	 * tree for future CommandMenu (C3 wiring), but is NOT consumed here.
     8	 *
     9	 * Prop contract:
    10	 *   options   — array of { value: string; label: string } items
    11	 *   value     — currently selected value (string | null)
    12	 *   onChange  — called with the newly selected value string
    13	 *   placeholder — trigger placeholder text (optional, default "Select…")
    14	 *   searchPlaceholder — search input placeholder (optional, default "Search…")
    15	 *   className — forwarded to the trigger button
    16	 *
    17	 * a11y:
    18	 *   - Trigger has aria-controls linking to the listbox.
    19	 *   - Listbox rendered as <ul role="listbox">; each option as <li role="option">.
    20	 *   - Search input has aria-activedescendant pointing at the highlighted option.
    21	 *   - Keyboard: Arrow Down/Up (cycle), Enter (select), Escape (close), Home/End.
    22	 */
    23	import * as React from 'react';
    24	import { cn } from '../../utils/cn.js';
    25	import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
    26	
    27	export interface ComboboxOption {
    28	  value: string;
    29	  label: string;
    30	}
    31	
    32	export interface ComboboxProps {
    33	  options: ComboboxOption[];
    34	  value: string | null;
    35	  onChange: (value: string) => void;
    36	  placeholder?: string;
    37	  searchPlaceholder?: string;
    38	  className?: string;
    39	  /** When true, the trigger is disabled and the popover cannot be opened. */
    40	  disabled?: boolean;
    41	}
    42	
    43	export function Combobox({
    44	  options,
    45	  value,
    46	  onChange,
    47	  placeholder = 'Select…',
    48	  searchPlaceholder = 'Search…',
    49	  className,
    50	  disabled,
    51	}: ComboboxProps) {
    52	  const [open, setOpen] = React.useState(false);
    53	  const [search, setSearch] = React.useState('');
    54	  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
    55	
    56	  // Stable IDs for a11y
    57	  const listboxId = React.useId();
    58	  const optionIdPrefix = React.useId();
    59	
    60	  const filtered = React.useMemo(() => {
    61	    if (!search) return options;
    62	    const lower = search.toLowerCase();
    63	    return options.filter((o) => o.label.toLowerCase().includes(lower));
    64	  }, [options, search]);
    65	
    66	  const selected = options.find((o) => o.value === value);
    67	
    68	  // Reset active index when filtered list changes or popover closes.
    69	  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — filtered is a derived value from useMemo; open is a signal not a dep of setActiveIndex
    70	  React.useEffect(() => {
    71	    setActiveIndex(-1);
    72	  }, [filtered, open]);
    73	
    74	  const activeOptionId =
    75	    activeIndex >= 0 && activeIndex < filtered.length
    76	      ? `${optionIdPrefix}-opt-${activeIndex}`
    77	      : undefined;
    78	
    79	  function selectOption(option: ComboboxOption) {
    80	    onChange(option.value);
    81	    setOpen(false);
    82	    setSearch('');
    83	    setActiveIndex(-1);
    84	  }
    85	
    86	  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    87	    if (!open) return;
    88	
    89	    switch (e.key) {
    90	      case 'ArrowDown': {
    91	        e.preventDefault();
    92	        setActiveIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    93	        break;
    94	      }
    95	      case 'ArrowUp': {
    96	        e.preventDefault();
    97	        setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    98	        break;
    99	      }
   100	      case 'Home': {
   101	        e.preventDefault();
   102	        setActiveIndex(0);
   103	        break;
   104	      }
   105	      case 'End': {
   106	        e.preventDefault();
   107	        setActiveIndex(filtered.length - 1);
   108	        break;
   109	      }
   110	      case 'Enter': {
   111	        e.preventDefault();
   112	        if (activeIndex >= 0 && activeIndex < filtered.length) {
   113	          const opt = filtered[activeIndex];
   114	          if (opt) selectOption(opt);
   115	        }
   116	        break;
   117	      }
   118	      case 'Escape': {
   119	        e.preventDefault();
   120	        setOpen(false);
   121	        break;
   122	      }
   123	    }
   124	  }
   125	
   126	  // WAI-ARIA combobox pattern: ArrowDown/Enter/Space on a closed trigger opens
   127	  // the popover and primes the first option as active.
   128	  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
   129	    if (disabled) return;
   130	    if (
   131	      !open &&
   132	      (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')
   133	    ) {
   134	      e.preventDefault();
   135	      setOpen(true);
   136	      setActiveIndex(0);
   137	    }
   138	  }
   139	
   140	  return (
   141	    <Popover
   142	      open={open}
   143	      onOpenChange={(next) => {
   144	        if (!disabled) setOpen(next);
   145	      }}
   146	    >
   147	      <PopoverTrigger asChild>
   148	        <button
   149	          type="button"
   150	          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG §combobox requires button+role="combobox"; native <select> does not support this popover-with-search pattern
   151	          role="combobox"
   152	          aria-expanded={open}
   153	          aria-haspopup="listbox"
   154	          aria-controls={open ? listboxId : undefined}
   155	          aria-disabled={disabled}
   156	          disabled={disabled}
   157	          onKeyDown={handleTriggerKeyDown}
   158	          className={cn(
   159	            'flex h-10 w-full items-center justify-between rounded-md border border-border-subtle bg-surface-field px-3 py-2 text-sm text-text-primary',
   160	            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
   161	            'disabled:cursor-not-allowed disabled:opacity-50',
   162	            !selected && 'text-text-muted',
   163	            className,
   164	          )}
   165	        >
   166	          <span className="truncate">{selected ? selected.label : placeholder}</span>
   167	          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
   168	        </button>
   169	      </PopoverTrigger>
   170	      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
   171	        <div className="border-b border-border-subtle px-3 py-2">
   172	          <input
   173	            // biome-ignore lint/a11y/noAutofocus: WAI-ARIA APG §combobox requires search input to auto-focus when popup opens so keyboard users can immediately type to filter
   174	            autoFocus
   175	            value={search}
   176	            onChange={(e) => setSearch(e.target.value)}
   177	            onKeyDown={handleKeyDown}
   178	            placeholder={searchPlaceholder}
   179	            aria-autocomplete="list"
   180	            aria-controls={listboxId}
   181	            aria-activedescendant={activeOptionId}
   182	            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
   183	          />
   184	        </div>
   185	        {/* biome-ignore lint/a11y/useFocusableInteractive: WAI-ARIA APG §combobox — listbox focus managed via aria-activedescendant on the search input; container itself does not need tabIndex */}
   186	        <ul
   187	          id={listboxId}
   188	          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG §combobox requires <ul role="listbox"> as scrollable container; native <select> does not support this layout
   189	          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <ul role="listbox"> is canonical ARIA listbox per APG §combobox; keyboard managed via search input onKeyDown
   190	          role="listbox"
   191	          aria-label="Options"
   192	          className="max-h-60 overflow-y-auto py-1"
   193	        >
   194	          {filtered.length === 0 ? (
   195	            <li className="px-3 py-2 text-sm text-text-muted" role="presentation">
   196	              No results.
   197	            </li>
   198	          ) : (
   199	            filtered.map((option, idx) => (
   200	              // biome-ignore lint/a11y/useKeyWithClickEvents: WAI-ARIA APG §combobox — keyboard selection handled by search input onKeyDown (Enter selects activeIndex); onClick is the pointer path
   201	              <li
   202	                key={option.value}
   203	                id={`${optionIdPrefix}-opt-${idx}`}
   204	                // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG §combobox requires <li role="option">; native <option> only works inside <select>
   205	                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <li role="option"> is canonical ARIA listbox option per APG §combobox
   206	                role="option"
   207	                aria-selected={option.value === value}
   208	                tabIndex={-1}
   209	                className={cn(
   210	                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-text-primary outline-none',
   211	                  'hover:bg-surface-card focus:bg-surface-card',
   212	                  option.value === value && 'font-medium',
   213	                  activeIndex === idx && 'bg-surface-card',
   214	                )}
   215	                onMouseEnter={() => setActiveIndex(idx)}
   216	                onClick={() => selectOption(option)}
   217	              >
   218	                <Check
   219	                  className={cn(
   220	                    'mr-2 h-4 w-4 shrink-0',

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba packages/ui/src/components/shadcn/combobox.tsx | sed -n '218,250p'; printf '\\n--- usages ---\\n'; rg -n \"<Combobox|Combobox\\b\" . -g '*.tsx' -g '*.ts'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
   218	                <Check
   219	                  className={cn(
   220	                    'mr-2 h-4 w-4 shrink-0',
   221	                    option.value === value ? 'opacity-100' : 'opacity-0',
   222	                  )}
   223	                />
   224	                {option.label}
   225	              </li>
   226	            ))
   227	          )}
   228	        </ul>
   229	      </PopoverContent>
   230	    </Popover>
   231	  );
   232	}
   233	Combobox.displayName = 'Combobox';

--- usages ---
./packages/ui/__tests__/shadcn-smoke.test.tsx:27:  Combobox,
./packages/ui/__tests__/shadcn-smoke.test.tsx:61:      render(<Combobox options={[]} value={null} onChange={() => {}} />),
./packages/ui/__tests__/combobox.test.tsx:2: * Combobox a11y + keyboard nav tests.
./packages/ui/__tests__/combobox.test.tsx:7:import { Combobox } from '../src/components/shadcn/combobox';
./packages/ui/__tests__/combobox.test.tsx:15:describe('Combobox', () => {
./packages/ui/__tests__/combobox.test.tsx:18:      <Combobox options={OPTIONS} value={null} onChange={() => {}} placeholder="Pick one" />,
./packages/ui/__tests__/combobox.test.tsx:24:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:34:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:46:    render(<Combobox options={OPTIONS} value={null} onChange={handleChange} />);
./packages/ui/__tests__/combobox.test.tsx:56:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:65:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:74:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:83:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} disabled />);
./packages/ui/__tests__/combobox.test.tsx:91:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:99:    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
./packages/ui/__tests__/combobox.test.tsx:106:  it('two Combobox instances have distinct listbox IDs', () => {
./packages/ui/__tests__/combobox.test.tsx:109:        <Combobox options={OPTIONS} value={null} onChange={() => {}} />
./packages/ui/__tests__/combobox.test.tsx:110:        <Combobox options={OPTIONS} value={null} onChange={() => {}} />
./packages/ui/src/components/shadcn/combobox.tsx:3: * Combobox — command-less pattern (ADR-0021 C1b).
./packages/ui/src/components/shadcn/combobox.tsx:43:export function Combobox({
./packages/ui/src/components/shadcn/combobox.tsx:233:Combobox.displayName = 'Combobox';

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "cat packages/ui/package.json; printf '\\n--- tsconfig ---\\n'; cat packages/ui/tsconfig.json" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
{
  "name": "@fops/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles/tokens.css": "./src/styles/tokens.css",
    "./styles/semantic.css": "./src/styles/semantic.css",
    "./tailwind-preset": "./tailwind.preset.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-hover-card": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tiptap/core": "^3.23.5",
    "@tiptap/extension-link": "^3.23.5",
    "@tiptap/extension-placeholder": "^3.23.5",
    "@tiptap/extension-underline": "^3.23.5",
    "@tiptap/html": "^3.23.5",
    "@tiptap/pm": "^3.23.5",
    "@tiptap/react": "^3.23.5",
    "@tiptap/starter-kit": "^3.23.5",
    "class-variance-authority": "^0.7.1",
    "clsx": "2.1.1",
    "lucide-react": "0.469.0",
    "tailwind-merge": "2.5.5"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.1.0",
    "@types/node": "22.10.2",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "@vitejs/plugin-react": "4.3.4",
    "jsdom": "25.0.1",
    "postcss": "8.4.49",
    "tailwindcss": "3.4.17",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}

--- tsconfig ---
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["react", "react-dom", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tailwind.preset.ts"]
}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'cat tsconfig.base.json' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/frontend/AGENTS.md | sed -n '1,90p'; printf '\\n--- packages ui agents ---\\n'; nl -ba packages/ui/AGENTS.md | sed -n '1,130p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
     1	# Frontend Agent Guide
     2	
     3	## Required Docs
     4	
     5	- Read `docs/frontend/README.md` before frontend changes.
     6	- Use `docs/frontend/ui-design-system.md` for component behavior and layout contracts.
     7	- Use `docs/frontend/component-inventory.md` before creating a new shared component.
     8	- Use `docs/frontend/routes-and-layout.md` for URL state, list/detail behavior, and responsive navigation.
     9	- Use `DESIGN.md` only as the raw token seed.
    10	- Use `apps/frontend/src/features/*/AGENTS.md` for route-specific ownership before adding screens.
    11	
    12	## Design Consistency Rules
    13	
    14	- Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
    15	- Keep the visual model dark, compact, and list-first. Avoid decorative cards, broad gradients, oversized hero sections, and empty whitespace.
    16	- Use one primary action per toolbar or panel. Secondary actions belong in subtle buttons, menus, or contextual rows.
    17	- Reuse `ObjectList`, `DetailPanel`, `StatusBadge`, `SignalBadge`, `PermissionBlockedPanel`, `RichContentEditor`, and `LinkedEntityTrail` before making a screen-specific variant.
    18	- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/ui`.
    19	- Separate reporter-facing status from internal workflow status visually and structurally.
    20	- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
    21	- Right detail panels preserve list context on desktop; they become drill-in panels on mobile.
    22	- Permission-limited content must show an approved summary or a request path, not a blank failure.
    23	- Top-level feature folders are `home`, `my-work`, `voc`, `surveys`, `tasks`, `integration`, and `admin`.
    24	- Findings, Evidence, Coverage, and Links live under Integration, not as top-level work routes.
    25	- Task Requests live under Tasks. Product Areas, Permission Requests, Managed System Registry, and workspace settings live under Admin.
    26	- Managed System scope is a filter/defaulting context, not duplicated navigation.
    27	- Use Role Level labels: Admin, Developer, and User. Backend capability checks remain authoritative.
    28	- Keep Public Update, Reporter Reply, and Internal Comment as separate communication surfaces.
    29	
    30	## Component Intake
    31	
    32	- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
    33	- Before creating a new component, check `packages/ui`, the feature's existing components, and `docs/frontend/component-inventory.md`.
    34	- Use existing wrappers under `packages/ui/src/ui` before importing shadcn/Radix primitives directly.
    35	- Do not import raw Radix primitives in feature screens when a wrapper exists.
    36	- Use installed libraries, shadcn/Radix wrappers, and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs, or form controls.
    37	- Add new tokens or variants to docs before using them broadly.
    38	- Use `lucide-react` icons and accessible labels for icon-only controls.
    39	
    40	## Verification
    41	
    42	- Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.
    43	- Screenshot-check desktop, tablet, and mobile for layout changes.

--- packages ui agents ---
     1	# UI Package Agent Guide
     2	
     3	## Allowed Content
     4	
     5	- UI primitives and wrappers.
     6	- Product primitives such as lists, panels, badges, toolbars, and blocked states.
     7	- Domain display components when they are pure presentation.
     8	- Semantic token implementation.
     9	
    10	## Forbidden Content
    11	
    12	- API calls.
    13	- Backend permission decisions as truth.
    14	- Domain mutation orchestration.
    15	- Feature-specific route state.
    16	- Hard-coded screen workflows.
    17	
    18	## Design Rules
    19	
    20	- Use semantic tokens, not raw hex values, outside token implementation files.
    21	- Follow `DESIGN.md` tokens for dark surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/ui`.
    22	- Promote from feature-local code only after a second real consumer proves reuse.
    23	- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
    24	- Icon-only controls require accessible labels and tooltips.

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node - <<'NODE'
const fs=require('fs'); const codes=[...fs.readFileSync('packages/shared/src/errors/codes.ts','utf8').matchAll(/'(["'^'"']+)'/g)].map(m=>m[1]).filter(c=>c.includes('.'));
const mapper=fs.readFileSync('apps/frontend/src/lib/api/errorMapper.ts','utf8'); const missing=codes.filter(c=>"'!mapper.includes(`'"'"'${c}'"'"'`)); console.log({count:codes.length,missing});
NODE' in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
{ count: 32, missing: [] }

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba apps/backend/src/modules/managed-systems/routes.ts | sed -n '60,110p'; nl -ba apps/backend/src/modules/analytics-areas/routes.ts | sed -n '60,110p'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
    60	    if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
    61	      throw new HttpError(
    62	        'validation.malformed_idempotency_key',
    63	        'Idempotency-Key must be a UUIDv4',
    64	      );
    65	    }
    66	    return headerKey;
    67	  }
    68	
    69	  // ── POST /managed-systems ─────────────────────────────────────────────
    70	  app.route({
    71	    method: 'POST',
    72	    url: '/managed-systems',
    73	    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    74	    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    75	    schema: { body: createBodySchema },
    76	    handler: async (req, reply) => {
    77	      const sess = req.session;
    78	      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
    79	      const idempotencyKey = parseIdempotencyKey(req.headers as Record<string, unknown>);
    80	      const actor: ActorContext = {
    81	        actor_id: sess.actor_id,
    82	        workspace_id: sess.workspace_id,
    83	        role_level: sess.role_level,
    84	      };
    85	      const body = req.body as z.infer<typeof createBodySchema>;
    86	      const result = await managedSystemService.registerManagedSystem(
    87	        actor,
    88	        body,
    89	        idempotencyKey !== undefined ? { idempotencyKey } : {},
    90	      );
    91	      return reply.code(result.status).send(result.body);
    92	    },
    93	  });
    94	
    95	  // ── PATCH /managed-systems/:id ────────────────────────────────────────
    96	  app.route({
    97	    method: 'PATCH',
    98	    url: '/managed-systems/:id',
    99	    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
   100	    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
   101	    schema: {
   102	      params: z.object({ id: z.string().uuid() }),
   103	      // Body validation via updateBodySchema after the immutable-slug check.
   104	    },
   105	    handler: async (req, reply) => {
   106	      const sess = req.session;
   107	      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
   108	      const rawBody = (req.body ?? {}) as Record<string, unknown>;
   109	      if ('slug' in rawBody) {
   110	        return sendError(reply, 'validation.immutable_field', 'slug is immutable per ADR-0017', {
    60	        'Idempotency-Key must be a UUIDv4',
    61	      );
    62	    }
    63	    return headerKey;
    64	  }
    65	
    66	  app.route({
    67	    method: 'POST',
    68	    url: '/analytics-areas',
    69	    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    70	    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    71	    schema: { body: createBodySchema },
    72	    handler: async (req, reply) => {
    73	      const sess = req.session;
    74	      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
    75	      const idempotencyKey = parseIdempotencyKey(req.headers as Record<string, unknown>);
    76	      const actor: ActorContext = {
    77	        actor_id: sess.actor_id,
    78	        workspace_id: sess.workspace_id,
    79	        role_level: sess.role_level,
    80	      };
    81	      const body = req.body as z.infer<typeof createBodySchema>;
    82	      const result = await analyticsAreaService.registerAnalyticsArea(
    83	        actor,
    84	        body,
    85	        idempotencyKey !== undefined ? { idempotencyKey } : {},
    86	      );
    87	      return reply.code(result.status).send(result.body);
    88	    },
    89	  });
    90	
    91	  app.route({
    92	    method: 'PATCH',
    93	    url: '/analytics-areas/:id',
    94	    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    95	    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    96	    schema: { params: z.object({ id: z.string().uuid() }) },
    97	    handler: async (req, reply) => {
    98	      const sess = req.session;
    99	      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
   100	      const rawBody = (req.body ?? {}) as Record<string, unknown>;
   101	      for (const field of IMMUTABLE_PATCH_FIELDS) {
   102	        if (field in rawBody) {
   103	          return sendError(
   104	            reply,
   105	            'validation.immutable_field',
   106	            `${field} is immutable per ADR-0017`,
   107	            { field },
   108	          );
   109	        }
   110	      }

hook: PostToolUse
hook: PostToolUse Completed
codex
# Implementation Review — Slice 3 #18 FE Prologue · Cycle 3 (componentization + FE↔BE wire)

## LENS 1 — Componentization findings

### Severity summary
P0: 0 · P1: 0 · P2: 3 · P3: 0

### Findings

[P2] `AnalyticsAreaPicker` is promoted to `@fops/ui` without a real consumer  
`packages/ui/src/index.ts:8`, `apps/frontend/src/routes/_authed/admin/analytics-areas.tsx:337`  
Issue: the component is exported publicly, but the only route-level “consumer” is `_unusedPickerImport`, explicitly added to silence no-consumer complaints. This violates the two-consumer rule in `apps/frontend/AGENTS.md:18` and `packages/ui/AGENTS.md:22`.  
Why it matters: future #19/#20/#21 work inherits a public API before its real usage is proven, making later correction harder.  
Suggested fix: remove the fake import/export and keep the AA picker feature-local until a real second consumer exists, or wire it into a real current UI path.

[P2] The two picker components duplicate the same chip-picker implementation  
`packages/ui/src/components/ManagedSystemPicker.tsx:41`, `packages/ui/src/components/AnalyticsAreaPicker.tsx:33`  
Issue: both components repeat the same `ToggleGroup` rendering, empty-string-to-null behavior, archived label handling, test ID handling, and selected item class names.  
Why it matters: once both are real consumers, fixes for keyboard behavior, selected styling, truncation, disabled semantics, or archived copy must be patched twice.  
Suggested fix: if both remain, extract a private `ChipPicker` helper inside `packages/ui/src/components/` and keep only the domain-named wrappers public.

[P2] API composition is split between a new primitive package and the old god module  
`apps/frontend/src/lib/api/index.ts:1`, `apps/frontend/src/lib/api.ts:97`, `apps/frontend/src/routes/_authed/admin/managed-systems.tsx:14`  
Issue: #18 adds `apps/frontend/src/lib/api/*`, but current routes still import the older `apps/frontend/src/lib/api.ts`, which owns DTOs, fetch wrappers, and its own `ApiError`.  
Why it matters: #19/#20/#21 can easily import the wrong API surface. That creates duplicated error handling, idempotency behavior, ETag behavior, and wire types.  
Suggested fix: consolidate on one public frontend API module before VOC feature work begins, or rename the new primitive folder to avoid `lib/api.ts` vs `lib/api/index.ts` ambiguity.

## LENS 2 — FE↔BE wire findings

### Severity summary
P0: 0 · P1: 2 · P2: 2 · P3: 0

### Findings

[P1] RichEditor custom node attrs do not match the backend sanitizer  
`packages/ui/src/rich-content/extensions/attachmentRef.ts:3`, `packages/ui/src/rich-content/extensions/mention.ts:3`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:68`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:147`  
Issue: FE `attachmentRef` serializes `name`, `sizeBytes`, and `mimeType`; backend only allows `attachmentRef.attrs.id`. FE `mention` serializes `actor_id` plus `label`; backend only allows `actor_id`.  
Why it matters: documents authored/rendered by the frontend can be rejected by `sanitizeTipTap` as `rich_content.disallowed_node` / disallowed attr key.  
Suggested fix: make TipTap extension attrs match the backend allowlists exactly, or expand the backend allowlist intentionally and add shared tests.

[P1] `surface` does not constrain the editor’s authorable schema  
`packages/ui/src/rich-content/RichEditor.tsx:35`, `packages/ui/src/rich-content/RichEditor.tsx:47`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:101`  
Issue: `RichEditor` accepts a `surface`, but all surfaces register `Link`, `Underline`, `AttachmentRef`, `Mention`, and full `StarterKit` behavior. Backend `public-update` forbids links, attachments, mentions, underline, and code.  
Why it matters: #21 composers can generate payloads the BE rejects, even though the editor was given the correct surface key.  
Suggested fix: derive extensions/toolbar capabilities from `surface`, matching backend allowlists for each surface.

[P2] FE duplicates shared error envelope shape instead of importing the contract  
`apps/frontend/src/lib/api/types.ts:3`, `apps/frontend/src/lib/api.ts:97`, `packages/shared/src/errors/codes.ts:68`  
Issue: the new API primitive imports only `ErrorCode`; the envelope interface is manually duplicated. The legacy `lib/api.ts` duplicates it again with `code: string`.  
Why it matters: `requestable_permission` and future envelope fields can drift silently across frontend call sites.  
Suggested fix: export/import `ErrorEnvelope` from `@fops/shared` directly and delete local envelope interfaces.

[P2] Rate-limit response headers are emitted by BE but dropped by the new client  
`apps/backend/src/server.ts:156`, `apps/backend/src/server.ts:161`, `apps/frontend/src/lib/api/client.ts:50`  
Issue: BE emits `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, and `retry-after`; `apiClient` only returns `etag` and `x-request-id`.  
Why it matters: FE cannot show precise retry timing or throttle state from the actual wire response, despite BE providing it.  
Suggested fix: add a `rateLimit`/`retryAfter` field to `ApiResponse` and `ApiError`, parsed from these headers.

## Cross-cutting concerns

- `errorMapper` currently includes every `ERROR_CODES` value; I found no missing code mapping.
- The biggest FE↔BE risk is rich content: the surface names align, but the allowed authoring shape does not.
- The biggest componentization risk is premature public API: several #18 primitives are exported before production routes prove the final shape.

## Quality call

Not ship-ready for #19/#20/#21 foundation without addressing the two P1 rich-content wire issues. The shell taxonomy is directionally coherent, and the error code catalog is in decent shape, but the API surface split and premature picker export will create avoidable churn as VOC screens land.

## What I did NOT review

- Visual fidelity screenshots or responsive behavior.
- Full shadcn upstream diff parity.
- Backend service internals beyond route/header/error/sanitizer contracts.
- Runtime test execution or browser QA.
hook: Stop
hook: Stop Completed
tokens used
235,761
# Implementation Review — Slice 3 #18 FE Prologue · Cycle 3 (componentization + FE↔BE wire)

## LENS 1 — Componentization findings

### Severity summary
P0: 0 · P1: 0 · P2: 3 · P3: 0

### Findings

[P2] `AnalyticsAreaPicker` is promoted to `@fops/ui` without a real consumer  
`packages/ui/src/index.ts:8`, `apps/frontend/src/routes/_authed/admin/analytics-areas.tsx:337`  
Issue: the component is exported publicly, but the only route-level “consumer” is `_unusedPickerImport`, explicitly added to silence no-consumer complaints. This violates the two-consumer rule in `apps/frontend/AGENTS.md:18` and `packages/ui/AGENTS.md:22`.  
Why it matters: future #19/#20/#21 work inherits a public API before its real usage is proven, making later correction harder.  
Suggested fix: remove the fake import/export and keep the AA picker feature-local until a real second consumer exists, or wire it into a real current UI path.

[P2] The two picker components duplicate the same chip-picker implementation  
`packages/ui/src/components/ManagedSystemPicker.tsx:41`, `packages/ui/src/components/AnalyticsAreaPicker.tsx:33`  
Issue: both components repeat the same `ToggleGroup` rendering, empty-string-to-null behavior, archived label handling, test ID handling, and selected item class names.  
Why it matters: once both are real consumers, fixes for keyboard behavior, selected styling, truncation, disabled semantics, or archived copy must be patched twice.  
Suggested fix: if both remain, extract a private `ChipPicker` helper inside `packages/ui/src/components/` and keep only the domain-named wrappers public.

[P2] API composition is split between a new primitive package and the old god module  
`apps/frontend/src/lib/api/index.ts:1`, `apps/frontend/src/lib/api.ts:97`, `apps/frontend/src/routes/_authed/admin/managed-systems.tsx:14`  
Issue: #18 adds `apps/frontend/src/lib/api/*`, but current routes still import the older `apps/frontend/src/lib/api.ts`, which owns DTOs, fetch wrappers, and its own `ApiError`.  
Why it matters: #19/#20/#21 can easily import the wrong API surface. That creates duplicated error handling, idempotency behavior, ETag behavior, and wire types.  
Suggested fix: consolidate on one public frontend API module before VOC feature work begins, or rename the new primitive folder to avoid `lib/api.ts` vs `lib/api/index.ts` ambiguity.

## LENS 2 — FE↔BE wire findings

### Severity summary
P0: 0 · P1: 2 · P2: 2 · P3: 0

### Findings

[P1] RichEditor custom node attrs do not match the backend sanitizer  
`packages/ui/src/rich-content/extensions/attachmentRef.ts:3`, `packages/ui/src/rich-content/extensions/mention.ts:3`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:68`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:147`  
Issue: FE `attachmentRef` serializes `name`, `sizeBytes`, and `mimeType`; backend only allows `attachmentRef.attrs.id`. FE `mention` serializes `actor_id` plus `label`; backend only allows `actor_id`.  
Why it matters: documents authored/rendered by the frontend can be rejected by `sanitizeTipTap` as `rich_content.disallowed_node` / disallowed attr key.  
Suggested fix: make TipTap extension attrs match the backend allowlists exactly, or expand the backend allowlist intentionally and add shared tests.

[P1] `surface` does not constrain the editor’s authorable schema  
`packages/ui/src/rich-content/RichEditor.tsx:35`, `packages/ui/src/rich-content/RichEditor.tsx:47`, `apps/backend/src/lib/rich-content/surface-allowlists.ts:101`  
Issue: `RichEditor` accepts a `surface`, but all surfaces register `Link`, `Underline`, `AttachmentRef`, `Mention`, and full `StarterKit` behavior. Backend `public-update` forbids links, attachments, mentions, underline, and code.  
Why it matters: #21 composers can generate payloads the BE rejects, even though the editor was given the correct surface key.  
Suggested fix: derive extensions/toolbar capabilities from `surface`, matching backend allowlists for each surface.

[P2] FE duplicates shared error envelope shape instead of importing the contract  
`apps/frontend/src/lib/api/types.ts:3`, `apps/frontend/src/lib/api.ts:97`, `packages/shared/src/errors/codes.ts:68`  
Issue: the new API primitive imports only `ErrorCode`; the envelope interface is manually duplicated. The legacy `lib/api.ts` duplicates it again with `code: string`.  
Why it matters: `requestable_permission` and future envelope fields can drift silently across frontend call sites.  
Suggested fix: export/import `ErrorEnvelope` from `@fops/shared` directly and delete local envelope interfaces.

[P2] Rate-limit response headers are emitted by BE but dropped by the new client  
`apps/backend/src/server.ts:156`, `apps/backend/src/server.ts:161`, `apps/frontend/src/lib/api/client.ts:50`  
Issue: BE emits `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, and `retry-after`; `apiClient` only returns `etag` and `x-request-id`.  
Why it matters: FE cannot show precise retry timing or throttle state from the actual wire response, despite BE providing it.  
Suggested fix: add a `rateLimit`/`retryAfter` field to `ApiResponse` and `ApiError`, parsed from these headers.

## Cross-cutting concerns

- `errorMapper` currently includes every `ERROR_CODES` value; I found no missing code mapping.
- The biggest FE↔BE risk is rich content: the surface names align, but the allowed authoring shape does not.
- The biggest componentization risk is premature public API: several #18 primitives are exported before production routes prove the final shape.

## Quality call

Not ship-ready for #19/#20/#21 foundation without addressing the two P1 rich-content wire issues. The shell taxonomy is directionally coherent, and the error code catalog is in decent shape, but the API surface split and premature picker export will create avoidable churn as VOC screens land.

## What I did NOT review

- Visual fidelity screenshots or responsive behavior.
- Full shadcn upstream diff parity.
- Backend service internals beyond route/header/error/sanitizer contracts.
- Runtime test execution or browser QA.
