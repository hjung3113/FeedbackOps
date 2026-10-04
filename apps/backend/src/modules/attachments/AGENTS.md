# Attachments Module Agent Guide

## Ownership

Attachments owns the upload (`POST /attachments`) and download (`GET /attachments/:id/download`) commands, the storage seam, the filename and MIME rules, and the link step that attaches an uploaded file to a VOC or VOC comment (`linkAttachments`). It writes only `voc.voc_attachments`.

It is the implementation of Core's attachment governance (`docs/implementation/02-domain-module-boundaries.md`), not a second owner. Storage shape and server-proxied transfer are ADR-0011. VOC owns the read projections of its own attachment links (`voc/repo-read.ts`).

## Invariants

- The storage `put` runs before the DB INSERT, so no row ever points at missing bytes. If the INSERT fails, the service makes a best-effort `storage.delete` and rethrows the INSERT error (`service.ts`).
- The `attachment_uploaded` audit detail schema is `.strict()` and must never carry the filename: filenames can hold PII and the audit log is broadly readable (`packages/shared/src/audit/attachments.ts`).
- The MIME allowlist (`mime-allowlist.ts`) is a closed set checked against the declared Content-Type; anything else is `attachment.unsupported_type`. The size cap is `MAX_ATTACHMENT_BYTES` (25 MB).
- Every filename passes `sanitizeFilename` (strips `/`, `\`, and control characters; clamps to 255 UTF-8 bytes; an empty result is rejected) before it enters the storage key `{workspace_id}/{uuid}/{filename}`.
- `voc_attachments` has no `workspace_id` column. The storage-key prefix is the workspace gate on download, and a cross-workspace id returns 404, not 403.
- Download entitlement is the parent VOC's: `getVocDetail` must return `kind: 'full'` (comment attachments resolve to their parent VOC). An unlinked upload is readable only by its uploader.
- `linkAttachments` runs in the parent's transaction and links only rows that are unlinked, not archived, and uploaded by the caller; any miss throws `LinkAttachmentsRejected` and rolls the parent back.
- `Content-Disposition` carries an ASCII fallback plus RFC 5987 `filename*` (`rfc5987.ts`) so non-ASCII names survive.

## Cross-System Rules

- Other modules use the barrel (`index.ts`), never `repo.ts` (`pnpm check:boundaries` rejects cross-module `repo*.js` imports).
- Unlinked rows older than 24 hours are reclaimed by the hourly `core.attachments_purge` job (`modules/core/jobs/purge-unlinked-attachments.ts`), not by this module.

## Verification

- Test a failing INSERT after a successful put, the audit detail rejecting `filename`, MIME and filename rejection, cross-workspace 404, download entitlement for linked and unlinked rows, and the link guard predicates when touched.
