# VOC composer request, error, and timeline identity contract

## Status

Accepted 2026-08-03 for issues #266, #294, and #267.

## Context

PLAN-22 C7b established the backend request schemas for Reporter Reply, Public Update, and Internal Comment. The schemas are strict, use `attachment_ids` for uploaded attachments, and require `skip_public_update` as the Public Update discriminant. The frontend retained the retired `attachments` field and omitted that discriminant.

Composer errors had inline Callout treatments only for known reporter-facing status codes. An unmapped code such as `validation.failed` therefore had no user-visible surface. The detail envelope also includes the latest conversation entries inline while the infinite conversation query loads its first, potentially overlapping page on mount, so rendering both collections independently duplicated entries.

## Decision

Frontend request bodies conform to the canonical strict backend schemas. Reporter Reply sends `body_rich_content` and optional `attachment_ids`. Public Update's body-present path additionally sends the literal `skip_public_update: false` and `next_reporter_facing_status`. We reject relaxing the schemas or restoring the retired `attachments` field because that would reverse the PLAN-22 C7b contract and conceal producer drift instead of correcting it.

Known reporter-facing status errors keep their existing inline Callout tone and copy. Unmapped errors use an error toast containing the backend code string and message. We do not assign a default tone in `getComposerErrorTone`: doing so would erase the deliberate distinction between the amber gate-blocked state and other failures, and would turn unknown contract failures into apparently classified inline states.

Public and Internal timeline components merge paginated entries before inline entries and keep the first occurrence of each `entry.id`. This preserves the existing oldest-to-newest render order, retains genuinely older paginated entries, and keeps inline entries visible before the query resolves or when it fails. The inline collection is not discarded, and the query remains enabled so its cursor metadata and `hasNextPage` behavior continue to work.

The `skip_public_update: true` request shape remains unimplemented because the production composer has no skip entry point. Adding a hidden request path without a product interaction would be speculative behavior outside these issues.

## Consequences

Strict schema parsing now detects future frontend/backend request drift. Unknown composer failures remain diagnosable by users and operators without changing established Callout semantics. Conversation entries render once per identity while both delivery sources and pagination remain available.
