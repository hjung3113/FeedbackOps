# Rich Content Editor (TipTap) and attachment storage

FeedbackOps has four rich-content surfaces (`VOC description`, `Reporter Reply`, `Public Update`, `Internal Comment`) that share one editor foundation per CONTEXT.md and `docs/design/15-data-contracts.md`. Each surface restricts toolbar actions and rendering separately. This ADR locks the editor choice, the attachment storage shape, and the Rich Table decision left open by the data contracts.

## Editor: TipTap

The frontend uses **TipTap** (ProseMirror-based) as the shared editor foundation. We pick TipTap because:

- ProseMirror is the only widely-used editor core with proven Korean IME handling (composition events, deletion across composed characters). Lexical and Slate have outstanding IME edge cases reported by Korean teams.
- The extension ecosystem (`@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-mention`, etc.) covers our planned features without forking.
- TipTap documents serialize to structured JSON, which matches `docs/implementation/01-coding-conventions.md`'s "Store rich content in structured editor documents or sanitized HTML approved by the backend contract." We store the JSON, not HTML.

Backend persistence is **TipTap JSON in a `jsonb` column**; the schema is versioned via a `schema_version` field inside the document so a future TipTap upgrade does not require a data migration day-one. Sanitization happens server-side using `@tiptap/html` to reject unknown nodes, attributes, and inline-style payloads.

The editor configuration lives in `packages/ui/src/rich-content/` so all four surfaces import the same base and pass a `mode: 'voc' | 'reporter_reply' | 'public_update' | 'internal_comment'` to gate toolbar actions, embeds, and rendering — matching the relationship in CONTEXT.md: "Each rich-content surface may restrict toolbar actions, embeds, and rendering according to visibility and safety needs."

## Inline Attachments and storage abstraction

Inline images (`Inline Attachment` in CONTEXT.md) and file attachments share one storage path. The backend exposes an `AttachmentStorage` interface in `apps/backend/src/modules/attachments`:

```text
AttachmentStorage
- put(key, stream, contentType, byteLength): write
- get(key): stream
- head(key): metadata
- delete(key): remove
```

Two implementations selected by `ATTACHMENT_STORAGE` env var:

- `LocalFsAttachmentStorage` — for local dev. Writes under `./.dev-data/attachments/<workspace_id>/<uuid>`. Fast, zero infra.
- `S3CompatibleAttachmentStorage` — for staging and production. Uses `@aws-sdk/client-s3` against an S3-compatible endpoint (AWS S3, internal MinIO, or any other compliant store). Bucket and endpoint set by `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

The interface lets dev/CI run without any S3 dependency while production swaps in MinIO or AWS S3 by env var alone. Storing files in Postgres (`bytea` / large objects) was rejected because backups and replication grow uncontrollably with attachment volume.

## Upload and download flow: server-proxied

All uploads and downloads go through the backend. There are no pre-signed URLs in MVP.

`docs/implementation/01-coding-conventions.md` requires: "Enforce visibility on every attachment and rich-content render path." Pre-signed URLs hand the storage layer a token whose lifetime, scope, and audit trail are owned by the storage provider, not by FeedbackOps. With server-proxied transfer:

- Every read passes through application-level permission checks: `Reporter Summary` visibility, Internal Comment scope, Sensitive Permission gating for restricted Findings.
- Every read can emit an audit row when the spec requires it (e.g. Sensitive Permission viewing).
- A future ADR can introduce pre-signed URLs for a specific high-volume path (Survey CSV export, large Task attachments) without changing the default.

The trade-off is bandwidth through the backend. We accept this for MVP given internal workforce-sized load.

## Rich Table

`Rich Table` stays **out of MVP** as the data contract already framed it ("spike-gated"). The editor blocks the table toolbar action and rejects paste content that resolves to table nodes; the rejection UI directs the user to upload the spreadsheet as a file attachment instead. Read-rendering of table nodes that already exist in stored documents (none, in practice, for greenfield MVP) is allowed.

Bringing Rich Table in later means enabling the TipTap table extension, adding size limits (rows × columns × cell text length), and deciding the public-facing surface restrictions — that work warrants a new ADR.

## What this ADR locks

- TipTap is the single editor foundation; documents are stored as TipTap JSON in `jsonb`.
- One `AttachmentStorage` abstraction with two implementations (local FS for dev, S3-compatible for prod), swapped by env var.
- All attachment reads and writes go through the backend; no pre-signed URLs in MVP.
- Rich Table is excluded from MVP creation flows; users upload spreadsheets as attachments.

## Reopening

Switching editors, dropping the storage abstraction, introducing pre-signed URLs, or enabling Rich Table each warrants a new ADR with a migration story for existing rich-content documents and stored attachments.
