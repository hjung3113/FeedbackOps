# ADR-0048: Role Level extension

Date: 2026-09-24

## Status

Accepted

## Context

Role Level is a closed vocabulary of three storage values: `admin`,
`developer`, `user`. What each one may do is already locked by
`docs/design/09-permission-access.md` and
`docs/implementation/05-permission-policy.md`. Reporter is the Actor who
submitted a specific VOC, not a Role Level.

Those docs do not name the code that enforces the vocabulary. The values are
copied, not imported. The `core.actors` CHECK is what rejects an unknown value
at runtime. The local unions and `as RoleLevel` assertions are compile-time
declarations: once the CHECK allows a new value, session creation asserts it
and session load types the column as the old union, and neither rejects it.
The new role then takes whichever branch forgot to mention it. That
fall-through is not "the same as User".

No migration after `0000_familiar_centennial.sql` has changed the CHECK. No
fourth role has ever shipped. This ADR records the wiring that already exists
so the next role is one change across the layers below. It does not choose
what a new role is allowed to do.

## Decision

Adding a Role Level is the following change, in this order. The product docs
in the Context section move in the same change; this ADR does not replace them.

1. **Shared enum.** Add the lower-case storage value to `ROLE_LEVEL_VALUES`
   and a display label to `ROLE_LEVEL_LABELS` in
   `packages/shared/src/enums/index.ts`. Persisted columns, service
   comparisons, and request payloads use the storage value. Labels are for
   UI only. `packages/shared/src/auth/list-actors.ts` already builds its Zod
   enum from `ROLE_LEVEL_VALUES`; do not hand-copy a second list there.

2. **Database CHECK.** `actors_role_level_check` on `core.actors.role_level`
   is the same lower-case list, declared in
   `apps/backend/src/db/schema/core.ts` and created in
   `apps/backend/migrations/0000_familiar_centennial.sql`. Change the drizzle
   `check()` and generate the migration so the SQL, `meta/_journal.json`, and
   snapshot move together (`docs/implementation/04-database-and-migrations.md`,
   `pnpm gate:db-migration-drift`). The IN-list must match
   `ROLE_LEVEL_VALUES` verbatim. Hand-editing `migrations/meta/*.json` is
   rejected by that doc.

3. **Hand-copied unions.** Most modules do not use the shared `RoleLevel`
   type. They repeat `'admin' | 'developer' | 'user'`. A new enum value does
   not reach them. Update each production copy:

   ```text
   apps/backend/src/modules/auth/session-service.ts          RoleLevel
   apps/backend/src/modules/permissions/scope-service.ts     ScopeActorContext
   apps/backend/src/modules/auth/list-actors-routes.ts       response cast
   apps/backend/src/modules/attachments/service.ts
   apps/backend/src/modules/dashboard/service.ts
   apps/backend/src/modules/entity-links/service.ts
   apps/backend/src/modules/entity-links/evaluate-visibility.ts
   apps/backend/src/modules/findings/service.ts
   apps/backend/src/modules/nav/service.ts
   apps/backend/src/modules/surveys/service.ts
   apps/backend/src/modules/task-requests/service.ts
   apps/backend/src/modules/tasks/service.ts
   apps/backend/src/modules/voc/read-service.ts
   apps/backend/src/modules/voc/repo-read.ts
   apps/backend/src/modules/voc/pre-submit-peers/service.ts
   apps/backend/src/modules/voc/recommendations/service.ts
   apps/backend/src/modules/voc-clusters/service.ts
   ```

   `session-service.ts` is the load-bearing copy, and it does not validate
   the value at runtime. Session creation asserts `actor.roleLevel as
   RoleLevel`. Session load declares the SQL result's `role_level` as
   `RoleLevel` and assigns that typed value. Update the union anyway: after
   the CHECK allows the new value, those declarations can silently treat it
   as the old union. `apps/backend/src/modules/voc/conversation-service.ts`
   imports that local type rather than `@fops/shared`. `ScopeActorContext`
   is what Finding and Survey authorization accept.

4. **Implicit capability.** `roleSatisfies` in
   `apps/backend/src/modules/permissions/check-service.ts` is check-order step
   4 from `docs/implementation/05-permission-policy.md`. Today `admin`
   satisfies `workspace.read`, `workspace.admin`, `voc.triage`, and
   `voc.read`; `user` satisfies `workspace.read`; every other value,
   including `developer`, satisfies nothing. Give the new role an explicit
   arm. Leaving it out grants nothing, including `workspace.read`.

5. **Admin bypass stays admin-only.** `applyAdminModuleBypass`,
   `capabilityScope` in the same file, and `CAPABILITY_META.adminModuleBypass`
   in `packages/shared/src/enums/capabilities.ts` all key off
   `role_level === 'admin'`. `survey.read_personal_responses` and
   `survey.export` are `none` even for Admin: role alone is not a grant.
   Domain short-circuits and `CAPABILITY_META` move together; splitting them
   is the issue #372 defect already recorded in
   `apps/backend/src/modules/permissions/AGENTS.md`. A non-admin role does not
   gain this bypass by adding a value.

6. **Domain gates that compare `role_level` themselves.** These do not go
   through `roleSatisfies`. Each one encodes a decision the new role needs
   an explicit answer to:

   ```text
   permissions/scope-service.ts actorScopeForCapability
     admin → { kind: 'all' } without reading grants
   findings/authorization.ts
     admin → allow via role before the capability check
     hasElevatedFindingRole = admin or developer
     requireElevatedRole denies every other role (no_grant, not requestable)
   findings/service.ts listFindings
     rejects every role except admin or developer (permission.denied) before
     canReadFinding. A finding.read grant does not pass this gate. Decide the
     new role here, not only in findings/authorization.ts
   task-requests/service.ts decideTaskRequest
     rejects every role except admin or developer (permission.denied) before
     checkFindingManage. A finding.manage grant does not pass this gate.
     Decide the new role here, not only in the shared manage helper
   surveys/authorization.ts
     admin bypasses survey.read and survey.manage unless explicit_deny
     personal-response read has no role short-circuit
   task-requests/service.ts canReadSourceVoc, hasSelfApprovalCapability
     admin returns true before the capability check
   voc/repo-read.ts actorEffectiveScope
     admin → { kind: 'all' }
   voc/service.ts and voc/conversation-service.ts
     developer + no_grant on voc.triage → permission.scope_required
     every other denied role → permission.denied
   voc/read-service.ts resolveVocListScope
     empty inbox scope: developer → permission.scope_required; every other
       role → permission.denied
     a requested Managed System outside a nonempty scope →
       permission.scope_required with requestable_permission, and this branch
       does not read role_level. A new role reaches it unchanged
   voc/public-update-review-candidates/review-service.ts requireTriage
     developer denial → not_found
     every other role → permission.denied
   voc-clusters/service.ts
     listClusters allows only admin or developer
     admin skips member filtering and keeps the raw member_count
     linkExistingFinding and unlinkExistingFinding: developer + finding.manage
       no_grant → permission.scope_required
     unlinkExistingFinding skips the manage check when role is admin
   entity-links/evaluate-visibility.ts
     unreadable source → hidden, including admin and developer
     unreadable target → summary_visible only for role_level === 'user' when
       visibility is summary_visible and a summary exists; otherwise hidden,
       including admin and developer
     both endpoints readable: admin → allowed
     both readable and developer → allowed, except admin_only which is denied
     both readable and any other role → internal_only is hidden;
       summary_visible is summary or hidden; visible_to_reporter is allowed
       when the actor is the reporter of both endpoints, otherwise hidden;
       admin_only is hidden. A new role can take that reporter allowed path
   entity-links/service.ts preloadReporterSummaries
     runs only when role_level === 'user'
   dashboard/service.ts
     admin may see the survey action queue when survey scope is empty
   ```

7. **Assignment.** First login inserts `role_level = 'user'`
   (`apps/backend/src/modules/auth/session-service.ts`, ADR-0006). The seed
   in `apps/backend/src/seed/index.ts` is what inserts `admin` and
   `developer` rows. No HTTP route updates `role_level`. ADR-0006 describes
   an Admin UI that promotes Actors; that UI is not mounted. A new role is
   assigned by a seed or a direct `core.actors` write, and only after the
   CHECK allows the value.

8. **Frontend copies are display hints.** Backend decisions stay
   authoritative. These screens still branch on the literal, so an unedited
   copy shows the wrong chrome:

   ```text
   apps/frontend/src/lib/layout/AppFrame.tsx
     isAdmin skips the voc.read scope query
   apps/frontend/src/features/admin/permissions/permission-state-view.tsx
     "contact admin" lists role_level === 'admin'
   apps/frontend/src/routes/_authed/voc-clusters/index.tsx
   apps/frontend/src/routes/_authed/voc-clusters/$clusterId.tsx
   apps/frontend/src/features/voc/components/detail/VocDetailPanel.tsx
     elevated actions are admin or developer
   apps/frontend/src/features/tasks/routes/TaskListRoute.tsx
   apps/frontend/src/features/integration/components/FindingDetail/useFindingDetailController.ts
     admin, or an approved manage check
   apps/frontend/src/features/voc/hooks/useComposerVisibility.ts
     role_level === 'user' is the reporter
   apps/frontend/tests/visual/support/mock-api.ts
     its own RoleLevel union for the visual harness
   ```

   `ROLE_LEVEL_LABELS` consumers (`AppRail.tsx`, `login.tsx`) follow the
   shared map once step 1 lands.

9. **Closed-list tests.** `packages/shared/src/auth/__tests__/list-actors.test.ts`
   rejects a value outside `ROLE_LEVEL_VALUES` (`guest`).
   `apps/backend/src/modules/auth/__tests__/list-actors.integration.test.ts`
   asserts every returned `role_level` is one of the three. Update assertions
   that encode the old closed set. Role-specific behavior tests belong with
   the gate they cover, not as a new parallel suite.

## Alternatives Rejected

### Matrix edit only

Updating the table in `docs/design/09-permission-access.md` or the role list
in `docs/implementation/05-permission-policy.md` does not change a comparison
or the CHECK. That is the gap this ADR exists to close.

### One switch in `roleSatisfies`

The permission check service is not the only gate. Finding, Survey, VOC,
VOC Cluster, Task Request, Entity Link, and Dashboard code compare
`role_level` directly. A single new arm in `roleSatisfies` leaves those
branches on their fall-through path.

### Centralize the unions first

Replacing every local union with the shared `RoleLevel` type would make step
3 unnecessary. It is a cleanup, not a requirement of adding a role. Until
that cleanup lands, the copies above are part of the change.

## Consequences

- A value that matches no comparison is its own behavior: no implicit
  capability (unlike User), no admin bypass, and the non-developer branch of
  each domain gate. Write the arm you mean.
- Where step 6 names an explicit `=== 'developer'` comparison, only Developer
  gets `permission.scope_required` there. Other roles at those comparisons
  get the response that line names (`permission.denied` or `not_found`).
  That is not every request path. `resolveVocListScope` also returns
  `permission.scope_required` when a requested Managed System is outside a
  nonempty inbox scope, and that branch does not read `role_level`. A new
  role with scope can become requestable there without a new comparison.
- The CHECK and the enum can still drift from a domain comparison, because a
  string compare does not fail typecheck. Review is the checklist in this
  ADR. `pnpm gate:db-migration-drift` catches a schema check that has no
  migration.
- Login still cannot assign the new role. Seed or a direct write can.

## Reopening

Adding a Role Level by the sequence above is not a reopen, once
`docs/design/09-permission-access.md` and
`docs/implementation/05-permission-policy.md` state what the role may do.
A second vocabulary (AD-group mapping, a role per Managed System), treating a
frontend check as the authority, or extending the admin bypass to a non-admin
role each warrants a new ADR. Reporter remains not a Role Level.

## Worked example — Developer

No role has been added since `actors_role_level_check` was created. Developer
is the shipped role that is neither workspace-wide nor the default, and it is
the example to copy.

Developer is already in `ROLE_LEVEL_VALUES`, `ROLE_LEVEL_LABELS`, and the
CHECK. `roleSatisfies` has no Developer arm, so it satisfies nothing; Managed
System grants carry it. It is not `admin`, so `applyAdminModuleBypass`,
`actorScopeForCapability`, and the Finding/Survey/Task Request short-circuits
do not apply. `hasElevatedFindingRole` and `listClusters` admit it beside
Admin, then scope it with grants. A `no_grant` on `voc.triage`, inbox
`voc.read`, or `finding.manage` becomes `permission.scope_required` only
because those sites test `=== 'developer'`. Link visibility allows Developer
only after both endpoints are readable; an unreadable source or target is
`hidden` for Developer too. When both are readable, `admin_only` is `denied`
rather than `hidden`.
`preloadReporterSummaries` does not run for it, because that preload tests
`=== 'user'`. The seed inserts Developer actors; first login does not.

A new role makes those same choices on purpose. Omitting a site does not
default it to Developer or to User.
