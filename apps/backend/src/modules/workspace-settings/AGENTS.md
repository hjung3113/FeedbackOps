# Workspace Settings Module Agent Guide

## Ownership

Workspace Settings owns workspace-level policy storage and its admin-only API.
Consumers read the exported resolved-settings seam; they do not write this
table directly.

## Invariants

- A missing row resolves to the documented defaults.
- PATCH serializes through the singleton row and audits effective changes only.
- Policy consumer wiring belongs to its owning module and is out of scope here.

## Close-out Coverage contract (ADR-0067; #1087)

- ADR-0067 defines five-metric Coverage pairs, default 75/40, integer
  `0 <= warn < good <= 100`. Missing keys resolve defaults; unknown/reserved keys reject.
- Partial maps merge complete pairs under the singleton lock; strict resolved/audit schemas
  retain all effective per-metric changes. No-op rolls back singleton insertion and stays mutation/audit-free; consumers own color behavior.

## Cluster suggestion policy (ADR-0068; BE/shared #1096)

`voc_cluster_suggestions_enabled:boolean=false` is included in resolved settings and
accepted by strict partial Admin PATCH with effective-change audit only. Preserve other
settings; missing rows default off. Toggles do not touch suggestion/counter/cursor
state; generation and the Admin editor remain deferred. Future VOC generation locks/rechecks the exported
resolved-settings-for-update seam; disabling serializes through the singleton
and never reverses VOC's admission lock order. Pending suggestions/history remain
reviewable. Do not add model/cut/quota/per-MS switches or Core-owned AI behavior.
