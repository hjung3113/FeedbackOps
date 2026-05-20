# Slice 3 #14 — Test Checklist

PR #36 — `feature/14-patch-vocs-triage` → `develop`. 28 integration tests, currently SKIP without DB env.

## Pre-run setup

Required env vars:
```bash
export DATABASE_URL="postgres://fops_app:<pass>@localhost:5432/fops"
export DATABASE_URL_MIGRATE="postgres://fops_migrate:<pass>@localhost:5432/fops"
export WORKSPACE_ID="<seeded-workspace-uuid>"
```

Optional (without `DATABASE_URL_MIGRATE` audit-log assertions skip gracefully, but you lose 70% of coverage).

DB must be migrated + seeded:
```bash
pnpm --filter @fops/backend db:migrate
pnpm --filter @fops/backend db:seed
```

## Static checks (no DB)

- [ ] `pnpm typecheck` → 6/6 green
- [ ] `pnpm check:boundaries` → `boundaries: OK`
- [ ] `pnpm --filter @fops/shared test` → 98 pass
- [ ] `cd apps/backend && pnpm vitest run --reporter=verbose 2>&1 | grep "patch-voc"` → confirms 28 cases discovered

## Integration tests — `patch-voc.integration.test.ts` (28 cases)

Run:
```bash
cd apps/backend && pnpm vitest run src/modules/voc/__tests__/patch-voc.integration.test.ts
```

### Happy path
- [ ] **T1** admin full triage commit → 200 + 4 audit rows in order `[severity_set, owner_assigned, aa_linked, triage_committed]` + `voc_triage_committed.detail` snapshot match

### If-Match
- [ ] **T2** missing If-Match → 422 `validation.failed` path=`[headers,if-match]`
- [ ] **T3** admin stale If-Match → 409 `conflict.stale_write` + `detail.current_updated_at` ISO
- [ ] **T3b** dev no-grant + bogus If-Match → 403 `permission.scope_required`, NO `current_updated_at` leak (C3)

### Severity
- [ ] **T4** retriage high→critical → `voc_severity_set`×2, `voc_triage_committed`×1
- [ ] **T4b** severity high→null clear → 200 + `voc_severity_set{from:high,to:null}` (F2)
- [ ] **T4c** severity null→null no-op → 200, zero `voc_severity_set` (C7)

### Forbidden fields
- [ ] **T5** `reporter_facing_status` → 422 `voc.reporter_status_via_public_update_only`
- [ ] **T6** `title` → 422 `validation.unexpected_field` path=`[title]`
- [ ] **T7** `description_rich_content` → 422 `validation.unexpected_field`
- [ ] **T8** `cluster_decision` → 422 `validation.unexpected_field`
- [ ] **T8b** `display_id` → 422 `validation.unexpected_field`

### Postpone
- [ ] **T9** `{postpone_review:true}` → 200, `triage_state='untriaged'`, `postponed_at` set, `voc_triage_postponed` audit
- [ ] **T9b** postpone + severity + owner + AA combined → 200, audit order `[postponed, severity_set, owner_assigned, aa_linked]` (F13)
- [ ] **T10** postpone + triage_state mutex → 422 `validation.failed`
- [ ] **T10b** postpone on already-triaged → 422 `validation.failed` code=`invalid_state` (F7)
- [ ] **T10c** postpone then triage → `triage_state_review_postponed_at IS NULL` (C5)

### Owner
- [ ] **T11** both owner_user_id + owner_team_id → 422 `validation.failed`
- [ ] **T11b** row owner=user, PATCH `{owner_team_id}` only → 422 (NOT 500) (C2)

### AA / archive / parent
- [ ] **T12** AA from different MS → 422 `validation.failed` code=`out_of_scope`
- [ ] **T13** archived VOC → 409 `conflict.record_archived`
- [ ] **T14** parent MS archived → 409 `conflict.parent_archived`

### Permission
- [ ] **T15** developer no MS-scoped grant → 403 `permission.scope_required` + `requestable_permission` top-level + `detail.requiredScope=[msId]`
- [ ] **T16** revoked grant → 403 `permission.denied` with `detail.reason='grant_revoked'` (F1 reason discrimination)

### Empty diff / concurrency / idempotency
- [ ] **T17** `{}` → 200, `updated_at` unchanged, zero new audit (F5)
- [ ] **T18** Promise.all concurrent PATCH same If-Match → `[200,409]`, winner severity ∈ `[low,medium]`, exactly 1 `voc_severity_set` (F4+C6)
- [ ] **T19** idempotency replay same key+body → both 200, same `updated_at`, one DB write (F8)
- [ ] **T20** idempotency key reuse different body → 409 `conflict.idempotency_key_reuse`

## Spot checks (manual, outside test suite)

- [ ] **Error envelope shape** — curl PATCH with bogus If-Match, confirm response body has `code`, `message`, `detail.current_updated_at` as ISO string
- [ ] **`permission.scope_required` envelope** — login as developer (insert via SQL if no seeded dev), PATCH → confirm `body.requestable_permission` at top-level (NOT under `detail`)
- [ ] **`permission.denied` reason discriminator** — revoke a grant, PATCH → confirm `body.detail.reason === 'grant_revoked'` and NO `requestable_permission`
- [ ] **Audit log row order** — query `select event_type, created_at from core.audit_log where subject_id = '<vocId>' order by created_at` after a full triage commit, confirm 4 rows in spec order
- [ ] **Idempotency replay byte-identity** — fire two PATCH with same Idempotency-Key + same body, diff the response JSON byte-for-byte

## Post-run cleanup verification

- [ ] After full suite, run: `select count(*) from core.audit_log where event_type like 'voc_%' and subject_id not in (select id from voc.vocs)` → expect `0` (C1 regression guard built into `afterAll`)
- [ ] `select count(*) from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like 'it-patch-%')` → expect `0`

## Sign-off

- [ ] All 28 integration tests PASS (0 FAIL)
- [ ] Static checks green (typecheck, boundaries, shared)
- [ ] Spot checks confirm envelope shapes match `ErrorEnvelope` interface
- [ ] PR #36 review complete
- [ ] Merge to `develop`
- [ ] Close issue #14
