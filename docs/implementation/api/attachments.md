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

`GET /attachments/:id/download` requires an authenticated Actor in the
workspace and streams the authorized attachment with its MIME type, size, and
filename headers.
