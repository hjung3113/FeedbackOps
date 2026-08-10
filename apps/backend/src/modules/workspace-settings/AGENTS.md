# Workspace Settings Module Agent Guide

## Ownership

Workspace Settings owns workspace-level policy storage and its admin-only API.
Consumers read the exported resolved-settings seam; they do not write this
table directly.

## Invariants

- A missing row resolves to the documented defaults.
- PATCH serializes through the singleton row and audits effective changes only.
- Policy consumer wiring belongs to its owning module and is out of scope here.
