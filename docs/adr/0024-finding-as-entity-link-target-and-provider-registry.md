# Finding as entity-link target, provider registry, and the partial ADR-0023 trigger

## Status

Accepted (Slice 5: Finding From VOC). Amends ADR-0023 Section C and annotates its reopening trigger #1.

## Context

ADR-0023 locked the entity-link visibility decision table, the `hidden`/`denied` boundary, the `request_access` deferral, and the canonical Task reporter-summary contract — all for the world that existed at Slice 4.4, where the only linkable endpoint type is `voc` and creation is hard-locked to `internal_only`. ADR-0023 named three reopening triggers; Slice 5 fires the first one (*"A slice introduces a non-VOC link target (Task/Finding) with a reporter summary…"*) **partially**, because Finding is the first non-VOC link target but has **no reporter-facing summary**.

Two facts from the signed contracts shape this ADR:

- `docs/implementation/03-api-contracts.md:346` pins the VOC→Finding creation path: endpoint `POST /vocs/:id/create-finding`, relation_type **`created_finding`**, audit event `finding_created_from_voc`. The casual phrasing "evidence_of VOC→Finding" in prior handoffs was imprecise; `evidence_of` is the *separate* relation used by `POST /findings/:id/link-evidence` (03:427) to attach additional evidence to an existing Finding, and is out of scope for the Slice 5 create tracer.
- `docs/implementation/06-entity-linking-contract.md:47-58` and `docs/implementation/02-domain-module-boundaries.md:99-120` mandate an **entity-link provider registry** (`assertExists`, `getPermissionSubject`, `getReporterSummary`, `getInternalSummary`, `listExpectedLinks`). The Slice 4.1 tracer (#112) satisfied this contract for `voc` by **hard-coding** VOC resolution and `voc.read` authz throughout the entity-links service rather than building the registry abstraction. Slice 5 is the first multi-type slice, so the registry must now exist for real.

A four-persona adversarial review (`.review/SLICE-5-REVIEW-A.md`, `-B.md`, `SLICE-5-CODEX-C-DATA.out`, `-D-SECURITY.out`) drove the decisions below.

## Decision

### Section A — `created_finding`, not a renamed relation

The VOC→Finding link created by `POST /vocs/:id/create-finding` uses relation_type **`created_finding`** (the registry member already listed in `docs/design/11-entity-linking.md` VOC relations and pinned by `03:346`). No relation is renamed or dropped. The Survey `generated_finding` relation (Slice 8) and the common `evidence_of` relation (used by `link-evidence`, later) are untouched.

**Provenance vs evidence hierarchy are two distinct, non-redundant facts:**

- **Provenance** = `finding.findings.source_type` + `source_id` (direct columns, per `docs/design/15-data-contracts.md:133-134`). These are **immutable after creation** and are the canonical answer to "what was this Finding created from." They satisfy the Slice 5 exit criterion "source link survives reload."
- **Evidence hierarchy** = `core.entity_links` rows. The `created_finding` row `(source voc → target finding)` is the canonical cross-system link (per `15:151`). Detaching it (future) must **not** rewrite the immutable provenance columns. Drift between the two is a tested invariant.

### Section B — Provider registry (satisfies 06/02)

Entity-links gains a real provider registry keyed by `entity_type`. Each linkable module registers a provider implementing the `06:47-58` interface. Slice 5 registers two:

```
voc      → resolver voc.vocs(id, workspace_id, primary_managed_system_id)
           getReporterSummary: n/a (VOC has no link-summary contract — ADR-0023 §C)
           getInternalSummary: existing VOC read model
finding  → resolver finding.findings(id, workspace_id, primary_managed_system_id)
           getReporterSummary: returns UNAVAILABLE  (Section D — Finding has no reporter summary)
           getInternalSummary: Finding internal read model
```

The entity-links create/read/detach paths dispatch endpoint resolution and read-authz through the provider, replacing the hard-coded VOC branches. The VOC↔VOC `related_to` behavior locked by #112–#115 is preserved byte-for-byte (asserted by the existing `entity-links.integration.test.ts` matrix, extended — not replaced).

### Section C — Finding read/create authz capabilities

New capabilities (module-prefixed per `packages/shared/src/enums/capabilities.ts`):

- **`finding.read`** — Developer-requestable per Managed System; not sensitive. Read-authz for a `finding` endpoint = Admin (workspace) OR Developer holding `finding.read` on the finding's `primary_managed_system_id`. User and Reporter: never.
- **`finding.manage`** — create/update Findings; Developer-requestable per Managed System; not sensitive. Create-authz for `POST /vocs/:id/create-finding` = Admin OR Developer holding `finding.manage` on the target Finding's `primary_managed_system_id`.

**Create requires read on the source VOC too** (closes the Codex-D BLOCKER): a Developer may not forge a Finding from a VOC they cannot read. Creation validates, in one transaction (per `06:33-45`): source VOC exists + readable, target MS scope compatible, `finding.manage` on target MS, then writes finding + `created_finding` link + audit.

**Source-readability and the create-denial status code** (clarified after #122, applying the ADR-0023 hidden/denied boundary to the create path): "can read the source VOC" means the actor can legitimately see that VOC — **`voc.read` on its Managed System OR the actor is the VOC's reporter (ownership)** — not the `voc.read` capability alone. The denial status then follows the §A boundary:

- **Source unreadable** (actor is neither the reporter nor holds `voc.read` on the source MS) → **404 `not_found.record`** (hidden — no existence leak; e.g. a Developer with `finding.manage` on the source MS but no `voc.read`).
- **Source readable but actor lacks `finding.manage` on the target MS** → **403 `permission.denied`** (denied — the actor can acknowledge the VOC, but may not create a Finding; e.g. the **Reporter on their own VOC**, or a Developer readable on the source but scoped elsewhere for `finding.manage`).

A Reporter therefore receives 403 on their own VOC (they own it, so it is not hidden), never 404. This mirrors ADR-0023 §A: `hidden` when existence must be concealed, `denied` when it may be acknowledged but the action refused.

### Section D — ADR-0023 Section C amendment: the `finding` target row

ADR-0023 §C gains a `finding`-target row. Because `POST /entity-links` creatable visibility stays `internal_only` (Section E), and `created_finding` is always created `internal_only`, the realised decision row mirrors the VOC `internal_only` row — **after both-side readability passes** (ADR-0023 §A/§D: any unreadable endpoint ⇒ `hidden` first):

| stored \ actor | Reporter | User | Dev in-scope (both endpoints readable) | Dev out-scope | Admin |
|---|---|---|---|---|---|
| `internal_only` (finding target) | hidden | hidden | allowed | hidden | allowed |

Mixed readability (source VOC readable, target Finding not, or vice-versa) ⇒ `hidden`, never `denied` or partial metadata. `summary_visible`/`request_access` remain unreachable for a `finding` target (Section E).

### Section E — Trigger #1 fires only partially; what stays deferred

**Finding has no reporter-facing summary.** `docs/design/05-finding-insight-system.md:215` ("Reporter cannot read internal Finding details by default") and `CONTEXT.md` ("Reporter Summary must not expose Finding detail") establish this. Therefore, in Slice 5:

- `getReporterSummary(findingId)` is implemented as a provider method that **returns UNAVAILABLE** (`targetSummaryAvailable = false`); `evaluateLinkVisibility` already maps that to `hidden` — no evaluator change.
- `summary_visible` stays **unreachable** for a `finding` target; ADR-0023 §F gains **no** `finding` summary member.
- `request_access` stays **deferred** (no reporter-petitionable Finding summary exists). ADR-0023 §B is unchanged.
- The Task reporter-summary contract (ADR-0023 §F) is untouched and remains the canonical forward summary.

**`POST /entity-links` creatable visibility stays `internal_only`** (`creatableEntityLinkVisibilitySchema` unchanged). What changes is the **creatable entity-pair/relation allowlist**: the registry now permits `(voc → finding, created_finding)` in addition to `(voc → voc, related_to)`. This is a POST allowlist expansion (acknowledged here per ADR-0023 §E) but does **not** unlock a richer creatable visibility, so ADR-0023 §E's visibility-creation lock is not reopened.

### Section F — Database shape

- New Postgres schema **`finding`** (matches the per-module `voc` schema pattern; added to `drizzle.config.ts` schemaFilter). Tables `finding.findings` and `finding.evidence_highlights` per `docs/design/15-data-contracts.md:122-174`, with CHECK constraints for every enum, `source_id` nullability tied to `source_type`, `analytics_area_id` ∈ `primary_managed_system_id`, and `evidence_count >= 0`.
- `evidence_count` is a stored column (contract `15:135` says required) maintained in the same transaction as every evidence mutation; for the create tracer it starts at 0 (no highlights yet — highlights are a follow-on issue).
- **`entity_links` widening uses a composite tuple CHECK**, not independent value CHECKs: the allowed tuples are exactly `(voc, voc, related_to)` and `(voc, finding, created_finding)`. `finding` is added as a `target_type` only (not `source_type`) this slice. Existing `activeUniqueIdx`, partial source/target indexes, and `notSelfCheck` are preserved; a `workspace_id + relation_type` index is added for the inventory/filter path.
- Audit: add `finding_created_from_voc` to `AUDIT_EVENT_TYPES` + a detail schema; broaden `entityLinkCreatedDetailSchema` to a discriminated union admitting `{source:voc, target:finding, relation:created_finding, visibility:internal_only}` **additively** (the `voc→voc/related_to` member is preserved so #112/#115 audit tests still pass).

### Section G — Evidence visibility ≤ source visibility

Per `15:180` and `06`, an Evidence Highlight's read visibility cannot exceed its source's. A Developer who can read a Finding but not the source VOC must not see a VOC quote. Each highlight read checks its source object's readability via the provider; unreadable source ⇒ the quote is withheld. (Highlights are a follow-on Slice 5 issue; this rule is locked now so the highlight issue is built against it.)

### Section H — VOC Cluster as an additive source (#126, amended in-chunk)

The cluster arm of Slice 5 (decision D-1, additive) lands on top of the registry without
reopening any locked section:

- **Tuple CHECK widened additively** to admit `(voc_cluster, finding, created_finding)`
  alongside the existing `(voc, voc, related_to)` and `(voc, finding, created_finding)`.
  `voc_cluster` is registered as a provider/source type; no existing tuple or provider changes.
- **No new capability vocabulary.** Cluster authz REUSES the Finding capabilities from Section C:
  read/list a cluster = Admin OR Developer with `finding.read` on the cluster's
  `primary_managed_system_id`; create / edit / confirm / member add+remove /
  `POST /voc-clusters/:id/create-finding` = Admin OR Developer with `finding.manage` on it.
  Rationale: a cluster is a Finding-synthesis container with no independent read/write surface,
  so minting `voc_cluster.*` caps would be vocabulary churn for no authz distinction.
- **`create-finding-from-cluster` mirrors `§C` source-readability**: source-unreadable ⇒ 404
  (hidden), readable-but-no-`finding.manage` ⇒ 403 (denied). Atomic txn writes finding +
  one `created_finding` link (cluster→finding) + audit `finding_created_from_voc_cluster`,
  reusing `insertActiveEntityLink` exactly as the VOC path does.
- **Idempotency is `Idempotency-Key`-scoped, not source-scoped** — identical to the shipped
  `POST /vocs/:id/create-finding` (#122): a replay with the same key returns the same finding;
  distinct keys are distinct intentional creations. "One `created_finding` link per cluster"
  in #126's acceptance text means one link **per create call**, not one finding per cluster forever.
- **`FindingSource` widened** to admit `type: 'voc_cluster'` so a cluster-sourced finding returns
  its source envelope `{ type:'voc_cluster', id, relation_type:'created_finding', link_id }`.
- Membership is a reference set: cluster member add/remove are audited
  (`voc_cluster_member_added` / `voc_cluster_member_removed`); VOC records are never merged or mutated.

### Section I — Finding status machine endpoint (#131)

`PATCH /findings/:id` is the user-directed Finding status endpoint. The request body is strict:
`{ status: "draft" | "active" | "not_actionable" | "converted" | "archived", reason?: string }`.

Only these transitions are enabled in Slice 6:

- `draft` → `active`
- `draft` → `not_actionable`
- `active` → `not_actionable`
- `not_actionable` → `active`

`converted` and `archived` remain valid stored statuses but are not user-directed PATCH targets
in this slice. `converted` is reserved for the Convert-to-Task slice; `archived` is out of scope.
Illegal targets or transitions return `422 validation.failed`. A same-status request is a
successful no-op returning the current Finding DTO.

Authz reuses `finding.manage` on the Finding's `primary_managed_system_id`; no new capability is
introduced. Successful non-no-op transitions write audit event `finding_status_changed` with
`finding_id`, `from_status`, `to_status`, `primary_managed_system_id`, and optional `reason`.

### Section J — Existing Finding links from a VOC Cluster (#127)

`POST /voc-clusters/:id/link-finding` creates the additive tuple
`(voc_cluster → finding, evidence_of)`. This is evidence association, not
creation provenance: `created_finding` remains exclusive to the command that
actually creates the Finding, because using it for a pre-existing Finding would
make a false statement in both the entity-link and audit history.

This command-only tuple is categorically excluded from every generic
entity-link surface: POST, both GET/list modes, and PATCH/detach. Generic
surfaces respond non-disclosively; PATCH/detach returns the same 404 envelope
as an absent link rather than revealing the tuple through a distinct response.

Generic detach remains prohibited for this command-only tuple. The sole detach
command is `POST /voc-clusters/:id/unlink-finding`: it soft-detaches only the
active `(voc_cluster → finding, evidence_of)` tuple, is idempotent, and emits
the domain plus generic detach audit events only when a row changed.

**#170 decision (2026-07-18):** the `visibility_state: 'hidden'` stub remains
as-is. Its link id, relation, status, Managed System id, and creator are a
deliberate contract: UIs must be able to say that a relationship exists but is
not visible, rather than silently misrepresenting an entity's shape. The
target remains withheld; this is not a disclosure defect. The #112 contract
and existing tests lock the shape. This is independent of #127's
command-only tuple filter, which categorically excludes a tuple from generic
surfaces rather than deciding visibility for a returned relationship.

Cross-Managed-System targets remain valid. Every cluster list and detail
projection instead applies the target Finding's own read scope (Admin or
`finding.read` on its Primary Managed System) to every linked Finding. An
unreadable target is omitted completely; no placeholder or count may reveal it.
The link command hides an unreadable cluster or target as `404`, and requires
`finding.manage` on both readable endpoint scopes.

## Consequences

- The provider-registry refactor is the largest single piece of Slice 5 and a prerequisite for cluster (Slice 5 follow-on), Survey (Slice 8), and Task (Slice 6) link targets — all become additive provider registrations.
- `evidence_highlights` needs a `finding_id` parent column not present in `15:161-174`; this ADR records the contract addition and `15` is amended in the same change.
- No reopening of ADR-0023 §B/§F/§E visibility-creation lock. ADR-0023 §C is amended (Section D above) and its trigger #1 is annotated as partially fired.

## Reopening triggers (carried forward + new)

- A slice gives Finding a **reporter-facing summary** (e.g. reporter-visible "a Finding was opened from your VOC"). That implements a real `getReporterSummary` and reopens Sections D/E.
- `POST /findings/:id/link-evidence` (relation `evidence_of`) or any non-`internal_only` creatable visibility for a finding link reopens Sections E/G.
- A second non-VOC **source** type for a link (finding as `source_type`) extends the tuple CHECK and the registry.

## Alternatives rejected

- **Rename `created_finding` → `evidence_of`** — rejected: reverses the signed `03:346` behavioral contract and conflates two distinct relations.
- **Add a second hard-coded `finding` branch instead of the registry** — rejected: accrues the same debt #112 left, and forces cluster/survey/task to re-touch the same code (delivery-persona finding).
- **Independent value CHECKs on entity_links** — rejected: would admit invalid tuples (`voc→voc evidence_of`, `finding→voc`, `finding→finding`).
- **Compute `evidence_count` instead of storing** — rejected: `15:135` makes it a required stored field; drift is handled by same-transaction maintenance instead.
- **Implement a Finding reporter summary now** — rejected: no doc defines one and CONTEXT.md forbids exposing Finding detail to reporters.
