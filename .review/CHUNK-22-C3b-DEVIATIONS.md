# PLAN-22 C3b — Deviations

Branch: `feature/22-c3b-post-attachments-happy-path`
Commits: e0d8799 (RED), 822d922 (GREEN)

## Deviations from plan

### D1 — UUID source: `randomUUID()` (UUIDv4), not UUIDv7
Plan §C3b step (a) says "Generate uuidv7 → storage_key …; use existing `uuidv7` helper if present (`git grep uuidv7`); else `uuid` npm pkg's v7." 
- No `uuidv7` helper exists in repo (only doc references in storage `index.ts` comments and `voc.ts` schema comment).
- No `uuid` npm dep in `apps/backend/package.json`.
- ADR-0015:65 says "uuid v7 from `pg_uuidv7` if available, else app-side v4". 
- Existing `voc_attachments` schema uses `defaultRandom()` (UUIDv4); voc service uses `node:crypto.randomUUID()` everywhere.

**Picked:** `randomUUID()` (UUIDv4). Adding a `uuid` dep + porting away from `randomUUID` is out of scope for C3b; ADR-0015 already sanctions v4 fallback. Storage key still satisfies the documented `{workspace_id}/{uuid}/{sanitized_filename}` shape — uniqueness invariant holds either way (UNIQUE index on `storage_key`).

### D2 — Idempotency hash domain
Plan asks for an idempotency frame. The frame hashes a body the same actor+key MUST be replaying — body bytes themselves are too expensive to hash on every replay (25MB SHA on hot path), so the canonical request hash binds **`{route, filename, mime_type, size_bytes}`** instead. Replay with the same metadata returns the cached envelope; replay with different metadata + same key returns `conflict.idempotency_key_reuse` (409). This is documented inline in `routes.ts` step 6.

### D3 — Test seam for storage mock
Plan says "Mock storage in tests via `vi.mock` of factory or by injecting backend stub." Picked **injected backend stub** via a new optional `storage?: StorageBackend` on `BuildServerOptions`. `vi.mock` of the factory would have leaked across files and missed call-order assertions; DI mirrors the existing audit/idempotency wiring pattern in `server.ts`.

### D4 — Validation tombstone
Plan offered: flip the C3a `501 not_implemented.todo` tombstone to `201` or delete + rely on the new happy test. **Deleted**. The happy-path test asserts envelope shape, ordering, idempotency, audit, and storage_key shape — strict superset of what the tombstone covered.

### D5 — Repo INSERT uses raw SQL, not drizzle table builder
`voc_attachments` drizzle schema does not expose `workspace_id` (the migration ships no such column; workspace association flows via voc_id / comment_id after linking). The drizzle insert builder would force us to enumerate every column for an INSERT shape we already know. Single `sql\`insert into voc.voc_attachments …\`` with bound params keeps the call site small.

### D6 — Shared schema package `attachment.ts`
Plan said C5 owns `packages/shared/src/vocs/attachment.ts`; C3b may use an inline zod schema for envelope assertions OR add to shared and flag. **Skipped both** — the integration test asserts the envelope shape field-by-field (id/name/size_bytes/mime_type/uploaded_by_actor_id/created_at) without a zod schema. C5 will land the shared schema later.

## Auto-fixes (Rule 1/2/3)

None. The C3a route + audit/error registrations made this straight wiring work.

## Verification

- `pnpm --filter @fops/backend typecheck` — green.
- `pnpm --filter @fops/backend test` — 214 passed, 394 skipped (integration suites skip without `DATABASE_URL`). No regressions.
- Integration suite for C3b (`post-attachments-happy.integration.test.ts`) is wired against the live Postgres harness; it runs when `DATABASE_URL` + `WORKSPACE_ID` are set, identical gating to C3a.

## Files touched (LOC)

| File | Δ |
| --- | --- |
| `apps/backend/src/modules/attachments/service.ts` | +120 (new) |
| `apps/backend/src/modules/attachments/repo.ts` | +70 (new) |
| `apps/backend/src/modules/attachments/routes.ts` | ~+55 / −15 |
| `apps/backend/src/modules/attachments/index.ts` | +1 |
| `apps/backend/src/modules/attachments/__tests__/post-attachments-happy.integration.test.ts` | +360 (new) |
| `apps/backend/src/modules/attachments/__tests__/post-attachments-validation.integration.test.ts` | −13 |
| `apps/backend/src/server.ts` | +18 / −1 |

Net ~310 LOC across implementation + test files. Within budget.
