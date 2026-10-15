# Attachments

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Attachments

```text
POST /attachments
GET /attachments/:id/download
```

`POST /attachments` requires an authenticated Actor in the workspace, an
`Idempotency-Key`, and a `multipart/form-data` file part. Uploads are limited to
25 MiB.
A malformed multipart body (no boundary, or a file part truncated after its
headers) returns 422 `validation.malformed_request`.

`GET /attachments/:id/download` requires an authenticated Actor in the
workspace and streams the authorized attachment with its MIME type, size, and
filename headers.

VOC-level attachments require full parent VOC detail access. Comment attachments
are authorized by VOC's `canReadConversationEntry` read seam, using the exact
conversation visibility rule: Public Updates for conversation readers, Internal
Comments for deny-aware triage readers, and Reporter Replies for triage readers
or the VOC Reporter's own replies. Attachments does not query conversation tables
for authorization. Unlinked uploads are downloadable only by their uploader.
Unknown or cross-workspace attachments return 404; an attachment in the workspace
whose parent entry is inaccessible or missing returns 403 `permission.denied`.

The hourly `core.attachments_purge` job reclaims unlinked uploads older than 24
hours. Candidate selection alone does not authorize deletion: each candidate is
locked and re-checked in a short transaction, then claimed using `archived_at`.
That transaction commits before storage deletion; `linkAttachments` rejects the
claim through its existing archived-row rejection and the parent command rolls
back. If a link commits first, the locked re-check skips that candidate, preserving
the parent, attachment row, and bytes. Storage-delete failures leave the claim in
place for the next run to retry. A successful storage deletion is followed by a
row deletion guarded by both the claim and the absence of a parent link. Fresh
uploads are never claimed.
