# PLAN-22 — Slice 3 #22: Attachment Storage (MinIO) + retroactive composer/Create/Edit wire + bundled P0 sanitizer (#41 / #42)

**Branch base:** `develop @ d4aab01`
**Milestone close:** Slice 3 — this plan ships #22 and folds in #41 (render-time client sanitizer) and #42 (external `<a>` `rel`/`target`).
**Baseline test counts before plan:** BE 558 / shared 236 / UI 404 / FE 218. Plan adds tests; chunks must report deltas.

---

## 1. Goal & scope

Activate the `voc_attachments` schema landed in #12 by shipping:

1. A storage abstraction (`StorageBackend` interface) with a single S3-compatible implementation pointed at **MinIO for dev + prod** per #22 spec (overrides the ADR-0011 "two backends" sketch — see Open Question OQ-1 below).
2. `POST /attachments` (multipart, Idempotency-Key, 25 MB cap, declared-MIME allowlist) and `GET /attachments/:id/download` (streaming, entitlement-gated, RFC 5987 disposition).
3. Migration follow-up to #12: rename `storage_uri → storage_key (UNIQUE)`, relax the XOR check to "not both", add `linked_at timestamptz NULL`.
4. Hourly `purge_unlinked_attachments` pg-boss job: delete rows + storage objects where `voc_id IS NULL AND comment_id IS NULL AND created_at < now() - 24h`.
5. Retroactive FE wiring on **VOC Create**, **EditDescriptionModal**, **PublicUpdateComposer**, **InternalCommentComposer**, **ReporterReplyComposer**: dropzones POST `/attachments` per dropped file, collect `id`s, submit `attachment_ids[]` in the parent POST/PATCH body. Removes the `attachment.unsupported_pending_storage_slice` disabled branch everywhere.
6. **RichEditor Attach toolbar button** (TipTap): file picker → POST `/attachments` → on success insert existing `AttachmentRef` node with `attachment_id` attr.
7. **Bundle P0**: #41 render-time client sanitizer (DOMPurify-equivalent walker over TipTap JSON before paint, sharing the BE allowlist) + #42 external `<a>` gains `rel="noopener noreferrer" target="_blank"` while internal links stay untouched.

**Definition of done (goal-backward → §7):**
- `POST /attachments` returns `201 { id, name, size_bytes, mime_type, uploaded_by_actor_id, created_at }`.
- All four composer surfaces + Create + Edit modal can upload and reference attachments without the `unsupported_pending_storage_slice` error code; the error code itself is retired from the codebase.
- `GET /attachments/:id/download` streams with the right `Content-Disposition`, gated by parent-entity entitlement.
- Hourly purge job is registered and verified by integration test (time-warp).
- `RichContentRenderer` blocks hostile JSON (script nodes, `javascript:` hrefs, `onerror` img) and decorates external links per #42.
- Audit vocab `attachment_uploaded` exists with the spec field set (no filename).
- Total test deltas: BE ≥ +60, shared ≥ +20, UI ≥ +15, FE ≥ +20.

**Out of scope (filed as Slice 4+ follow-ups in §6):** signed URLs, file-magic content sniffing, AV scanning, thumbnails, multipart resumable uploads, attachment preview UX, per-MIME size policy, attachment compression, image EXIF stripping.

---

## 2. Architectural decisions (locked) + open questions

### Locked (from #22 + ADR-0011/0012)

| ID | Decision | Source |
|----|----------|--------|
| D-01 | Storage SDK: `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (`Upload` helper for streaming multipart). | #22 spec |
| D-02 | Single backend impl `S3CompatStorageBackend` against MinIO in dev and prod. Env `STORAGE_S3_*`, `STORAGE_S3_FORCE_PATH_STYLE=true`. | #22 spec — overrides ADR-0011's dual-impl sketch. See OQ-1. |
| D-03 | Storage key shape: `{workspace_id}/{uuidv7}/{sanitized_filename}`. | #22 spec |
| D-04 | Upload-then-INSERT ordering: `storage.put()` runs **before** the DB INSERT so a failed upload leaves no row. INSERT failure triggers best-effort `storage.delete(key)` in `finally`; the purge job is the safety net. | #22 spec |
| D-05 | Filename sanitization: strip path separators (`/`, `\`), control chars, NUL bytes; clamp to 255 chars; empty-after-strip → `validation.failed` with `fields:[{path:['filename'], code:'invalid'}]`. | #22 spec + ADR-0012 §detail.fields |
| D-06 | MIME policy: **declared** `Content-Type` checked against allowlist. No magic-byte sniffing in v1 (filed as follow-up). | #22 spec + §3 threat T-04 |
| D-07 | MIME allowlist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `text/csv`, `text/markdown`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. | #22 spec |
| D-08 | Size cap: 25 MB hard. Enforced **both** at multipart parser limit (Fastify `@fastify/multipart` `limits.fileSize`) **and** in app code (defensive). | voc.md §4.4 + #22 |
| D-09 | New error code `storage.unavailable` registered in `packages/shared/src/errors/codes.ts` with status 502 (group with `internal.*`/`upstream.*` — see OQ-2). Korean toast verbatim: `파일 저장소에 접근할 수 없습니다. 잠시 후 다시 시도해 주세요.` | #22 spec + ADR-0012 |
| D-10 | Rate limit: 20 / min / actor on `POST /attachments`; admins bypass. Reuse existing `rate-limit-pg-store.ts`. | #22 spec |
| D-11 | Audit vocab: new event `attachment_uploaded` with `{ attachment_id, actor_id, storage_key, size_bytes, mime_type }`. **No filename** in detail. Schema added to `packages/shared/src/audit/`. | #22 spec |
| D-12 | Migration `0012_*.sql`: rename `storage_uri → storage_key UNIQUE`, drop existing `voc_attachments_subject_xor` CHECK and replace with `NOT (voc_id IS NOT NULL AND comment_id IS NOT NULL)`, add `linked_at timestamptz NULL`. Verify `uploaded_by_actor_id` already `NOT NULL` (it is — see 0010:289-307). | #22 spec |
| D-13 | Purge job: pg-boss `purge_unlinked_attachments` every hour; threshold `now() - interval '24 hours'`. Deletes storage object then DB row. Logs count + bytes reclaimed. | #22 spec |
| D-14 | Client sanitizer (#41): shared allowlist constant lives in **`packages/shared/src/rich-content/allowlist.ts`** (new). BE sanitizer (`apps/backend/src/lib/rich-content/surface-allowlists.ts`) is refactored to import from shared (with a drift test that pins `SURFACE_ALLOWLISTS === SHARED_ALLOWLISTS`). Client renderer in `packages/ui/src/rich-content/` consumes the same constant. | #41 + ADR-0011 |
| D-15 | External link (#42): href is "external" iff it starts with `http://` or `https://` AND its origin ≠ `window.location.origin` (or, in SSR-style render contexts, simply iff href starts with `http://` / `https://`). External anchors receive `rel="noopener noreferrer" target="_blank"`. Hash (`#…`) and root-relative (`/…`) hrefs are unchanged. | #42 |
| D-16 | Streaming download (`GET /attachments/:id/download`) pipes `storage.get()` directly to the reply; entitlement check happens before the pipe opens; `Content-Disposition: attachment; filename="{ascii}"; filename*=UTF-8''{rfc5987(name)}`. | ADR-0011 + #22 |
| D-17 | Permission for `GET download`: caller must be entitled to view the parent VOC (reuse existing visibility helpers), OR the attachment must still be unlinked AND `uploaded_by_actor_id = caller`. | #22 |
| D-18 | TDD ordering: every chunk lands a RED commit (failing tests) before its GREEN commit, per `feedback_workflow.md` precedent in PLAN-21. | Repo convention |
| D-19 | Storage init is lazy. `getStorage()` does **not** validate `STORAGE_S3_*` env or construct the `S3Client` at module load; both happen on first `put`/`get`/`delete`/`exists` call. Production semantics preserved (misconfigured prod still fails loud on first real upload as `storage.unavailable` 502); boot is no longer coupled to attachment-storage env presence. | Hotfix `fix/22-storage-lazy-and-attachments-grants` (post-PR-merge, 2026-05-22) |
| D-20 | `fops_app` role grants on `voc.voc_attachments` = `SELECT, INSERT, UPDATE, DELETE` (migration `0016_grant_app_delete_voc_attachments.sql`). User-facing paths delete only via the service-layer **archive over delete** convention (`archived_at`, `archived_by_actor_id`); the DB-layer `DELETE` privilege exists strictly so the hourly `core.attachments_purge` worker (D-13) can reclaim unlinked rows >24h. The archive-over-delete invariant lives at the service layer, not in the grant set. | Hotfix `fix/22-storage-lazy-and-attachments-grants` (post-PR-merge, 2026-05-22) |

### Open questions (true ambiguity — flagged for user, max 3)

| ID | Question | Why it matters | Default if user is silent |
|----|----------|----------------|---------------------------|
| OQ-1 | ADR-0011 §"Inline Attachments and storage abstraction" specifies **two** impls (`LocalFsAttachmentStorage` for dev + `S3CompatibleAttachmentStorage` for prod) swapped by `ATTACHMENT_STORAGE`. Issue #22 simplifies to **one** impl (MinIO dev + prod) with `STORAGE_S3_*`. Should we (a) follow #22 as-written and amend ADR-0011 with a one-line "supersedes the LocalFs path: MinIO is the single backend", or (b) keep both impls so CI / fresh-checkout devs can boot without docker? | Affects C1 size and onboarding ergonomics. | (a): follow #22, single backend, amend ADR-0011 in C1. The MinIO docker-compose service makes local boot one command; CI uses the same container. |
| OQ-2 | `storage.unavailable` status code: ADR-0012's prefix table currently routes `internal.*` → 500 and `upstream.*` → 502. A storage outage is closer to "upstream dependency unreachable". Should the new code be `storage.unavailable` (new prefix → must extend the prefix table to map `storage.` → 502) or rename to `upstream.storage_unavailable` to reuse the existing prefix? | Trivially changes the registry shape but locks the public error code surface. | New `storage.` prefix → 502, registered in `STATUS_BY_PREFIX`. This matches the spec wording verbatim. |
| OQ-3 | RichEditor Attach button: on a TipTap surface that already restricts toolbar actions per `mode` (ADR-0011), should Attach be available on **all four surfaces** (voc-description, reporter-reply, public-update, internal-comment) or restricted (e.g. no Attach on `public-update` because reporter-facing replies prefer the dropzone path)? | Affects C8 scope and the toolbar config per surface. | All four surfaces get the Attach button; per-surface gating is a future ADR-bound decision. Prototype shows Attach available everywhere the editor is used. |

---

## 3. Threat model (STRIDE on the new surface)

| ID | Category | Component | Disposition | Mitigation |
|----|----------|-----------|-------------|------------|
| T-01 | **I**nformation disclosure | `STORAGE_S3_SECRET_ACCESS_KEY` in env | mitigate | `.env.example` ships **placeholder only**; `.gitignore` already covers `.env*`; secret pulled at process boot via `process.env`; never logged (factory `console.log` redacts via existing `lib/log` patterns). C1 test: ensure no secret appears in fastify logs at default level. |
| T-02 | **T**ampering | Path traversal via uploaded filename ("`../../etc/passwd`") | mitigate | D-05 sanitization strips `/`, `\`, control chars, NUL before storage key assembly. Storage key uses uuidv7 as the unique segment; sanitized filename is only the trailing label. C3 test cases: `../`, `..\\`, embedded `\0`, leading `.`, unicode RTL override `‮`. |
| T-03 | **R**epudiation | Unlinked attachments accumulating with no actor trail | mitigate | `attachment_uploaded` audit event (D-11) records `actor_id` + `storage_key` at upload time, regardless of subsequent link state. Purge job logs `{count, bytes_reclaimed, dry_run_keys[]}` per run. |
| T-04 | **I**nfo disclosure / **T**ampering | MIME spoofing (client sends `image/png` for a `.exe`) | **accept** for v1 | Declared MIME is trusted (D-06). Allowlist excludes executable types. File-magic sniff filed as follow-up; the risk window is bounded by allowlist exclusion of `application/octet-stream` and `application/x-*`. |
| T-05 | **D**enial of service | 25 MB × 20 req/min × N actors → bandwidth + disk | mitigate | Multipart parser hard-caps at 25 MB (D-08) before any disk write. Rate limit 20/min/actor (D-10). Purge job reclaims unlinked storage hourly (D-13). |
| T-06 | **E**levation of privilege | `GET /attachments/:id/download` exposes a row a different workspace owns | mitigate | Storage key starts with `{workspace_id}`; entitlement check in route resolves attachment → parent VOC/comment → visibility helper (existing). Cross-workspace test case in C4. |
| T-07 | **I**nfo disclosure | `storage_key` leakage in audit log reveals `workspace_id` shape | **accept** | `workspace_id` in audit detail is already standard (see existing voc audit vocab). Storage keys are not URLs; possession does not grant access (D-17). |
| T-08 | **T**ampering | Hostile rich-content JSON (script nodes, `javascript:` href, `onerror` img) reaches the renderer | mitigate | #41 client sanitizer walks the TipTap JSON pre-paint, strips disallowed nodes/marks/attrs by shared allowlist (D-14). |
| T-09 | **E**levation of privilege | Reverse-tabnabbing via external links (`target="_blank"` without `noopener`) | mitigate | #42: external `<a>` decorated with `rel="noopener noreferrer" target="_blank"` (D-15). |
| T-10 | **D**enial of service | Boot-time crash if `STORAGE_S3_*` env missing or unreachable (factory threw at module load) → entire backend `/healthz` 500, non-attachment routes also dark | mitigate | D-19 lazy init: `getStorage()` defers env validation + `S3Client` construction to first method call. Non-attachment routes are unaffected by missing storage env; only attachment upload/download paths surface `storage.unavailable` (502). Hotfix `fix/22-storage-lazy-and-attachments-grants`. |

---

## 4. Chunk breakdown

Target **300-450 LOC per chunk including tests**, hard ceiling 800. Each chunk lands one RED commit then one GREEN commit (per `feedback_workflow.md` / PLAN-21 precedent).

> **Prototype JSX quote bank (pre-extracted; orchestrator pastes verbatim into chunk briefs):**
> - **Create dropzone** — `docs/design-prototype/screen-voc-create.jsx:146-194` (FieldLabel "첨부", `dropzone-compact`, multi-file `<input>`, AttachmentRow rendering, max-25MB copy).
> - **AttachmentRow** — `docs/design-prototype/screen-voc-create.jsx:285-340` (file icon mapping, oversize state, remove button, `formatFileSize`).
> - **Triage / detail composers** — prototypes do not show explicit Attach UI; reuse the same `dropzone-compact` pattern below each composer body (`screen-voc-triage.jsx` ComposerSection · `screen-voc-detail-reporter.jsx` Reply composer). Korean copy verbatim from create: `파일을 드래그하거나 클릭해서 추가` · `최대 25MB · 다중 선택`.

---

### C1 — BE storage abstraction + MinIO dev infra + ADR-0011 amendment

**Files touched (estimated LOC):**
- `apps/backend/src/lib/storage/index.ts` (interface — ~25)
- `apps/backend/src/lib/storage/s3-compat.ts` (impl using `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`) (~150)
- `apps/backend/src/lib/storage/factory.ts` (singleton, env parsing, redaction) (~60)
- `apps/backend/src/lib/storage/__tests__/s3-compat.integration.test.ts` (testcontainers MinIO OR aws-sdk-client-mock — pick mock for CI speed) (~140)
- `apps/backend/src/lib/storage/__tests__/factory.unit.test.ts` (~50)
- `apps/backend/src/cli/storage-bootstrap.ts` (idempotent bucket create) (~60)
- `apps/backend/package.json` (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `aws-sdk-client-mock`)
- `docker-compose.dev.yml` (add `minio` service + `minio_data` volume + bootstrap script ref) (~30)
- `.env.example` (`STORAGE_S3_*` block) (~12)
- `.gitignore` (`minio_data/`) (~1)
- `docs/adr/0011-rich-content-editor-and-attachment-storage.md` amendment note re OQ-1 (~10)

**LOC: ~540** → split if necessary into C1a (interface + impl + tests) and C1b (CLI + compose + env + ADR). Default: keep as one chunk by trimming integration test coverage to mock-driven happy + error paths and deferring testcontainers to C4 (where streaming GET makes a real container valuable).

**Acceptance (test names):**
- `s3-compat > put() streams via lib-storage Upload and returns storage_key`
- `s3-compat > get() returns a readable stream`
- `s3-compat > delete() is idempotent on missing key`
- `s3-compat > exists() returns false for missing key, true after put`
- `s3-compat > put() surfaces storage.unavailable for network errors`
- `factory > parses STORAGE_S3_* env and returns singleton`
- `factory > redacts STORAGE_S3_SECRET_ACCESS_KEY from any toString/log output`
- `storage-bootstrap CLI > creates bucket if missing; no-op if present`

**Dependencies:** none. Wave 1.

**Pattern reference:** existing singleton factory pattern in `apps/backend/src/db/pool.ts` (if present) or `lib/log` for env-read-once helpers; reuse `lib/errors.ts` `HttpError` for raising `storage.unavailable`.

---

### C2 — BE migration `0012_slice3_attachment_storage_activation.sql` + drift tests

**Files touched (LOC):**
- `apps/backend/migrations/0012_slice3_attachment_storage_activation.sql` (~80)
- `apps/backend/src/db/__tests__/schema-drift-attachments.integration.test.ts` (`information_schema` assertions: column rename, new check, `linked_at` exists, `storage_key` UNIQUE) (~120)
- `apps/backend/src/modules/voc/repo.ts` updates (column references `storage_uri` → `storage_key`) (~20)
- existing voc tests touching `storage_uri` (search & update; ~30 lines across files)

**LOC: ~250**

**SQL details:**
- `ALTER TABLE voc.voc_attachments RENAME COLUMN storage_uri TO storage_key;`
- `ALTER TABLE voc.voc_attachments ADD CONSTRAINT voc_attachments_storage_key_unique UNIQUE (storage_key);`
- `ALTER TABLE voc.voc_attachments DROP CONSTRAINT voc_attachments_subject_xor;` then `ADD CONSTRAINT voc_attachments_subject_not_both CHECK (NOT (voc_id IS NOT NULL AND comment_id IS NOT NULL));` (Note: existing 0010 XOR allows neither already per spec; we are only **relaxing** the "exactly one" to "at most one".)
- `ALTER TABLE voc.voc_attachments ADD COLUMN linked_at timestamptz NULL;`
- Verify `uploaded_by_actor_id uuid NOT NULL` (it already is in 0010 — assert no-op).

**Acceptance:**
- `migration drift > storage_key column exists and is UNIQUE NOT NULL`
- `migration drift > linked_at column exists, nullable, timestamptz`
- `migration drift > subject xor relaxed: row with both NULLs is permitted`
- `migration drift > subject xor still rejects voc_id IS NOT NULL AND comment_id IS NOT NULL`
- Existing voc create/edit integration tests still pass (no regression).

**Dependencies:** none structurally, but logically must merge before C3 (the upload service references `storage_key`). Wave 1 alongside C1.

---

### C3 — BE `POST /attachments` (validation + upload-then-INSERT + idempotency + rate-limit + audit)

**Files touched (LOC):**
- `apps/backend/src/modules/attachments/index.ts` (~30)
- `apps/backend/src/modules/attachments/routes.ts` (Fastify route, `@fastify/multipart` config) (~90)
- `apps/backend/src/modules/attachments/service.ts` (validation, sanitization, upload-then-insert, error mapping) (~140)
- `apps/backend/src/modules/attachments/repo.ts` (`INSERT … RETURNING …`) (~30)
- `apps/backend/src/modules/attachments/mime-allowlist.ts` (D-07 list as a `readonly Set<string>`) (~20)
- `apps/backend/src/modules/attachments/filename-sanitize.ts` (D-05) (~30)
- `apps/backend/src/modules/attachments/__tests__/post-attachments.integration.test.ts` (~220)
- `apps/backend/src/server.ts` (register module + multipart plugin with `limits.fileSize = 25MB`) (~10)
- `packages/shared/src/errors/codes.ts` (+ `storage.unavailable`) (~2)
- `packages/shared/src/errors/__tests__/codes.test.ts` update (~5)
- `apps/backend/src/lib/errors.ts` `STATUS_BY_PREFIX` (+ `storage.` → 502 per OQ-2 default) (~2)
- `apps/backend/src/lib/__tests__/errors.test.ts` (+ row) (~3)
- `packages/shared/src/audit/attachments.ts` (new `attachment_uploaded` schema) (~40)
- `packages/shared/src/audit/__tests__/attachments-audit-schemas.test.ts` (~50)

**LOC: ~672** → **SPLIT** into C3a + C3b.

#### C3a — endpoint skeleton + validation + audit vocab + error code (no upload yet)
- routes.ts, mime-allowlist, filename-sanitize, error code/status registration, audit schema, validation-only tests (size cap via multipart limit, MIME allowlist, filename sanitization, Idempotency-Key required, rate-limit). Returns `501 not_implemented.todo` for the happy-path branch so RED tests fail loudly.
- **LOC: ~360**
- Acceptance: `POST /attachments > 422 attachment.too_large at 25MB+1`, `> 422 attachment.unsupported_type for application/zip`, `> 422 validation.failed on traversal filename`, `> 422 validation.malformed_idempotency_key`, `> 429 rate_limited.actor at 21st req/min`, `> attachment_uploaded audit schema rejects detail with filename field`, `> errors.test: storage.unavailable → 502`.

#### C3b — upload-then-insert happy path + idempotency replay + storage failure → `storage.unavailable`
- service.ts, repo.ts, full happy path, idempotency replay test (same key → 200 with cached envelope), storage failure simulation (mock `storage.put` to throw), best-effort cleanup test (INSERT failure → `storage.delete(key)` called).
- **LOC: ~310**
- Acceptance: `POST /attachments > 201 envelope shape matches @fops/shared schema`, `> uploads to storage BEFORE inserting row`, `> idempotency replay returns cached 201`, `> storage.put failure → 502 storage.unavailable, no row inserted`, `> INSERT failure triggers storage.delete cleanup`, `> emits attachment_uploaded audit row without filename`.

**Dependencies:** C1 (storage), C2 (column rename). Wave 2.

**Pattern reference:** `apps/backend/src/modules/voc/routes.ts` (idempotency frame, `Idempotency-Key` validation), `apps/backend/src/lib/rate-limit-pg-store.ts`, `apps/backend/src/modules/core/audit/audit-service.ts`.

---

### C4 — BE `GET /attachments/:id/download` (streaming + entitlement) + `purge_unlinked_attachments` job

**Files touched (LOC):**
- `apps/backend/src/modules/attachments/routes.ts` (add GET handler) (~70)
- `apps/backend/src/modules/attachments/service.ts` (entitlement resolve) (~50)
- `apps/backend/src/modules/attachments/rfc5987.ts` (filename encoder) (~25) + unit test (~30)
- `apps/backend/src/modules/attachments/__tests__/get-attachments-download.integration.test.ts` (~200)
- `apps/backend/src/modules/core/jobs/purge-unlinked-attachments.ts` (~80)
- `apps/backend/src/modules/core/jobs/__tests__/purge-unlinked-attachments.integration.test.ts` (time-warp via injected clock; insert unlinked rows aged 24h + 1h; assert deletion + storage.delete called) (~150)
- `apps/backend/src/modules/core/jobs/index.ts` (register hourly schedule) (~5)

**LOC: ~610** → **SPLIT** into C4a (download) and C4b (purge job).

#### C4a — `GET /attachments/:id/download`
- **LOC: ~370**
- Acceptance: `> 200 streams body with Content-Disposition attachment;filename*=UTF-8''…`, `> RFC 5987 encodes 한국어 파일.pdf`, `> 403 cross-workspace`, `> 404 unknown id`, `> 403 linked attachment when caller cannot view parent VOC`, `> 200 unlinked attachment when caller is original uploader`, `> 502 storage.unavailable on get() error`, `> response is a stream (no buffering — assert no Content-Length precomputed from full read)`.

#### C4b — `purge_unlinked_attachments` hourly job
- **LOC: ~240**
- Acceptance: `> deletes rows where voc_id IS NULL AND comment_id IS NULL AND created_at < now() - 24h`, `> calls storage.delete for each purged key`, `> leaves linked rows untouched`, `> survives storage.delete failure (logs, continues, does not crash job)`, `> logs {count, bytes_reclaimed}`, `> registered in core jobs index with hourly cron`.

**Dependencies:** C3. Wave 3.

---

### C5 — Shared schema + FE API client

**Files touched (LOC):**
- `packages/shared/src/vocs/attachment.ts` (zod schema for POST envelope + `AttachmentRef` type — confirm against existing `AttachmentRef` usage in create/reporter-reply/etc.) (~50)
- `packages/shared/src/vocs/index.ts` re-export (~2)
- `packages/shared/src/vocs/__tests__/attachment.test.ts` (~60)
- `apps/frontend/src/lib/api/attachments.ts` (multipart `FormData` upload, idempotency key from `useIdempotencyKey`, error mapping) (~80)
- `apps/frontend/src/lib/api/__tests__/attachments.test.ts` (msw-based) (~100)
- `apps/frontend/src/lib/api/errorMapper.ts` (+ `storage.unavailable` → `tone: 'error'`, Korean copy from D-09; remove `attachment.unsupported_pending_storage_slice` row) (~5)
- `apps/frontend/src/lib/api/index.ts` re-export (~2)

**LOC: ~300**

**Acceptance:**
- `attachment schema > parses 201 envelope`
- `attachment schema > rejects extra fields`
- `attachments api > POSTs multipart with Idempotency-Key header`
- `attachments api > maps 422 attachment.too_large to typed error`
- `attachments api > maps 502 storage.unavailable to typed error`
- `errorMapper > storage.unavailable → Korean toast '파일 저장소에 접근할 수 없습니다…'`
- `errorMapper > attachment.unsupported_pending_storage_slice row removed`

**Dependencies:** C3 (envelope shape stable). Wave 3.

---

### C6 — FE retroactive wire: VOC Create + EditDescriptionModal

**Files touched (LOC):**
- `apps/frontend/src/features/voc/components/create/AttachmentDropzone.tsx` (replace disabled state with active multi-file upload; per-file state machine `pending → uploading → uploaded(serverId) | error(code)`; per-file row error display) (~140)
- `apps/frontend/src/features/voc/components/create/VocCreateScreen.tsx` (collect `serverAttachmentId`s on submit; pass `attachment_ids[]` to POST `/vocs` body; block submit while any attachment is `uploading`) (~30)
- `apps/frontend/src/features/voc/components/detail/EditDescriptionModal.tsx` (wire Attach button → upload → include `attachment_ids[]` in PATCH body) (~50)
- `apps/frontend/src/features/voc/components/create/__tests__/AttachmentDropzone.test.tsx` (upload happy path, too_large per-row, unsupported_type per-row, storage.unavailable toast, submit blocked while uploading) (~170)
- `apps/frontend/src/features/voc/components/detail/__tests__/EditDescriptionModal.attachments.test.tsx` (~80)
- Spec doc tick: `docs/frontend/specs/voc.md` §4.4 row — remove "Slice 3 only" note on the error code line (~2)

**LOC: ~470** → tight. If LOC creeps, split EditDescriptionModal tests into C6b.

**Prototype quote (verbatim):** Create dropzone JSX from `docs/design-prototype/screen-voc-create.jsx:146-194` and AttachmentRow from `:285-340`. Korean copy: `파일을 드래그하거나 클릭해서 추가` · `최대 25MB · 다중 선택` · `N개 첨부 · 총 X MB`.

**Acceptance:**
- `AttachmentDropzone > drops a file → POST /attachments → row shows uploaded state with check icon`
- `AttachmentDropzone > 26MB file → row shows attachment.too_large copy; not added to attachment_ids[]`
- `AttachmentDropzone > unsupported type → row shows attachment.unsupported_type copy`
- `AttachmentDropzone > storage failure → toast 'tone:error' with D-09 Korean string`
- `VocCreateScreen > submit disabled while any row is uploading`
- `VocCreateScreen > POST /vocs body includes attachment_ids[] from successful uploads`
- `EditDescriptionModal > Attach → upload → PATCH /vocs/:id body includes attachment_ids[]`
- No FE test references `attachment.unsupported_pending_storage_slice` anymore.

**Dependencies:** C5. Wave 4.

---

### C7 — FE retroactive wire: Triage composers (PublicUpdate / InternalComment / ReporterReply)

**Files touched (LOC):**
- `apps/frontend/src/features/voc/components/detail/PublicUpdateComposer.tsx` (~50)
- `apps/frontend/src/features/voc/components/detail/InternalCommentComposer.tsx` (~50)
- `apps/frontend/src/features/voc/components/detail/ReporterReplyComposer.tsx` (~50)
- Shared composer dropzone subcomponent `apps/frontend/src/features/voc/components/detail/ComposerAttachmentDropzone.tsx` (extracted from C6 dropzone) (~80)
- `apps/frontend/src/features/voc/components/detail/__tests__/PublicUpdateComposer.attachments.test.tsx` (~70)
- `apps/frontend/src/features/voc/components/detail/__tests__/InternalCommentComposer.attachments.test.tsx` (~70)
- `apps/frontend/src/features/voc/components/detail/__tests__/ReporterReplyComposer.attachments.test.tsx` (~70)

**LOC: ~440**

**Note on BE coupling:** remove the BE-side `attachment.unsupported_pending_storage_slice` raises in `apps/backend/src/modules/voc/service.ts:116, 743` and `conversation-service.ts:399, 409`; update the corresponding integration tests (`create-voc.integration.test.ts:659`, `post-reporter-reply.integration.test.ts:207/238`, `patch-description.integration.test.ts:672`) to instead verify that valid `attachment_ids[]` from real uploads succeed. **Move this BE cleanup into C7** (it is the same retroactive wire-up).

That adds ~40 LOC of BE production change + ~80 LOC of test churn → **C7 LOC ≈ 560** → **SPLIT** into C7a (FE composers + shared dropzone) and C7b (BE service cleanup + retire `attachment.unsupported_pending_storage_slice` from `packages/shared/src/errors/codes.ts` + tests).

#### C7a — FE composers (~440 LOC)
#### C7b — BE cleanup (~180 LOC): remove the error code (deprecate-then-delete — leave in codes.ts with a `@deprecated` JSDoc for one Slice if you prefer, but spec says replaced; safe to delete now since #22 is the replacement); update service.ts / conversation-service.ts; update integration tests; update `voc.md` §spec table to drop the "Slice 3 only" line.

**Acceptance:**
- Each composer test asserts: drop file → upload → submit body contains `attachment_ids[]`.
- BE tests: `create-voc > attachments with valid attachment_ids → 201`, `post-reporter-reply > with attachment_ids → 200`, `patch-description > with attachment_ids → 200`.
- `grep -r "unsupported_pending_storage_slice" {src,packages,apps}` returns 0 matches (gate test).

**Dependencies:** C5, C6 (shared dropzone). Wave 5.

---

### C8 — RichEditor TipTap Attach toolbar button

**Files touched (LOC):**
- `packages/ui/src/rich-content/RichEditor.tsx` (Attach toolbar button + file picker handler; per-mode visibility default = always-on per OQ-3) (~60)
- `packages/ui/src/rich-content/toolbar/AttachButton.tsx` (new component) (~70)
- `packages/ui/src/rich-content/__tests__/AttachButton.test.tsx` (~120)
- `packages/ui/src/rich-content/__tests__/RichEditor.attach-integration.test.tsx` (file pick → injected upload fn → AttachmentRef node inserted with `attachment_id` attr) (~120)
- `apps/frontend/src/features/voc/components/create/rich-toolbar-voc-description.ts` — wire `onAttach: (file) => attachmentsApi.upload(file)` (~10)
- Same wire-up in the three other rich-toolbars (`apps/frontend/src/features/voc/components/detail/rich-toolbars/*.ts`) (~30)

**LOC: ~410**

**Acceptance:**
- `AttachButton > renders with attach icon and a11y label '첨부 파일 추가'`
- `AttachButton > opens file picker on click; Enter/Space activates`
- `RichEditor > onAttach success inserts AttachmentRef node at cursor with {attachment_id, name, size_bytes, mime_type}`
- `RichEditor > onAttach failure shows toast (passthrough error)`
- `RichEditor > AttachButton appears in all 4 surface modes (per OQ-3 default)`

**Dependencies:** C5. Wave 4 (parallel with C6 — no file overlap).

---

### C9 — #41 Client-side render-time sanitizer + shared allowlist constant

**Files touched (LOC):**
- `packages/shared/src/rich-content/allowlist.ts` (new — extract the canonical surface allowlist into shared; mirrors `apps/backend/src/lib/rich-content/surface-allowlists.ts` shape) (~120)
- `packages/shared/src/rich-content/index.ts` (~3)
- `packages/shared/src/rich-content/__tests__/allowlist.test.ts` (~40)
- `apps/backend/src/lib/rich-content/surface-allowlists.ts` (refactor to import from shared; existing AttrSchema layering preserved) (~30 changed)
- `apps/backend/src/lib/rich-content/__tests__/drift-vs-shared.test.ts` (assert `SURFACE_ALLOWLISTS === SHARED_ALLOWLISTS` shape parity) (~40)
- `packages/ui/src/rich-content/sanitizeClient.ts` (walker over TipTap JSON; drops disallowed nodes/marks/attrs; coerces `href` schemes; strips `on*` attrs; refuses `javascript:`, `data:` (except `data:image/...` allowed for inline image nodes if your existing allowlist permits — confirm), `vbscript:`) (~150)
- `packages/ui/src/rich-content/RichContentRenderer.tsx` (run sanitizer on input doc before TipTap render) (~15)
- `packages/ui/src/rich-content/__tests__/sanitizeClient.test.ts` (hostile JSON corpus: script node, `onerror` img, `javascript:` href, mismatched marks, deep nesting, prototype-pollution-shaped keys) (~180)

**LOC: ~578** → tight. If over, split allowlist extraction into C9a and sanitizer into C9b.

**Acceptance:**
- `shared allowlist > exports SURFACES, node types, mark types, AttrSchema per surface`
- `BE drift test > backend SURFACE_ALLOWLISTS matches SHARED_ALLOWLISTS structurally`
- `sanitizeClient > strips script node`
- `sanitizeClient > rewrites javascript: href to empty string`
- `sanitizeClient > strips onerror attr from img`
- `sanitizeClient > strips data: hrefs (except inline image data URIs if allowlist permits)`
- `sanitizeClient > preserves valid headings, paragraphs, marks, AttachmentRef nodes`
- `RichContentRenderer > sanitizes before rendering; hostile input renders as empty`

**Dependencies:** none structurally — runs parallel with C3+. But to avoid drift conflicts with C3a's audit-schema additions in `packages/shared`, schedule **Wave 4** (with C6/C8) which writes to different shared files.

**Decision on impl:** **hand-rolled walker** over TipTap JSON, not `isomorphic-dompurify`. Two reasons: (a) we already own the BE allowlist as a JSON-shape spec, the walker is a few hundred lines and pure; (b) DOMPurify operates on serialized HTML — we would have to render TipTap JSON to HTML first, sanitize, then re-parse. Walker is faster and the test surface is the JSON we already validate on the server.

---

### C10 — #42 External anchor `rel`/`target` decoration

**Files touched (LOC):**
- `packages/ui/src/rich-content/RichContentRenderer.tsx` (extend the `link` mark renderHTML; OR — if mark renderHTML is on the TipTap extension — patch the extension config) (~25)
- `packages/ui/src/rich-content/__tests__/externalLink.test.tsx` (cases: `https://example.com` → `rel='noopener noreferrer' target='_blank'`; `http://example.com` → same; `/foo` → unchanged; `#anchor` → unchanged; `https://{window.location.origin}/foo` → unchanged in browser-context test; malformed `javascript:` → caught by sanitizer per C9, but assert renderer also drops `target` to avoid tabnab in the impossible case the sanitizer ever regresses — belt-and-suspenders) (~80)

**LOC: ~105**

**Acceptance:**
- `externalLink > external https → rel + target set`
- `externalLink > external http → rel + target set`
- `externalLink > root-relative → no rel/target`
- `externalLink > hash → no rel/target`
- `externalLink > same-origin absolute → no rel/target`

**Dependencies:** C9 (sanitizer must already block `javascript:` before this is meaningful). Wave 5.

---

## 5. Cross-chunk verification

### Wave structure (file-ownership-safe parallelism)

| Wave | Chunks | Files conflict check |
|------|--------|----------------------|
| 1 | C1 (`lib/storage/*`, infra) · C2 (`migrations/*`, `voc/repo.ts`) | no overlap |
| 2 | C3a + C3b (`modules/attachments/*`, `shared/errors`, `shared/audit`) | sequential within wave |
| 3 | C4a · C4b · C5 (FE api + shared/vocs) | no overlap; C5 only touches `shared/vocs/*` and `apps/frontend/src/lib/api/*` |
| 4 | C6 (`features/voc/components/create`, `detail/EditDescriptionModal`) · C8 (`packages/ui/src/rich-content/RichEditor*`) · C9 (`packages/shared/src/rich-content/*` + `packages/ui/src/rich-content/sanitizeClient*`) | C8 and C9 both write to `packages/ui/src/rich-content/`; ensure C8 only edits `RichEditor.tsx`/`toolbar/`, C9 only adds `sanitizeClient.ts` and touches `RichContentRenderer.tsx`. **C9 must merge before C8's RichEditor edit imports `sanitizeClient`** — re-sequence C9 before C8 in wave 4. |
| 5 | C7a + C7b (FE composers + BE cleanup) · C10 (`RichContentRenderer.tsx` link mark) | C10 touches the same `RichContentRenderer.tsx` C9 just modified — schedule C10 strictly after C9, but C7 has no file overlap with C10. Run C7 + C10 parallel; C10 is a small append-only patch. |

### Test count targets (deltas vs baseline)

| Layer | Before | Target after | Delta |
|-------|--------|--------------|-------|
| BE | 558 | ≥ 620 | +62 |
| Shared | 236 | ≥ 258 | +22 |
| UI | 404 | ≥ 425 | +21 |
| FE | 218 | ≥ 245 | +27 |

### Manual smoke checklist (post-merge of full chain)

1. `docker compose -f docker-compose.dev.yml up -d minio` → `http://localhost:9001` console reachable.
2. `pnpm --filter @fops/backend run storage:bootstrap` → bucket exists in MinIO console.
3. `/vocs?action=create` → drop a 1 MB PNG → row shows uploaded → submit → VOC detail shows attachment link → click link → file downloads with original Korean filename intact.
4. Drop a 26 MB file → row error `첨부 파일이 너무 큽니다` (or whatever the existing copy is).
5. Drop a `.zip` → row error `지원하지 않는 파일 형식입니다`.
6. Open EditDescriptionModal on a pre-triage VOC → Attach → upload → save → attachment appears.
7. Triage Console → PublicUpdate composer → drop file → Send → public timeline shows attachment.
8. Same for InternalComment + ReporterReply.
9. RichEditor on voc-description → Attach toolbar button → file picker → AttachmentRef node renders inline.
10. View a VOC with rich-content containing a hostile node (manually craft via test fixture); confirm renderer drops it silently.
11. External link in description → renders with `rel="noopener noreferrer" target="_blank"` (inspect via devtools).
12. Wait 24h (or invoke purge job via dev CLI) → unlinked attachment from a test run is gone from DB + storage.

### Pixel-diff CP2

**Not required.** No new pages; composers, Create form, and Edit modal are already baselined in PLAN-21 / earlier. The only visible new affordance is the AttachmentDropzone activating from disabled → active, which is intra-component state, not layout. CP2 baseline diffs would re-trigger on inevitable typography shifts; skip per "pixel-diff CP2 not required" in user brief.

---

## 6. Out of scope / follow-ups (enumerate; do not file)

1. **File-magic / content-sniff MIME validation** — declared MIME is trusted in v1 (D-06, T-04 accept). Follow-up: integrate `file-type` package or libmagic FFI.
2. **Pre-signed URLs** for high-volume reads (Survey CSV, large Task attachments). Currently server-proxied per ADR-0011; follow-up needs its own ADR.
3. **Antivirus / malware scan** pre-storage (ClamAV sidecar or vendor scan API). Out of MVP threat model.
4. **Image thumbnail generation** for inline image previews in lists.
5. **Multipart resumable uploads** for >25 MB files (would also revisit the cap).
6. **EXIF stripping** on uploaded images (privacy follow-up).
7. **Per-MIME size policy** (e.g. 5 MB cap on images, 25 MB on PDFs).
8. **Attachment archive UI** — soft-archive columns landed in 0011 but no UI to archive/restore.
9. **Local FS storage backend** for offline dev (defer per OQ-1 default).
10. **CDN / edge cache** for download endpoint.
11. **Per-workspace storage quotas + dashboards.**
12. **`AttachmentRef` node hydration on render** — currently the node carries `attachment_id`; renderer fetches metadata. Follow-up: consider embedding `name`/`size_bytes` in the node attrs for offline rendering.

---

## 7. Goal-backward check

For each #22 acceptance bullet (and the bundled #41/#42 outcomes), the chunk that delivers it:

| Goal truth (user-observable) | Delivering chunk |
|------------------------------|------------------|
| `POST /attachments` returns 201 envelope `{ id, name, size_bytes, mime_type, uploaded_by_actor_id, created_at }` | C3b |
| 25 MB cap returns `attachment.too_large` (422) | C3a |
| MIME allowlist returns `attachment.unsupported_type` (422) | C3a |
| Filename traversal sanitized | C3a |
| Idempotency-Key replay returns cached envelope | C3b |
| Rate limit `rate_limited.actor` at 21/min | C3a |
| Storage outage returns `storage.unavailable` (502) | C3b |
| Upload happens before INSERT; INSERT failure triggers storage cleanup | C3b |
| Audit event `attachment_uploaded` emitted without filename | C3b |
| `GET /attachments/:id/download` streams with RFC 5987 disposition | C4a |
| Cross-workspace download blocked | C4a |
| Unlinked attachment owner can still download | C4a |
| Hourly purge job removes unlinked attachments >24h | C4b |
| `voc_attachments` column rename + linked_at + relaxed XOR | C2 |
| MinIO dev infra runs via `docker compose` | C1 |
| `STORAGE_S3_*` env config swap-ready for AWS/R2 | C1 (single env-driven impl) |
| Shared attachment schema + FE API client | C5 |
| VOC Create dropzone uploads + submits `attachment_ids[]` | C6 |
| EditDescriptionModal uploads + PATCHes `attachment_ids[]` | C6 |
| Three Triage composers upload + submit `attachment_ids[]` | C7a |
| `attachment.unsupported_pending_storage_slice` retired from BE + shared + tests | C7b |
| RichEditor Attach toolbar button inserts AttachmentRef | C8 |
| #41: client sanitizer blocks script nodes, `javascript:` hrefs, `onerror` img | C9 |
| #41: BE + client share one allowlist constant with drift test | C9 |
| #42: external `<a>` gets `rel="noopener noreferrer" target="_blank"` | C10 |
| #42: internal links (relative, hash, same-origin) unchanged | C10 |

Every spec acceptance bullet has a named delivering chunk. No orphan requirements.

---

## Chunk count & LOC summary

| Chunk | LOC | Wave |
|-------|-----|------|
| C1 | ~540 | 1 |
| C2 | ~250 | 1 |
| C3a | ~360 | 2 |
| C3b | ~310 | 2 |
| C4a | ~370 | 3 |
| C4b | ~240 | 3 |
| C5 | ~300 | 3 |
| C6 | ~470 | 4 |
| C7a | ~440 | 5 |
| C7b | ~180 | 5 |
| C8 | ~410 | 4 |
| C9 | ~578 | 4 (before C8 if RichEditor will import sanitizeClient) |
| C10 | ~105 | 5 |
| **Total** | **~4 553** | 5 waves |

**13 chunks** (C3 and C4 and C7 each split into two). All within the 300-450 target except C1 (~540), C6 (~470), C9 (~578) which sit at or just past the soft ceiling and may need a final trim during execution; none exceed the 800 hard ceiling. Orchestrator should be prepared to split C1 / C6 / C9 in-flight if the executor's first RED commit already approaches 400 LOC.
