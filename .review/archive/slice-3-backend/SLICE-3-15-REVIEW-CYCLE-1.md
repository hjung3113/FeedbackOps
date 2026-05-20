# Slice 3 #15 — Adversarial Review Cycle 1 (codex)

Run: `git diff develop..HEAD | codex exec -` on commit `21ae98a`.

## BLOCKER

### B1 — Scope resolution ignores `permission_denies`
`apps/backend/src/modules/permissions/scope-service.ts:43`
`actorReadScope()` / `actorTriageScope()` only consult `permission_grants`. An actor with a stale `voc.read` grant AND an active `permission_denies` row still gets read access.

**Fix:** Subtract active denies (`revoked_at IS NULL`) for the same `(workspace_id, actor_id, capability)`. Scope rules:
- Workspace-wide deny (`managed_system_id IS NULL`) → scope collapses to empty regardless of grants.
- MS-scoped deny → remove that MS from the resolved list.
- Effective scope (B-MAJOR-1 below): apply per-capability denies for the two capabilities it's now restricted to.

Add integration test: actor with grant + deny → 403/404 on list/detail/conversation.

### B2 — Reporter replies leak to read-scope non-triage actors
`apps/backend/src/modules/voc/repo-read.ts:568` (reporter_replies UNION branch)

Current code: any actor in read scope (without `canTriage`) sees ALL reporter_replies. Plan + spec: reporter sees own only; canTriage sees all.

**Fix:**
- If `canTriage` → include all reporter_replies.
- If `!canTriage && isReporter` → `WHERE actor_id = ${actorId}`.
- If `!canTriage && !isReporter` → omit the reporter_reply branch entirely (non-reporter, non-triage read actors see only public_updates).

Update C4 AC7/AC8 visibility tests accordingly.

## MAJOR

### M1 — effective_scope too wide
`apps/backend/src/modules/voc/repo-read.ts:48` (`actorEffectiveScope`)

Currently: any non-revoked grant of ANY capability. Lets future MS-scoped non-VOC capabilities widen VOC summary visibility / out_of_scope counts. Existence/activity probe surface beyond intended.

**Fix:** redefine as `voc.read ∪ voc.triage` with denies applied. Implementation: union the two scope queries; admin → 'all'.

### M2 — Repo functions don't enforce `workspace_id` defense in depth
`apps/backend/src/modules/voc/repo-read.ts:542, 649, 701` (`selectConversationPage`, `outOfScopeSummary`, `selectPermissionDecisionsSeed`)

Repo invariant per `apps/backend/AGENTS.md`: `workspace_id` in every WHERE. Currently service-layer fetches the VOC by `(workspace_id, vocId)` first, then conversation/seed queries use only `vocId`. Defense in depth wants workspace check at every read.

**Fix:** add `workspaceId` parameter; JOIN `voc.vocs v` ON `v.id = <table>.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL`.

### M3 — `If-None-Match` parser too strict
`apps/backend/src/modules/voc/routes.ts:309`

Exact string compare misses comma-separated lists and `*`.

**Fix:**
```ts
const raw = req.headers['if-none-match'];
const headerVal = Array.isArray(raw) ? raw[0] : raw;
const matches = String(headerVal ?? '')
  .split(',')
  .map(v => v.trim())
  .some(v => v === '*' || v === etag);
```

### M4 — 304 path drops `cache-control`
`apps/backend/src/modules/voc/routes.ts:310`

**Fix:** add `reply.header('cache-control', 'private, no-cache')` to the 304 branch (etag header already present).

### M5 — Conversation cursor shape too loose
`apps/backend/src/modules/voc/read-service.ts:48`

Inline conversation cursor codec parses fields as plain strings; malformed UUID/date casts to SQL → 500.

**Fix:** zod parse with `createdAt: z.string().datetime()`, `id: z.string().uuid()`. Bad → `validation.failed` with `code:'invalid_cursor'`.

### M6 — Severity null sort ordering inconsistent with comment
`apps/backend/src/modules/voc/repo-read.ts:194`

Comment says nulls sort last in ASC; the `CASE … ELSE 0` makes nulls sort first.

**Fix:** explicit `ORDER BY (severity IS NULL) ASC, severity_ord ASC/DESC, id ...`; include null flag in cursor predicate.

### M7 — VOC repo reads `core.managed_systems` (boundary violation)
`apps/backend/src/modules/voc/repo-read.ts:74` (`allManagedSystemIds`)

Per `apps/backend/AGENTS.md` "Repositories write only tables owned by their module … Read models may compose approved projections". Reading `core.managed_systems` from VOC repo is an unapproved cross-module read.

**Fix:** move `allManagedSystemIds` into `apps/backend/src/modules/core/managed-systems/` (read helper module) or into the existing managed-systems service; import from voc/repo-read.ts. Document the cross-module read in a comment.

## MINOR

### m1 — AC22 workspace isolation test is ceremonial
`apps/backend/src/modules/voc/__tests__/list-vocs.integration.test.ts:552`

**Fix:** insert a VOC under a second workspace UUID directly via raw SQL (bypasses workspaceId middleware); assert it's not in the actor's list / not retrievable by id.

### m2 — Rate-limit test doesn't exercise the threshold
`apps/backend/src/modules/voc/__tests__/get-conversation.integration.test.ts:319`

**Fix:** read the registered route's `config.rateLimit` via `app.printRoutes()` or inspect Fastify internals; assert `max=300` is set. (301-request loop is too slow.)

## NIT

### n1 — typo `msMsInReadScope`
`apps/backend/src/modules/voc/read-service.ts:342` — rename to `msInReadScope`.

## Disposition

Apply all BLOCKERs + MAJORs + MINORs + NIT in cycle-1 fix dispatch. After fixes, run cycle-2 review with Opus subagent on the new diff.
