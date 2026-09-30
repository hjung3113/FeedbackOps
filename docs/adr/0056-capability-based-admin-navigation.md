# ADR-0056: Capability-based Admin navigation

Date: 2026-09-30

## Status

Accepted.

Amends ADR-0040 and ADR-0041 only within their navigation territory; their other decisions remain unchanged.

## Context

Issue #581's owner-approved decision keeps domain destinations visible to every Actor while limiting Admin discovery to Actors who can use it. The current prototype shell filters domain and Admin rail entries by Role Level. Permission is the authoritative access decision, so role labels are not a suitable filter for Admin navigation.

All four Admin destinations use `PermissionGate` with `workspace.admin`: Managed Systems, Analytics Areas, Permission requests, and Workspace settings. The same decision is already available through `usePermissionCheck`, which shares the `PermissionGate` query and is a display hint only.

## Decision

1. Keep the Home, VOC, Findings, Tasks, Integration, and Surveys rail destinations visible to every Actor. Their data and actions continue to follow their existing permission contracts.
2. Show the Admin rail entry, `ADMIN` sidebar section, and Workspace settings footer link only after `/me/permissions/check` approves `workspace.admin`. Hide them while the check is pending, failed, or not approved.
3. Keep Admin route gates unchanged. A direct link to a hidden Admin destination still renders its existing blocked panel; navigation visibility does not grant access or replace backend authorization.
4. Give each icon-only rail destination an accessible name and a visible label on hover or keyboard focus. Keep the existing keyboard order and active-page indication.

The prototype's role-based navigation visibility is superseded only for this behavior. Its layout, labels, and other interactions remain the visual reference.

## Consequences

Actors can discover domain destinations even when a destination will show its existing permission-blocked state. Only an approved `workspace.admin` check reveals Admin navigation. Backend authorization and all Admin page gates remain unchanged.
