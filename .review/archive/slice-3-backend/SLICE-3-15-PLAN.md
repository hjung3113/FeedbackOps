# Slice 3 #15 — Plan (revised after codex review cycle 1)

**Issue:** GET /vocs (Inbox/My/Triage) + GET /vocs/:id (detail with hybrid 50-inline conversation) + GET /vocs/:id/conversation (pagination tail).

**Branch:** `feature/15-get-vocs` from `develop`.

**Spec authority:** `docs/frontend/specs/voc.md` §8.2 + §8.3; issue #15 body (AC locked).

**Review:** codex cycle-1 findings applied in this revision (see `revisions` section at bottom).

---

## Key context discovered from codebase

1. **`voc.read` capability does NOT exist** in `packages/shared/src/enums/capabilities.ts`. Current list: `workspace.read`, `workspace.admin`, `voc.triage`. Must add.
2. **`effective_scope` does NOT exist on session.** Resolve per-request. Slice 3 definition: actor's effective scope = MSs where actor holds *any* non-revoked grant of *any* capability, PLUS workspace-wide-grant MSs (= all workspace MSs), PLUS admin → all workspace MSs. Distinguish from `voc.read scope` (subset).
3. **Rate-limit tiers** in `server.ts` has `mutation` + `sensitive`. Add `read` (300/min). **No admin bypass in this issue** (rate-limit runs before session populates; deferred to follow-up).
4. **ETag/If-None-Match** infrastructure absent. Implement in route handler. Slice 3: weak ETag `W/"<voc.updated_at-iso>"` — conversation tables are immutable post-create *in Slice 3* (POSTs land in #16). Follow-up filed for #16: composite ETag (voc.updated_at + max visible conversation.created_at).
5. **`voc_permission_decisions_seed_fixture` table exists** (#12).
6. **Conversation tables** (`voc_public_updates`, `voc_reporter_replies`, `voc_internal_comments`) with `(voc_id, created_at)` indexes; UNION ALL ordered by `created_at DESC` is the source.
7. **`cluster_id`** column exists; `similar_count` returns literal `0` in Slice 3, `tab=similar` → `WHERE false`.
8. **`entity_links`** absent (Slice 4): `linked_execution.findingRef`/`taskRef` always `null`.

---

## Chunk breakdown

### C0 — Foundation / shared contracts

**Files:**
- `packages/shared/src/enums/capabilities.ts` — add `'voc.read'`; `CAPABILITY_METADATA['voc.read']={sensitive:false}`.
- `packages/shared/src/vocs/list-item.ts` — `vocListItemSchema`.
- `packages/shared/src/vocs/detail.ts` — `vocDetailEnvelopeSchema` + `vocSummaryEnvelopeSchema`.
- `packages/shared/src/vocs/conversation.ts` — `conversationEntrySchema`, `conversationKindSchema`.
- `packages/shared/src/vocs/list-query.ts` — `listVocsQuerySchema` zod.
- `packages/shared/src/vocs/conversation-query.ts` — `getConversationQuerySchema`.
- `packages/shared/src/vocs/index.ts` — re-export.
- `apps/backend/src/modules/permissions/check-service.ts:205-219` — `roleSatisfies` admin → also `voc.read`.

**list-query zod requirements (codex MAJOR fix):**
- Comma-list filters parsed as `z.string().transform(s => s.split(','))` → `.refine(arr => arr.length <= 10)` → enum array via `z.array(severityEnum)` (severity, reporter_facing_status). Whitelist mapped to drizzle columns server-side.
- Reject unknown filter tokens (zod enum). Empty tokens dropped pre-enum.
- Sort enum whitelist matches plan; mapped through fixed `{column, asc}` dict in repo.
- view=my allows `managed_system_id=<uuid>` (narrows result); rejects `managed_system_id='all'` (422).

**Cursor format (codex MAJOR fix):** `{ s: sortKey; d: 'asc'|'desc'; sv: string|number; id: string }` base64 JSON. Server validates `s` and `d` match the current request's sort/direction; mismatch → `validation.failed` with `code: 'invalid_cursor'`. Per-direction tuple predicates (`(sv,id) < (cursor.sv, cursor.id)` for desc, `>` for asc).

**Pagination concurrency note (codex MAJOR fix):** for mutable-sort columns (severity, reporter_facing_status), pagination is eventually-consistent; documented in route docstring + integration test covers `created_at:desc` (stable) only for the 75-row pagination case. Concurrent insert/update test asserts row may appear twice or be skipped on severity sort — verified behavior, not fixed.

**No migration:** capability text is enum-only in shared package; `permission_grants.capability` is `text` without enum CHECK.

**Tests:** unit zod tests under `packages/shared/src/vocs/__tests__/`.

### C1 — Read repo (`apps/backend/src/modules/voc/repo-read.ts`)

```ts
// Effective scope: ANY non-revoked grant (capability ignored) intersected
// with workspace MSs, PLUS workspace-wide grants → all MSs, PLUS admin →
// all MSs. Returned as MS id list OR 'all'.
async function actorEffectiveScope(db, actor): Promise<'all' | string[]>

// voc.read scope specifically. Same shape.
async function actorReadScope(db, actor): Promise<'all' | string[]>

// voc.triage scope.
async function actorTriageScope(db, actor): Promise<'all' | string[]>

async function allManagedSystemIds(db, workspaceId): Promise<string[]>

async function listVocsForRead(db, args: {
  workspaceId, scopeFilter: 'all' | string[],
  // pre-applied: view-specific (reporter_id eq, triage_state IN ...)
  whereExtensions: SQL[], sort: SortKey, dir: 'asc'|'desc',
  cursor?: DecodedCursor, limit,
}): Promise<{ rows; hasMore; nextCursor }>

async function selectVocByIdForRead(db, workspaceId, vocId): Promise<VocReadRow | null>

async function selectConversationPage(db, args: {
  vocId, actorId, canTriage, isReporter,   // codex MAJOR fix — fine-grained
  cursor?, limit, kind?
}): Promise<{ entries; hasMore; nextCursor }>

async function outOfScopeSummary(db, args: {
  workspaceId, effectiveScope: 'all' | string[], readScope: 'all' | string[],
}): Promise<{ count; severity_distribution } | null>
// Computes count + severity histogram over VOCs in (effective ∩ ¬read).
// Returns null when either: actor has 'all' read, OR effective subset of read,
// OR zero VOCs in the diff. NEVER includes MSs outside effective_scope (codex BLOCKER fix).

async function selectPermissionDecisionsSeed(db, vocId): Promise<unknown | null>
```

**Cursor codec** (`apps/backend/src/modules/voc/cursor.ts`): encode/decode per format above; bad cursor → `HttpError('validation.failed', 'invalid_cursor', ...)`.

**SQL safety:** all dynamic clauses go through drizzle's parameter binding. Sort column resolved via fixed `SORT_COLUMN_MAP` dict; never string-interpolated.

**Conversation UNION query shape (codex MAJOR fix):**
- public_updates: always included.
- reporter_replies: `WHERE actor_id = $actorId OR $canTriage = true` (reporter sees own only; triage actor sees all).
- internal_comments: `$canTriage = true` (else omitted from UNION).

### C2 — Read service (`apps/backend/src/modules/voc/read-service.ts`)

```ts
async function listVocs(actor, query): Promise<ListResult> {
  // 1. Decode cursor (validate s/d match query.sort/dir).
  // 2. view=my: scope = no MS filter; require auth only; managed_system_id='all'→422; uuid→narrow.
  // 3. view=inbox: scope = actorReadScope; if 'scoped' && [] → 403 permission.denied
  //    (no_grant on voc.read; requestable_permission per role).
  // 4. view=triage: scope = intersect(actorReadScope, actorTriageScope); if empty → 403; sort param→422.
  // 5. managed_system_id=<uuid>: must intersect scope; mismatch → 403.
  // 6. Apply tab filters:
  //    - similar: WHERE false (Slice 3)
  //    - no-link: full set (no entity_links yet)
  //    - waiting: triage view only; triage_state='untriaged' AND postponed_at IS NOT NULL
  //    - rest: literal SQL filters
  // 7. listVocsForRead; map row → list-item (similar_count=0).
  // 8. out_of_scope_summary: only when view=inbox (not triage/my); only when readScope is scoped list (not 'all').
  //    Use actorEffectiveScope (NOT allManagedSystemIds) — codex BLOCKER fix.
}

async function getVocDetail(actor, vocId): Promise<DetailEnvelope | SummaryEnvelope> {
  // 1. selectVocByIdForRead. null → 404 not_found.record.
  // 2. isReporter = (row.reporter_id === actor.actor_id).
  // 3. msInReadScope = (readScope === 'all') || readScope.includes(row.primary_ms).
  // 4. msInEffectiveScope = (effectiveScope === 'all') || effectiveScope.includes(row.primary_ms).
  // 5. canTriage = (triageScope === 'all') || triageScope.includes(row.primary_ms).
  // 6. Access matrix (codex BLOCKER fix):
  //    - msInReadScope || isReporter → FULL envelope path.
  //    - !msInReadScope && !isReporter && msInEffectiveScope → SUMMARY envelope with permission_decisions._self.
  //    - !msInReadScope && !isReporter && !msInEffectiveScope → 404 not_found.record (no existence leak).
  // 7. Full path conversation visibility (codex MAJOR fix):
  //    - isReporter && !canTriage → includePublic + onlyOwnReporterReplies + NO internal.
  //    - !isReporter && msInReadScope && !canTriage → includePublic + allReporterReplies + NO internal.
  //    - canTriage → all three kinds.
  // 8. Load permission_decisions seed (if present, include verbatim).
  // 9. Compose envelope + nextReporterStates + linked_execution {null,null}.
}

async function getConversation(actor, vocId, query): Promise<ConvResult> {
  // Same access matrix as getVocDetail step 6 to authorise.
  // Same visibility filter computed (step 7), passed to selectConversationPage.
}

function evaluatePermissionDecision(args): null { return null; }  // Slice 3 stub.
```

### C3 — Routes (`apps/backend/src/modules/voc/routes.ts` extension)

Append three handlers to existing `vocRoutes`. Extend `VocRoutesOptions` with `vocReadService: VocReadService` and `rateLimitConfig.read`.

**ETag (codex MAJOR — Slice 3 scope):**
```ts
const etag = `W/"${row.updated_at.toISOString()}"`;  // weak
if (req.headers['if-none-match'] === etag) return reply.code(304).send();
reply.header('etag', etag);
reply.header('cache-control', 'private, no-cache');
return reply.code(200).send(envelope);
```
Justification: conversation tables don't mutate in Slice 3 (write paths #16). Permission_decisions seed is immutable. So `voc.updated_at` is sufficient. Follow-up filed at `apps/backend/src/modules/voc/read-service.ts` TODO comment: compose with `max(conversation.created_at)` once #16 lands.

**Read rate-limit tier (`server.ts:191-204`):**
```ts
read: { max: 300, timeWindow: '1 minute',
  keyGenerator: mutationKeyGenerator,
  store: createPgRateLimitStore(pool, 'read') as never },
```
**No admin bypass in this issue** (codex MAJOR fix — deferred). File F18 follow-up.

`fastify.d.ts`: extend `rateLimitConfig` decoration with `read`.

### C4 — Integration tests (`apps/backend/src/modules/voc/__tests__/`)

Three files (each AC bullet → ≥1 test; negative existence probes from codex MINOR fix included):

1. `list-vocs.integration.test.ts` — views, tabs, scope filter, out_of_scope_summary uses effective_scope (NOT all MSs), my+MS UUID narrowing OK, my+'all'→422, triage+sort→422, no-scope dev→403, 75-row cursor (created_at:desc), invalid cursor (mismatched s/d)→422.
2. `get-voc.integration.test.ts` — full envelope shape, reporter-self full access without voc.read (BLOCKER fix), reporter-self conversation excludes internal/others' replies, summary envelope when in effective but not read, 404 when not in effective (BLOCKER fix — existence probe), cross-workspace→404, 30 inline, 65→50+has_more, ETag W/"..." round-trip + 304, permission_decisions.linkedFinding from seed.
3. `get-conversation.integration.test.ts` — cursor tail, kind filter, visibility reporter-self, visibility triage, rate-limit 301st→429, mismatched cursor→422.

Use existing `setupTestDb` / `buildServer` from `patch-voc.integration.test.ts`.

### C5 — Wiring + verify + 2-cycle adversarial review + PR

1. `server.ts` — `createVocReadService`, pass to `vocRoutes`.
2. `pnpm typecheck` + `pnpm check:boundaries` + `pnpm test`.
3. **Cycle 1:** `git diff develop..HEAD | codex exec -` security/race review.
4. Apply fixes.
5. **Cycle 2:** Opus subagent (general-purpose with code-review prompt) on diff.
6. Apply fixes.
7. `git push -u origin feature/15-get-vocs`; `gh pr create --base develop`.

---

## Revisions (codex cycle 1)

| Finding | Severity | Resolution |
|---|---|---|
| Reporter denied detail when only `voc.read`-gated | BLOCKER | Access matrix: `isReporter` always full envelope (with restricted visibility). |
| out_of_scope_summary leaks MSs outside effective_scope | BLOCKER | Use `actorEffectiveScope` (NOT `allManagedSystemIds`); diff = effective ∩ ¬read. |
| Summary envelope enables existence probe across MSs | BLOCKER | Summary only when `msInEffectiveScope`; else 404. |
| ETag composite under-spec'd | MAJOR | Slice 3: `W/"<voc.updated_at>"` weak ETag — safe since conversation immutable; TODO for #16. |
| Cursor missing sort/direction | MAJOR | Encode `{s, d, sv, id}`; mismatch → invalid_cursor. |
| Mutable-sort pagination skip/dup | MAJOR | Documented eventually-consistent; integration test covers stable created_at:desc only. |
| Conversation visibility too coarse | MAJOR | Pass `actorId, canTriage, isReporter`; reporter_replies WHERE `actor_id=$actor OR canTriage`. |
| Filter validation missing | MAJOR | zod enum arrays, max 10 tokens, drizzle column whitelist. |
| similar_count + JOIN inconsistency | MAJOR | Slice 3: literal `0`, `tab=similar` → `WHERE false`; follow-up split. |
| Admin rate-limit bypass conflicts with onRequest hook | MAJOR | Drop bypass from this issue; follow-up F18. |
| view=my too strict on MS UUID | MINOR | Allow UUID narrowing; reject only 'all'. |
| Missing negative existence-probe tests | MINOR | Added to C4. |

## Follow-ups (split out)

- **F18** — admin bypass on read-tier rate limit (requires async session lookup in `skip`/`keyGenerator`).
- **F19** — composite detail ETag once #16 ships conversation POSTs (`voc.updated_at + max visible conv.created_at`).
- **F20** — real `similar_count` aggregate JOIN once Cluster table exists.

## Out-of-scope (per issue)

Conversation POSTs (#16), real permission_decisions (Slice 4/5), real similar_count, entity_links, reporter_status_gate, saved list views.
