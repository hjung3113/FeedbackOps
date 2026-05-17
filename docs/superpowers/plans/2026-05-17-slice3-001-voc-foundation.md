# Slice 3 #12 — VOC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Slice 3 backend foundation — `vocs` + 3 conversation tables + `voc_attachments` stub + reporter-facing-status transition matrix + Slice 3 audit vocabulary + `PermissionDecision` envelope + deterministic Slice 3 seed. No HTTP routes ship here.

**Architecture:** One Drizzle migration file `0010_slice3_voc_foundation.sql` adds all six tables + `next_voc_display_id()` SQL helper + integrity triggers + grants (`fops_app` gets SELECT/INSERT only on conversation tables; UPDATE/DELETE denied). Drizzle schema in `src/db/schema/voc.ts` mirrors 1:1. `@fops/shared` gains 10 audit detail schemas + emit-helpers + `PermissionDecision` type + envelope. Seed extension adds 12 deterministic VOCs spanning every status/severity/source/owner combination plus a seeded `reporter_facing_status_transitions` table.

**Tech Stack:** PostgreSQL 16, Drizzle ORM (hand-written DDL per Slice 2 pattern), zod, TypeScript NodeNext, vitest, pnpm workspace.

---

## Spec Source

- Issue: GitHub `#12` (`Slice 3 foundation: vocs + conversation tables + reporter status matrix + audit vocab + seed`)
- Frontend spec: `docs/frontend/specs/voc.md`
- ADRs touched: ADR-0008 (audit grants), ADR-0011 (rich content), ADR-0015 (timestamps/uuid/idempotency), ADR-0017 (audit detail), ADR-0019 (role grants pattern)
- Source-of-truth: `docs/implementation/03-api-contracts.md` §VOC, `docs/implementation/04-database-and-migrations.md`, `docs/implementation/05-permission-policy.md`

## File Structure

**Created:**
- `apps/backend/migrations/0010_slice3_voc_foundation.sql` — all six tables + helper fn + triggers + grants + transition matrix seed rows
- `apps/backend/migrations/meta/0005_snapshot.json` — Drizzle snapshot stub matching new migration index
- `apps/backend/src/db/schema/voc.ts` — Drizzle table definitions (1:1 mirror)
- `apps/backend/src/db/__tests__/voc-foundation.integration.test.ts` — DDL-level integration tests (CHECKs, triggers, grants, display_id sequence)
- `apps/backend/src/modules/voc/transitions.ts` — `nextReporterStates(currentStatus, tx)` reader of the transition matrix
- `apps/backend/src/modules/voc/__tests__/transitions.integration.test.ts`
- `apps/backend/src/seed/voc-fixtures.ts` — Slice 3 deterministic VOC seed data (12 VOCs, conversation rows, decisions envelope)
- `apps/backend/src/seed/__tests__/voc-seed.integration.test.ts`
- `packages/shared/src/permissions/index.ts` — `PermissionDecision` + envelope type
- `packages/shared/src/permissions/__tests__/permission-decision.test.ts`
- `packages/shared/src/audit/voc.ts` — emit-helpers receiving `Tx`
- `packages/shared/src/audit/__tests__/voc-audit-schemas.test.ts`

**Modified:**
- `packages/shared/src/index.ts` — re-export new `audit/voc` + `permissions` barrels
- `packages/shared/src/enums/audit-events.ts` — add 10 Slice 3 event types + detail schemas to `AUDIT_EVENT_TYPES` / `AUDIT_EVENT_DETAIL_SCHEMAS`
- `apps/backend/src/db/schema/index.ts` — re-export `voc.ts`
- `apps/backend/src/db/tx.ts` — extend schema union with voc tables (only if Drizzle needs it for relations; otherwise unchanged)
- `apps/backend/src/seed/index.ts` — call into `voc-fixtures.ts`, extend `SeedResult` with VOC counts
- `apps/backend/src/db/__tests__/seed.integration.test.ts` — assert Slice 3 seed shape + idempotency

**Commits:** one per task. Conventional Commits: `feat(slice3): …`, `test(slice3): …`. Reference `#12` in commit body.

---

## Task 1: Shared `PermissionDecision` envelope

**Files:**
- Create: `packages/shared/src/permissions/index.ts`
- Create: `packages/shared/src/permissions/__tests__/permission-decision.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/src/permissions/__tests__/permission-decision.test.ts
import { describe, expect, it } from 'vitest';

import {
  permissionDecisionSchema,
  permissionDecisionsEnvelopeSchema,
  type PermissionDecisionsEnvelope,
} from '../index.js';

describe('PermissionDecision', () => {
  it('accepts a request_access decision with stable id and timestamp', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000001',
      state: 'request_access',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'developer_outside_managed_system_scope',
    });
    expect(parsed.state).toBe('request_access');
  });

  it('accepts a summary_visible decision', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000002',
      state: 'summary_visible',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'restricted_finding_same_managed_system',
    });
    expect(parsed.state).toBe('summary_visible');
  });

  it('rejects an unknown decision state', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000003',
        state: 'bogus',
        evaluated_at: '2026-05-17T10:00:00.000Z',
        reason: 'x',
      }),
    ).toThrow();
  });

  it('envelope keys are arbitrary strings (DecisionKey)', () => {
    const env: PermissionDecisionsEnvelope = {
      linkedFinding: {
        decision_id: '01919b8c-0000-7000-8000-000000000004',
        state: 'allow',
        evaluated_at: '2026-05-17T10:00:00.000Z',
        reason: 'capability_granted',
      },
    };
    expect(permissionDecisionsEnvelopeSchema.parse(env).linkedFinding?.state).toBe('allow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fops/shared test permissions`
Expected: FAIL — module `../index.js` does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/permissions/index.ts
import { z } from 'zod';

// State vocabulary per docs/frontend/specs/voc.md §4.2 + 05-permission-policy.md.
// `allow`        — full read/write per capability grant.
// `summary_visible` — restricted finding within the same Managed System;
//                   reporter or stakeholder may see redacted summary only.
// `deny`         — explicit deny (permission_denies row).
// `request_access` — actor outside scope; UI surfaces a request-access CTA.
export const PERMISSION_DECISION_STATES = [
  'allow',
  'summary_visible',
  'deny',
  'request_access',
] as const;
export type PermissionDecisionState = (typeof PERMISSION_DECISION_STATES)[number];

export const permissionDecisionSchema = z.object({
  decision_id: z.string().uuid(),
  state: z.enum(PERMISSION_DECISION_STATES),
  evaluated_at: z.string().datetime(),
  reason: z.string().min(1),
});
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

// Envelope: keys are decision purposes (`linkedFinding`, `linkedTask`, …).
// Slice 3 VOC consumes `linkedFinding`. Other keys may land additively
// without schema migration; unknown keys are preserved.
export const permissionDecisionsEnvelopeSchema = z.record(z.string(), permissionDecisionSchema);
export type PermissionDecisionsEnvelope = Record<string, PermissionDecision>;
```

```ts
// packages/shared/src/index.ts (append)
export * from './permissions/index.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fops/shared test permissions`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/permissions/ packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(slice3): add PermissionDecision envelope to @fops/shared

Lands the cross-app PermissionDecision type + envelope per
docs/frontend/specs/voc.md §4.2. Slice 3 VOC seed and later HTTP
layers share this shape; Finding / Task keys land additively.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Slice 3 audit detail schemas + emit-helpers

**Files:**
- Create: `packages/shared/src/audit/voc.ts`
- Create: `packages/shared/src/audit/__tests__/voc-audit-schemas.test.ts`
- Modify: `packages/shared/src/enums/audit-events.ts` (extend `AUDIT_EVENT_TYPES` + `AUDIT_EVENT_DETAIL_SCHEMAS`)
- Modify: `packages/shared/src/index.ts` (re-export `audit/voc`)

The 10 events per #12: `voc_created`, `voc_triage_committed`, `voc_severity_set`, `voc_owner_assigned`, `voc_analytics_area_linked`, `voc_cluster_decision_recorded`, `public_update_created`, `reporter_facing_status_changed`, `reporter_reply_created`, `internal_comment_created`.

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/src/audit/__tests__/voc-audit-schemas.test.ts
import { describe, expect, it } from 'vitest';

import {
  internalCommentCreatedDetailSchema,
  publicUpdateCreatedDetailSchema,
  reporterFacingStatusChangedDetailSchema,
  reporterReplyCreatedDetailSchema,
  vocAnalyticsAreaLinkedDetailSchema,
  vocClusterDecisionRecordedDetailSchema,
  vocCreatedDetailSchema,
  vocOwnerAssignedDetailSchema,
  vocSeveritySetDetailSchema,
  vocTriageCommittedDetailSchema,
} from '../voc.js';
import { AUDIT_EVENT_DETAIL_SCHEMAS, AUDIT_EVENT_TYPES } from '../../enums/audit-events.js';

const U = '01919b8c-0000-7000-8000-000000000001';

describe('voc_created', () => {
  it('accepts required shape', () => {
    expect(() =>
      vocCreatedDetailSchema.parse({
        voc_id: U,
        workspace_id: U,
        primary_managed_system_id: U,
        analytics_area_id: null,
        reporter_id: U,
        source_context: 'direct_use',
      }),
    ).not.toThrow();
  });
  it('rejects bad source_context', () => {
    expect(() =>
      vocCreatedDetailSchema.parse({
        voc_id: U,
        workspace_id: U,
        primary_managed_system_id: U,
        analytics_area_id: null,
        reporter_id: U,
        source_context: 'phone_call',
      }),
    ).toThrow();
  });
});

describe('voc_triage_committed', () => {
  it('accepts atomic triage shape', () => {
    expect(() =>
      vocTriageCommittedDetailSchema.parse({
        voc_id: U,
        severity: 'high',
        owner_user_id: U,
        owner_team_id: null,
        analytics_area_id: null,
        cluster_decision: 'confirm',
      }),
    ).not.toThrow();
  });
  it('allows null severity is rejected — severity is committed at triage', () => {
    expect(() =>
      vocTriageCommittedDetailSchema.parse({
        voc_id: U,
        severity: null,
        owner_user_id: null,
        owner_team_id: null,
        analytics_area_id: null,
        cluster_decision: null,
      }),
    ).toThrow();
  });
});

describe('voc_severity_set', () => {
  it('accepts from=null to=critical', () => {
    expect(() =>
      vocSeveritySetDetailSchema.parse({ voc_id: U, from: null, to: 'critical' }),
    ).not.toThrow();
  });
});

describe('voc_owner_assigned', () => {
  it('accepts user → team reassignment', () => {
    expect(() =>
      vocOwnerAssignedDetailSchema.parse({
        voc_id: U,
        from: { user_id: U, team_id: null },
        to: { user_id: null, team_id: U },
      }),
    ).not.toThrow();
  });
});

describe('voc_analytics_area_linked', () => {
  it('accepts null → uuid', () => {
    expect(() =>
      vocAnalyticsAreaLinkedDetailSchema.parse({ voc_id: U, from: null, to: U }),
    ).not.toThrow();
  });
});

describe('voc_cluster_decision_recorded', () => {
  it('accepts confirm', () => {
    expect(() =>
      vocClusterDecisionRecordedDetailSchema.parse({ voc_id: U, decision: 'confirm' }),
    ).not.toThrow();
  });
  it('rejects unknown decision', () => {
    expect(() =>
      vocClusterDecisionRecordedDetailSchema.parse({ voc_id: U, decision: 'maybe' }),
    ).toThrow();
  });
});

describe('public_update_created', () => {
  it('accepts skip with reason', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: U,
        actor_id: U,
        skip_public_update: true,
        skip_reason: 'internal-only triage note',
      }),
    ).not.toThrow();
  });
  it('rejects skip=true with skip_reason shorter than 8 chars', () => {
    expect(() =>
      publicUpdateCreatedDetailSchema.parse({
        voc_id: U,
        public_update_id: U,
        actor_id: U,
        skip_public_update: true,
        skip_reason: 'short',
      }),
    ).toThrow();
  });
});

describe('reporter_facing_status_changed', () => {
  it('accepts paired_with: public_update', () => {
    expect(() =>
      reporterFacingStatusChangedDetailSchema.parse({
        voc_id: U,
        from: 'received',
        to: 'reviewing',
        paired_with: 'public_update',
      }),
    ).not.toThrow();
  });
  it('accepts paired_with: skip', () => {
    expect(() =>
      reporterFacingStatusChangedDetailSchema.parse({
        voc_id: U,
        from: 'received',
        to: 'reviewing',
        paired_with: 'skip',
      }),
    ).not.toThrow();
  });
});

describe('reporter_reply_created', () => {
  it('accepts required shape', () => {
    expect(() =>
      reporterReplyCreatedDetailSchema.parse({
        voc_id: U,
        reporter_reply_id: U,
        actor_id: U,
      }),
    ).not.toThrow();
  });
});

describe('internal_comment_created', () => {
  it('accepts mentions array', () => {
    expect(() =>
      internalCommentCreatedDetailSchema.parse({
        voc_id: U,
        internal_comment_id: U,
        actor_id: U,
        mentions: [U],
      }),
    ).not.toThrow();
  });
  it('rejects non-uuid in mentions', () => {
    expect(() =>
      internalCommentCreatedDetailSchema.parse({
        voc_id: U,
        internal_comment_id: U,
        actor_id: U,
        mentions: ['not-a-uuid'],
      }),
    ).toThrow();
  });
});

describe('AUDIT_EVENT_TYPES registry', () => {
  it.each([
    'voc_created',
    'voc_triage_committed',
    'voc_severity_set',
    'voc_owner_assigned',
    'voc_analytics_area_linked',
    'voc_cluster_decision_recorded',
    'public_update_created',
    'reporter_facing_status_changed',
    'reporter_reply_created',
    'internal_comment_created',
  ])('registers %s with a detail schema', (event) => {
    expect(AUDIT_EVENT_TYPES).toContain(event);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[event as keyof typeof AUDIT_EVENT_DETAIL_SCHEMAS]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fops/shared test voc-audit-schemas`
Expected: FAIL — module `../voc.js` does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/audit/voc.ts
import { z } from 'zod';

const uuid = () => z.string().uuid();
const severity = z.enum(['low', 'medium', 'high', 'critical']);
const reporterFacingStatus = z.enum([
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
]);
const sourceContext = z.enum([
  'direct_use',
  'proxy_report',
  'operational_discovery',
  'stakeholder_request',
]);

export const vocCreatedDetailSchema = z.object({
  voc_id: uuid(),
  workspace_id: uuid(),
  primary_managed_system_id: uuid(),
  analytics_area_id: uuid().nullable(),
  reporter_id: uuid(),
  source_context: sourceContext,
});
export type VocCreatedDetail = z.infer<typeof vocCreatedDetailSchema>;

// Atomic event emitted when triage commits. Severity is non-null at this
// point per docs/design/04-voc-system.md (severity assigned during triage).
export const vocTriageCommittedDetailSchema = z.object({
  voc_id: uuid(),
  severity,
  owner_user_id: uuid().nullable(),
  owner_team_id: uuid().nullable(),
  analytics_area_id: uuid().nullable(),
  cluster_decision: z.enum(['confirm', 'dismiss']).nullable(),
});
export type VocTriageCommittedDetail = z.infer<typeof vocTriageCommittedDetailSchema>;

export const vocSeveritySetDetailSchema = z.object({
  voc_id: uuid(),
  from: severity.nullable(),
  to: severity,
});
export type VocSeveritySetDetail = z.infer<typeof vocSeveritySetDetailSchema>;

const ownerShape = z.object({
  user_id: uuid().nullable(),
  team_id: uuid().nullable(),
});
export const vocOwnerAssignedDetailSchema = z.object({
  voc_id: uuid(),
  from: ownerShape,
  to: ownerShape,
});
export type VocOwnerAssignedDetail = z.infer<typeof vocOwnerAssignedDetailSchema>;

export const vocAnalyticsAreaLinkedDetailSchema = z.object({
  voc_id: uuid(),
  from: uuid().nullable(),
  to: uuid().nullable(),
});
export type VocAnalyticsAreaLinkedDetail = z.infer<typeof vocAnalyticsAreaLinkedDetailSchema>;

export const vocClusterDecisionRecordedDetailSchema = z.object({
  voc_id: uuid(),
  decision: z.enum(['confirm', 'dismiss']),
});
export type VocClusterDecisionRecordedDetail = z.infer<typeof vocClusterDecisionRecordedDetailSchema>;

// Paired-write rule per docs/implementation/03-api-contracts.md:176-179:
// either a public_update body is written, or skip_public_update=true with
// a non-trivial skip_reason. The DB CHECK enforces length>=8 server-side;
// the audit row carries the same constraint for BI fidelity.
export const publicUpdateCreatedDetailSchema = z
  .object({
    voc_id: uuid(),
    public_update_id: uuid(),
    actor_id: uuid(),
    skip_public_update: z.boolean(),
    skip_reason: z.string().nullable(),
  })
  .refine(
    (d) => !d.skip_public_update || (typeof d.skip_reason === 'string' && d.skip_reason.length >= 8),
    { message: 'skip_reason must be >= 8 chars when skip_public_update is true' },
  );
export type PublicUpdateCreatedDetail = z.infer<typeof publicUpdateCreatedDetailSchema>;

export const reporterFacingStatusChangedDetailSchema = z.object({
  voc_id: uuid(),
  from: reporterFacingStatus,
  to: reporterFacingStatus,
  paired_with: z.enum(['public_update', 'skip']),
});
export type ReporterFacingStatusChangedDetail = z.infer<typeof reporterFacingStatusChangedDetailSchema>;

export const reporterReplyCreatedDetailSchema = z.object({
  voc_id: uuid(),
  reporter_reply_id: uuid(),
  actor_id: uuid(),
});
export type ReporterReplyCreatedDetail = z.infer<typeof reporterReplyCreatedDetailSchema>;

export const internalCommentCreatedDetailSchema = z.object({
  voc_id: uuid(),
  internal_comment_id: uuid(),
  actor_id: uuid(),
  mentions: z.array(uuid()),
});
export type InternalCommentCreatedDetail = z.infer<typeof internalCommentCreatedDetailSchema>;
```

```ts
// packages/shared/src/enums/audit-events.ts — extend AUDIT_EVENT_TYPES and
// AUDIT_EVENT_DETAIL_SCHEMAS to include the 10 Slice 3 events. Append the
// 10 new event-type strings to AUDIT_EVENT_TYPES and the 10 schema entries
// to AUDIT_EVENT_DETAIL_SCHEMAS. Import the schemas from '../audit/voc.js'.

// Before (final lines of file, partial):
// export const AUDIT_EVENT_TYPES = [
//   'permission_requested',
//   'managed_system_registered',
//   ...
// ] as const;

// After:
import {
  internalCommentCreatedDetailSchema,
  publicUpdateCreatedDetailSchema,
  reporterFacingStatusChangedDetailSchema,
  reporterReplyCreatedDetailSchema,
  vocAnalyticsAreaLinkedDetailSchema,
  vocClusterDecisionRecordedDetailSchema,
  vocCreatedDetailSchema,
  vocOwnerAssignedDetailSchema,
  vocSeveritySetDetailSchema,
  vocTriageCommittedDetailSchema,
} from '../audit/voc.js';

export const AUDIT_EVENT_TYPES = [
  'permission_requested',
  'managed_system_registered',
  'managed_system_updated',
  'managed_system_archived',
  'analytics_area_registered',
  'analytics_area_updated',
  'analytics_area_archived',
  // Slice 3 #12: VOC foundation vocabulary.
  'voc_created',
  'voc_triage_committed',
  'voc_severity_set',
  'voc_owner_assigned',
  'voc_analytics_area_linked',
  'voc_cluster_decision_recorded',
  'public_update_created',
  'reporter_facing_status_changed',
  'reporter_reply_created',
  'internal_comment_created',
] as const;

export const AUDIT_EVENT_DETAIL_SCHEMAS = {
  permission_requested: permissionRequestedDetailSchema,
  managed_system_registered: managedSystemRegisteredDetailSchema,
  managed_system_updated: managedSystemUpdatedDetailSchema,
  managed_system_archived: managedSystemArchivedDetailSchema,
  analytics_area_registered: analyticsAreaRegisteredDetailSchema,
  analytics_area_updated: analyticsAreaUpdatedDetailSchema,
  analytics_area_archived: analyticsAreaArchivedDetailSchema,
  voc_created: vocCreatedDetailSchema,
  voc_triage_committed: vocTriageCommittedDetailSchema,
  voc_severity_set: vocSeveritySetDetailSchema,
  voc_owner_assigned: vocOwnerAssignedDetailSchema,
  voc_analytics_area_linked: vocAnalyticsAreaLinkedDetailSchema,
  voc_cluster_decision_recorded: vocClusterDecisionRecordedDetailSchema,
  public_update_created: publicUpdateCreatedDetailSchema,
  reporter_facing_status_changed: reporterFacingStatusChangedDetailSchema,
  reporter_reply_created: reporterReplyCreatedDetailSchema,
  internal_comment_created: internalCommentCreatedDetailSchema,
} as const satisfies Record<AuditEventType, z.ZodTypeAny>;
```

```ts
// packages/shared/src/index.ts (append)
export * from './audit/voc.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fops/shared test voc-audit-schemas`
Expected: PASS (registry it.each = 10 + 14 individual = 24 assertions).

Also run: `pnpm --filter @fops/shared typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/audit/ packages/shared/src/enums/audit-events.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(slice3): add 10 VOC audit detail schemas to @fops/shared

Lands the Slice 3 audit vocabulary (voc_created, voc_triage_committed,
voc_severity_set, voc_owner_assigned, voc_analytics_area_linked,
voc_cluster_decision_recorded, public_update_created,
reporter_facing_status_changed, reporter_reply_created,
internal_comment_created) with zod detail schemas per ADR-0017.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migration — `vocs` table + `voc_display_seq` + `next_voc_display_id()` helper + integrity triggers

**Files:**
- Create: `apps/backend/migrations/0010_slice3_voc_foundation.sql` (this task ships only the `vocs` portion; later tasks append to the same file before merging if scoped tightly — OR commit incrementally per table. We commit incrementally to keep diffs reviewable. Final migration is the sum of Tasks 3 + 4 + 5 + 6 in one file because Drizzle/migrate apply file-by-file.)
- Create: `apps/backend/src/db/schema/voc.ts`
- Create: `apps/backend/src/db/__tests__/voc-foundation.integration.test.ts`
- Modify: `apps/backend/src/db/schema/index.ts`
- Modify: `apps/backend/migrations/meta/_journal.json`

**Note on incremental migration commits:** the migration file `0010_slice3_voc_foundation.sql` is *built up* across Tasks 3 → 6 and committed as a single file at the end of Task 6. Tasks 3 / 4 / 5 commit only the SQL fragments via `git add -p` and the matching schema + tests, with a clear note in each commit body that the migration is partial. **Alternative (simpler):** stage the migration only at Task 6 and have Tasks 3–5 commit the Drizzle schema + tests against an unapplied migration. We choose the simpler path: **migration ships in one commit at Task 6 end; Tasks 3–5 commit schema + tests + migration content additions per task, each making the test green via re-running the still-not-yet-final migration on a fresh DB.**

For each of Tasks 3–6, the test runner pattern is: drop schema, re-run `pnpm migrate` (which now includes 0010), then assert.

- [ ] **Step 1: Write failing integration test (DDL + display_id sequence)**

```ts
// apps/backend/src/db/__tests__/voc-foundation.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { createDb } from '../client.js';
import { loadConfig } from '../../config.js';

const cfg = loadConfig();
const handle = await createDb(cfg.databaseUrl);

describe('Slice 3 vocs table', () => {
  let workspaceId: string;
  let msId: string;
  let actorId: string;

  beforeAll(async () => {
    await handle.db.execute(sql`begin`);
    // Reuse seeded workspace; reseed first to ensure fixtures.
    const ws = await handle.db.execute(sql`select id from core.workspaces limit 1`);
    workspaceId = (ws.rows[0] as { id: string }).id;
    const ms = await handle.db.execute(sql`
      select id from core.managed_systems where workspace_id = ${workspaceId} order by created_at limit 1
    `);
    msId = (ms.rows[0] as { id: string }).id;
    const a = await handle.db.execute(sql`
      select id from core.actors where workspace_id = ${workspaceId} limit 1
    `);
    actorId = (a.rows[0] as { id: string }).id;
  });

  afterAll(async () => {
    await handle.db.execute(sql`rollback`);
    await handle.pool.end();
  });

  it('inserts a VOC with auto-generated display_id VOC-####', async () => {
    const inserted = await handle.db.execute(sql`
      insert into voc.vocs (
        workspace_id, display_id, primary_managed_system_id, reporter_id,
        title, description_rich_content, source_context
      ) values (
        ${workspaceId},
        voc.next_voc_display_id(${workspaceId}),
        ${msId}, ${actorId}, 'Test VOC', '{"type":"doc","content":[]}'::jsonb,
        'direct_use'
      ) returning display_id, reporter_facing_status, triage_state
    `);
    const row = inserted.rows[0] as { display_id: string; reporter_facing_status: string; triage_state: string };
    expect(row.display_id).toMatch(/^VOC-\d+$/);
    expect(row.reporter_facing_status).toBe('received');
    expect(row.triage_state).toBe('untriaged');
  });

  it('display_id increments sequentially per workspace', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await handle.db.execute(sql`
        insert into voc.vocs (
          workspace_id, display_id, primary_managed_system_id, reporter_id,
          title, description_rich_content, source_context
        ) values (
          ${workspaceId}, voc.next_voc_display_id(${workspaceId}),
          ${msId}, ${actorId}, ${'Sequential ' + i},
          '{"type":"doc","content":[]}'::jsonb, 'direct_use'
        ) returning display_id
      `);
      ids.push((r.rows[0] as { display_id: string }).display_id);
    }
    const nums = ids.map((s) => Number(s.replace('VOC-', '')));
    expect(nums[1]).toBe(nums[0] + 1);
    expect(nums[2]).toBe(nums[1] + 1);
  });

  it('rejects analytics_area_id whose managed_system_id does not match', async () => {
    // Find an AA from a DIFFERENT MS.
    const otherAA = await handle.db.execute(sql`
      select aa.id from core.analytics_areas aa
      where aa.workspace_id = ${workspaceId} and aa.managed_system_id <> ${msId}
      limit 1
    `);
    const aaId = (otherAA.rows[0] as { id: string }).id;
    await expect(
      handle.db.execute(sql`
        insert into voc.vocs (
          workspace_id, display_id, primary_managed_system_id, analytics_area_id,
          reporter_id, title, description_rich_content, source_context
        ) values (
          ${workspaceId}, voc.next_voc_display_id(${workspaceId}),
          ${msId}, ${aaId}, ${actorId}, 'AA mismatch',
          '{"type":"doc","content":[]}'::jsonb, 'direct_use'
        )
      `),
    ).rejects.toThrow(/analytics_area_managed_system_mismatch/);
  });

  it('rejects both owner_user_id and owner_team_id populated', async () => {
    const team = await handle.db.execute(sql`
      insert into core.teams (workspace_id, name) values (${workspaceId}, 'voc-test-team') returning id
    `);
    const teamId = (team.rows[0] as { id: string }).id;
    await expect(
      handle.db.execute(sql`
        insert into voc.vocs (
          workspace_id, display_id, primary_managed_system_id,
          reporter_id, title, description_rich_content, source_context,
          owner_user_id, owner_team_id
        ) values (
          ${workspaceId}, voc.next_voc_display_id(${workspaceId}),
          ${msId}, ${actorId}, 'Owner XOR violation',
          '{"type":"doc","content":[]}'::jsonb, 'direct_use',
          ${actorId}, ${teamId}
        )
      `),
    ).rejects.toThrow(/vocs_owner_xor/);
  });

  it('rejects invalid severity / reporter_facing_status / triage_state / source_context', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.vocs (
          workspace_id, display_id, primary_managed_system_id,
          reporter_id, title, description_rich_content, source_context,
          severity
        ) values (
          ${workspaceId}, voc.next_voc_display_id(${workspaceId}),
          ${msId}, ${actorId}, 'Bad severity',
          '{"type":"doc","content":[]}'::jsonb, 'direct_use',
          'extreme'
        )
      `),
    ).rejects.toThrow(/vocs_severity_enum/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fops/backend test voc-foundation`
Expected: FAIL — schema `voc` does not exist OR migration 0010 missing.

- [ ] **Step 3: Implement migration (vocs portion only — file will grow in later tasks)**

```sql
-- apps/backend/migrations/0010_slice3_voc_foundation.sql
--
-- Slice 3 #12: VOC foundation. Lands the vocs core table, three append-only
-- conversation tables, voc_attachments FK stub, and the
-- reporter_facing_status_transitions matrix (seeded inline). Migration owns
-- DDL only — no application code is wired here.
--
-- ADR alignment: ADR-0008 (least-privilege grants; fops_admin DDL,
-- fops_app DML only on append-only conversation surfaces), ADR-0011 (rich
-- content stored as jsonb, server-sanitized in service layer), ADR-0015
-- (uuid v7 / timestamptz / idempotency conventions), ADR-0017 (audit
-- detail), ADR-0019 (role grants pattern continued from migration 0009).
--
-- Resolved spec questions (per #12):
--   Q-DISPLAYID -> backend owns display_id via next_voc_display_id(ws_id).
--   Q1          -> voc_attachments table ships; storage endpoint deferred.
--   Q6          -> seed extended in apps/backend/src/seed/voc-fixtures.ts.

CREATE SCHEMA IF NOT EXISTS "voc";

-- ──────────────────────────────────────────────────────────────────────
-- voc.voc_display_seq — workspace-scoped human-readable VOC ID source.
-- Single global sequence; per-workspace uniqueness comes from the unique
-- index on vocs.(workspace_id, display_id), not from per-ws sequences
-- (which would require dynamic SQL). The helper function next_voc_display_id
-- still accepts workspace_id so a future migration can swap the impl.
-- ──────────────────────────────────────────────────────────────────────
CREATE SEQUENCE "voc"."voc_display_seq" START 1000;

CREATE OR REPLACE FUNCTION "voc"."next_voc_display_id"(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq bigint;
BEGIN
  -- workspace_id is reserved for future per-workspace sequence variants.
  -- Today we share one sequence; the formatted slug is collision-free
  -- across workspaces because the unique index is per workspace.
  PERFORM p_workspace_id;
  v_seq := nextval('voc.voc_display_seq');
  RETURN 'VOC-' || v_seq::text;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- voc.vocs — canonical VOC record.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE "voc"."vocs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "display_id" text NOT NULL,
  "primary_managed_system_id" uuid NOT NULL,
  "analytics_area_id" uuid,
  "reporter_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description_rich_content" jsonb NOT NULL,
  "severity" text,
  "reporter_facing_status" text NOT NULL DEFAULT 'received',
  "triage_state" text NOT NULL DEFAULT 'untriaged',
  "triage_state_review_postponed_at" timestamp with time zone,
  "owner_user_id" uuid,
  "owner_team_id" uuid,
  "source_context" text NOT NULL,
  "cluster_id" uuid,
  "archived_at" timestamp with time zone,
  "archived_by_actor_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vocs_severity_enum" CHECK ("severity" IS NULL OR "severity" IN ('low','medium','high','critical')),
  CONSTRAINT "vocs_reporter_facing_status_enum" CHECK ("reporter_facing_status" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "vocs_triage_state_enum" CHECK ("triage_state" IN
    ('untriaged','triaged','needs_more_information','dismissed_not_actionable')),
  CONSTRAINT "vocs_source_context_enum" CHECK ("source_context" IN
    ('direct_use','proxy_report','operational_discovery','stakeholder_request')),
  CONSTRAINT "vocs_owner_xor" CHECK ("owner_user_id" IS NULL OR "owner_team_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_primary_managed_system_id_fk"
  FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_analytics_area_id_fk"
  FOREIGN KEY ("analytics_area_id") REFERENCES "core"."analytics_areas"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_reporter_id_fk"
  FOREIGN KEY ("reporter_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_owner_user_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_owner_team_id_fk"
  FOREIGN KEY ("owner_team_id") REFERENCES "core"."teams"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_archived_by_actor_id_fk"
  FOREIGN KEY ("archived_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "vocs_workspace_display_id_uq"
  ON "voc"."vocs" ("workspace_id", "display_id");
--> statement-breakpoint
CREATE INDEX "vocs_inbox_idx"
  ON "voc"."vocs" ("workspace_id", "primary_managed_system_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "vocs_my_vocs_idx"
  ON "voc"."vocs" ("workspace_id", "reporter_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "vocs_triage_queue_idx"
  ON "voc"."vocs" ("workspace_id", "triage_state")
  WHERE "triage_state" = 'untriaged';
--> statement-breakpoint
CREATE INDEX "vocs_active_idx"
  ON "voc"."vocs" ("workspace_id")
  WHERE "archived_at" IS NULL;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────────────
-- vocs.analytics_area_id integrity trigger.
-- If AA is set, its managed_system_id must equal vocs.primary_managed_system_id
-- per Slice 2 exit criteria (AA is flat under exactly one MS).
-- Application layer maps the raise message to error code validation.failed.
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "voc"."vocs_analytics_area_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_aa_ms_id uuid;
BEGIN
  IF NEW.analytics_area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT managed_system_id INTO v_aa_ms_id
    FROM core.analytics_areas WHERE id = NEW.analytics_area_id;
  IF v_aa_ms_id IS NULL OR v_aa_ms_id <> NEW.primary_managed_system_id THEN
    RAISE EXCEPTION 'analytics_area_managed_system_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "vocs_analytics_area_integrity_trg"
  BEFORE INSERT OR UPDATE OF analytics_area_id, primary_managed_system_id
  ON "voc"."vocs"
  FOR EACH ROW EXECUTE FUNCTION "voc"."vocs_analytics_area_integrity"();
--> statement-breakpoint

-- updated_at touch trigger (matches Slice 2 #9 pattern).
CREATE OR REPLACE FUNCTION "voc"."touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "vocs_touch_updated_at_trg"
  BEFORE UPDATE ON "voc"."vocs"
  FOR EACH ROW EXECUTE FUNCTION "voc"."touch_updated_at"();
--> statement-breakpoint

-- Grants. fops_app gets full DML; archive workflows are app-driven, not
-- DDL. (Conversation tables — added in later tasks — get the tighter
-- SELECT/INSERT-only grant pattern.)
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."vocs" TO fops_app;
GRANT USAGE ON SEQUENCE "voc"."voc_display_seq" TO fops_app;
GRANT EXECUTE ON FUNCTION "voc"."next_voc_display_id"(uuid) TO fops_app;
```

```ts
// apps/backend/src/db/schema/voc.ts
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, teams, workspaces } from './core.js';

export const vocSchema = pgSchema('voc');

export const vocs = vocSchema.table(
  'vocs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    primaryManagedSystemId: uuid('primary_managed_system_id').notNull().references(() => managedSystems.id),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    reporterId: uuid('reporter_id').notNull().references(() => actors.id),
    title: text('title').notNull(),
    descriptionRichContent: jsonb('description_rich_content').notNull(),
    severity: text('severity'),
    reporterFacingStatus: text('reporter_facing_status').notNull().default('received'),
    triageState: text('triage_state').notNull().default('untriaged'),
    triageStateReviewPostponedAt: timestamp('triage_state_review_postponed_at', { withTimezone: true }),
    ownerUserId: uuid('owner_user_id').references(() => actors.id),
    ownerTeamId: uuid('owner_team_id').references(() => teams.id),
    sourceContext: text('source_context').notNull(),
    clusterId: uuid('cluster_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('vocs_workspace_display_id_uq').on(t.workspaceId, t.displayId),
    inboxIdx: index('vocs_inbox_idx').on(t.workspaceId, t.primaryManagedSystemId, t.createdAt),
    myVocsIdx: index('vocs_my_vocs_idx').on(t.workspaceId, t.reporterId, t.createdAt),
    triageQueueIdx: index('vocs_triage_queue_idx').on(t.workspaceId, t.triageState),
    activeIdx: index('vocs_active_idx').on(t.workspaceId),
    severityEnum: check('vocs_severity_enum', sql`${t.severity} is null or ${t.severity} in ('low','medium','high','critical')`),
    reporterFacingStatusEnum: check(
      'vocs_reporter_facing_status_enum',
      sql`${t.reporterFacingStatus} in ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    triageStateEnum: check(
      'vocs_triage_state_enum',
      sql`${t.triageState} in ('untriaged','triaged','needs_more_information','dismissed_not_actionable')`,
    ),
    sourceContextEnum: check(
      'vocs_source_context_enum',
      sql`${t.sourceContext} in ('direct_use','proxy_report','operational_discovery','stakeholder_request')`,
    ),
    ownerXor: check('vocs_owner_xor', sql`${t.ownerUserId} is null or ${t.ownerTeamId} is null`),
  }),
);
```

```ts
// apps/backend/src/db/schema/index.ts (append)
export * from './voc.js';
```

Update Drizzle journal (`apps/backend/migrations/meta/_journal.json`) to register `0010_slice3_voc_foundation` with `idx: 10`, `version: "7"`, `when: 1779340000000`, `tag: "0010_slice3_voc_foundation"`, `breakpoints: true`. **Snapshot stub:** create `meta/0010_snapshot.json` by running `pnpm --filter @fops/backend drizzle-kit generate --custom` is *not* needed because we hand-write SQL; copy `0004_snapshot.json` and rename — Drizzle ignores it for hand-written migrations but the journal entry must exist for `pnpm migrate` ordering.

- [ ] **Step 4: Run migration and integration test**

```bash
pnpm --filter @fops/backend db:reset && pnpm --filter @fops/backend db:migrate && pnpm --filter @fops/backend db:seed
pnpm --filter @fops/backend test voc-foundation
```

Expected: `vocs` test suite PASS (5 tests). Other Slice 1/2 tests continue passing.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0010_slice3_voc_foundation.sql apps/backend/migrations/meta/ apps/backend/src/db/schema/voc.ts apps/backend/src/db/schema/index.ts apps/backend/src/db/__tests__/voc-foundation.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(slice3): migration 0010 — voc.vocs table + display_id helper + AA integrity trigger

- voc schema namespace, voc.vocs with FKs to workspaces/MS/AA/actors/teams.
- next_voc_display_id(workspace_id) returns 'VOC-####' (Q-DISPLAYID resolved).
- AA→primary_MS integrity trigger raises analytics_area_managed_system_mismatch.
- owner_user_id / owner_team_id XOR CHECK enforces single populated owner.
- Severity / status / triage / source_context enums encoded as CHECKs.
- Indexes for Inbox / My VOCs / Triage queue / active rows.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migration — three append-only conversation tables + reporter_id trigger + skip_reason CHECK + grants

**Files:**
- Modify: `apps/backend/migrations/0010_slice3_voc_foundation.sql` (append)
- Modify: `apps/backend/src/db/schema/voc.ts` (append three table defs)
- Modify: `apps/backend/src/db/__tests__/voc-foundation.integration.test.ts` (append conversation tests)

- [ ] **Step 1: Write failing tests (append to existing suite)**

```ts
// apps/backend/src/db/__tests__/voc-foundation.integration.test.ts (append)
import { createDb as createAppRoleDb } from '../client.js';

describe('Slice 3 conversation tables', () => {
  let vocId: string;
  let reporterId: string;
  let otherActorId: string;

  beforeAll(async () => {
    const v = await handle.db.execute(sql`select id, reporter_id from voc.vocs limit 1`);
    vocId = (v.rows[0] as { id: string; reporter_id: string }).id;
    reporterId = (v.rows[0] as { id: string; reporter_id: string }).reporter_id;
    const o = await handle.db.execute(sql`
      select id from core.actors where id <> ${reporterId} limit 1
    `);
    otherActorId = (o.rows[0] as { id: string }).id;
  });

  it('inserts a public_update with status pair', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_public_updates (
          voc_id, actor_id, body_rich_content,
          reporter_facing_status_before, reporter_facing_status_after
        ) values (
          ${vocId}, ${reporterId}, '{"type":"doc","content":[]}'::jsonb,
          'received', 'reviewing'
        )
      `),
    ).resolves.toBeDefined();
  });

  it('rejects skip_public_update=true with skip_reason shorter than 8 chars', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_public_updates (
          voc_id, actor_id, body_rich_content,
          reporter_facing_status_before, reporter_facing_status_after,
          skip_public_update, skip_reason
        ) values (
          ${vocId}, ${reporterId}, '{"type":"doc","content":[]}'::jsonb,
          'received', 'reviewing', true, 'short'
        )
      `),
    ).rejects.toThrow(/voc_public_updates_skip_reason_min_length/);
  });

  it('reporter_reply trigger rejects non-reporter actor', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_reporter_replies (voc_id, actor_id, body_rich_content)
        values (${vocId}, ${otherActorId}, '{"type":"doc","content":[]}'::jsonb)
      `),
    ).rejects.toThrow(/voc_reporter_reply_actor_must_be_reporter/);
  });

  it('reporter_reply accepts the reporter', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_reporter_replies (voc_id, actor_id, body_rich_content)
        values (${vocId}, ${reporterId}, '{"type":"doc","content":[]}'::jsonb)
      `),
    ).resolves.toBeDefined();
  });

  it('internal_comment accepts any actor', async () => {
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_internal_comments (voc_id, actor_id, body_rich_content)
        values (${vocId}, ${otherActorId}, '{"type":"doc","content":[]}'::jsonb)
      `),
    ).resolves.toBeDefined();
  });

  describe('append-only role grants (fops_app)', () => {
    let appHandle: Awaited<ReturnType<typeof createAppRoleDb>>;
    beforeAll(async () => {
      // Same DB; the seeded DATABASE_URL already runs as fops_app.
      appHandle = await createAppRoleDb(loadConfig().databaseUrl);
    });
    afterAll(async () => {
      await appHandle.pool.end();
    });

    it('rejects UPDATE on voc_public_updates from fops_app', async () => {
      const r = await appHandle.db.execute(sql`select id from voc.voc_public_updates limit 1`);
      const pid = (r.rows[0] as { id: string }).id;
      await expect(
        appHandle.db.execute(sql`update voc.voc_public_updates set skip_reason = 'x' where id = ${pid}`),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rejects DELETE on voc_internal_comments from fops_app', async () => {
      const r = await appHandle.db.execute(sql`select id from voc.voc_internal_comments limit 1`);
      const cid = (r.rows[0] as { id: string }).id;
      await expect(
        appHandle.db.execute(sql`delete from voc.voc_internal_comments where id = ${cid}`),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — conversation tables do not exist.

- [ ] **Step 3: Append to migration**

```sql
-- ───── voc.voc_public_updates ─────────────────────────────────────────
CREATE TABLE "voc"."voc_public_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "reporter_facing_status_before" text NOT NULL,
  "reporter_facing_status_after"  text NOT NULL,
  "skip_public_update" boolean NOT NULL DEFAULT false,
  "skip_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voc_public_updates_status_before_enum" CHECK ("reporter_facing_status_before" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "voc_public_updates_status_after_enum"  CHECK ("reporter_facing_status_after" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "voc_public_updates_skip_reason_min_length"
    CHECK ("skip_public_update" = false OR (length(coalesce("skip_reason", '')) >= 8))
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_public_updates_voc_created_idx"
  ON "voc"."voc_public_updates" ("voc_id", "created_at");
--> statement-breakpoint

-- ───── voc.voc_reporter_replies ───────────────────────────────────────
CREATE TABLE "voc"."voc_reporter_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_reporter_replies"
  ADD CONSTRAINT "voc_reporter_replies_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_reporter_replies"
  ADD CONSTRAINT "voc_reporter_replies_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_reporter_replies_voc_created_idx"
  ON "voc"."voc_reporter_replies" ("voc_id", "created_at");
--> statement-breakpoint

-- reporter_id trigger: actor must be the VOC's reporter.
CREATE OR REPLACE FUNCTION "voc"."voc_reporter_reply_actor_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_reporter uuid;
BEGIN
  SELECT reporter_id INTO v_reporter FROM voc.vocs WHERE id = NEW.voc_id;
  IF v_reporter IS NULL OR v_reporter <> NEW.actor_id THEN
    RAISE EXCEPTION 'voc_reporter_reply_actor_must_be_reporter'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "voc_reporter_reply_actor_check_trg"
  BEFORE INSERT ON "voc"."voc_reporter_replies"
  FOR EACH ROW EXECUTE FUNCTION "voc"."voc_reporter_reply_actor_check"();
--> statement-breakpoint

-- ───── voc.voc_internal_comments ──────────────────────────────────────
CREATE TABLE "voc"."voc_internal_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_internal_comments"
  ADD CONSTRAINT "voc_internal_comments_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_internal_comments"
  ADD CONSTRAINT "voc_internal_comments_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_internal_comments_voc_created_idx"
  ON "voc"."voc_internal_comments" ("voc_id", "created_at");
--> statement-breakpoint

-- ───── Append-only grants (ADR-0019 pattern). fops_app: SELECT + INSERT
--      only; UPDATE/DELETE denied. fops_admin retains DDL via its role.
GRANT SELECT, INSERT ON "voc"."voc_public_updates"   TO fops_app;
GRANT SELECT, INSERT ON "voc"."voc_reporter_replies" TO fops_app;
GRANT SELECT, INSERT ON "voc"."voc_internal_comments" TO fops_app;
--> statement-breakpoint
```

```ts
// apps/backend/src/db/schema/voc.ts (append)
import { boolean } from 'drizzle-orm/pg-core';

export const vocPublicUpdates = vocSchema.table(
  'voc_public_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id').notNull().references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => actors.id),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    reporterFacingStatusBefore: text('reporter_facing_status_before').notNull(),
    reporterFacingStatusAfter: text('reporter_facing_status_after').notNull(),
    skipPublicUpdate: boolean('skip_public_update').notNull().default(false),
    skipReason: text('skip_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_public_updates_voc_created_idx').on(t.vocId, t.createdAt),
  }),
);

export const vocReporterReplies = vocSchema.table(
  'voc_reporter_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id').notNull().references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => actors.id),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_reporter_replies_voc_created_idx').on(t.vocId, t.createdAt),
  }),
);

export const vocInternalComments = vocSchema.table(
  'voc_internal_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id').notNull().references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => actors.id),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_internal_comments_voc_created_idx').on(t.vocId, t.createdAt),
  }),
);
```

- [ ] **Step 4: Run migration + tests**

```bash
pnpm --filter @fops/backend db:reset && pnpm --filter @fops/backend db:migrate && pnpm --filter @fops/backend db:seed
pnpm --filter @fops/backend test voc-foundation
```

Expected: 7 new tests PASS (3 inserts, skip_reason CHECK, reporter trigger reject + accept, internal accept, 2 role-grant denies).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0010_slice3_voc_foundation.sql apps/backend/src/db/schema/voc.ts apps/backend/src/db/__tests__/voc-foundation.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(slice3): add VOC conversation tables — append-only, role-separated

- voc_public_updates with skip_reason >=8 CHECK when skip_public_update=true.
- voc_reporter_replies with trigger asserting actor_id = vocs.reporter_id.
- voc_internal_comments (any actor in workspace).
- fops_app gets SELECT+INSERT only; UPDATE/DELETE denied (ADR-0019).
- ON DELETE CASCADE from vocs so future archive cleanup is simple.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migration — `voc_attachments` polymorphic FK stub

**Files:**
- Modify: `apps/backend/migrations/0010_slice3_voc_foundation.sql` (append)
- Modify: `apps/backend/src/db/schema/voc.ts` (append)
- Modify: `apps/backend/src/db/__tests__/voc-foundation.integration.test.ts` (append)

- [ ] **Step 1: Write failing test**

```ts
describe('Slice 3 voc_attachments stub', () => {
  it('rejects both voc_id and comment_id populated', async () => {
    const v = await handle.db.execute(sql`select id from voc.vocs limit 1`);
    const c = await handle.db.execute(sql`select id from voc.voc_internal_comments limit 1`);
    const vid = (v.rows[0] as { id: string }).id;
    const cid = (c.rows[0] as { id: string }).id;
    const actor = await handle.db.execute(sql`select id from core.actors limit 1`);
    const aid = (actor.rows[0] as { id: string }).id;
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_attachments (
          voc_id, comment_id, comment_kind, name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id
        ) values (
          ${vid}, ${cid}, 'internal_comment', 'x.png', 100, 'image/png', 's3://x', ${aid}
        )
      `),
    ).rejects.toThrow(/voc_attachments_subject_xor/);
  });
  it('rejects voc_id with comment_kind populated', async () => {
    const v = await handle.db.execute(sql`select id from voc.vocs limit 1`);
    const vid = (v.rows[0] as { id: string }).id;
    const actor = await handle.db.execute(sql`select id from core.actors limit 1`);
    const aid = (actor.rows[0] as { id: string }).id;
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_attachments (voc_id, comment_kind, name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id)
        values (${vid}, 'public_update', 'x.png', 100, 'image/png', 's3://x', ${aid})
      `),
    ).rejects.toThrow(/voc_attachments_comment_kind_pair/);
  });
  it('accepts voc-scoped attachment', async () => {
    const v = await handle.db.execute(sql`select id from voc.vocs limit 1`);
    const vid = (v.rows[0] as { id: string }).id;
    const actor = await handle.db.execute(sql`select id from core.actors limit 1`);
    const aid = (actor.rows[0] as { id: string }).id;
    await expect(
      handle.db.execute(sql`
        insert into voc.voc_attachments (voc_id, name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id)
        values (${vid}, 'doc.pdf', 4096, 'application/pdf', 's3://b/x.pdf', ${aid})
      `),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run** — FAIL (table missing).

- [ ] **Step 3: Append migration**

```sql
-- ───── voc.voc_attachments (schema stub; storage endpoint deferred) ───
CREATE TABLE "voc"."voc_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid,
  "comment_id" uuid,
  "comment_kind" text,
  "name" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "storage_uri" text NOT NULL,
  "uploaded_by_actor_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voc_attachments_subject_xor"
    CHECK (("voc_id" IS NOT NULL)::int + ("comment_id" IS NOT NULL)::int = 1),
  CONSTRAINT "voc_attachments_comment_kind_pair"
    CHECK (("comment_id" IS NULL AND "comment_kind" IS NULL)
        OR ("comment_id" IS NOT NULL AND "comment_kind" IN ('public_update','reporter_reply','internal_comment')))
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments"
  ADD CONSTRAINT "voc_attachments_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments"
  ADD CONSTRAINT "voc_attachments_uploaded_by_actor_id_fk"
  FOREIGN KEY ("uploaded_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
-- NOTE: comment_id intentionally has no SQL-level FK because it spans three
-- tables. Service code enforces the target row exists; migration ships only
-- the discriminator + XOR. A future migration may add a partial FK per kind.
CREATE INDEX "voc_attachments_voc_idx" ON "voc"."voc_attachments" ("voc_id") WHERE "voc_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "voc_attachments_comment_idx" ON "voc"."voc_attachments" ("comment_id", "comment_kind") WHERE "comment_id" IS NOT NULL;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."voc_attachments" TO fops_app;
--> statement-breakpoint
```

```ts
// apps/backend/src/db/schema/voc.ts (append)
import { bigint } from 'drizzle-orm/pg-core';

export const vocAttachments = vocSchema.table(
  'voc_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id').references(() => vocs.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id'),
    commentKind: text('comment_kind'),
    name: text('name').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    storageUri: text('storage_uri').notNull(),
    uploadedByActorId: uuid('uploaded_by_actor_id').notNull().references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocIdx: index('voc_attachments_voc_idx').on(t.vocId),
    commentIdx: index('voc_attachments_comment_idx').on(t.commentId, t.commentKind),
    subjectXor: check(
      'voc_attachments_subject_xor',
      sql`(${t.vocId} is not null)::int + (${t.commentId} is not null)::int = 1`,
    ),
    commentKindPair: check(
      'voc_attachments_comment_kind_pair',
      sql`(${t.commentId} is null and ${t.commentKind} is null)
        or (${t.commentId} is not null and ${t.commentKind} in ('public_update','reporter_reply','internal_comment'))`,
    ),
  }),
);
```

- [ ] **Step 4: Run + verify** — 3 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0010_slice3_voc_foundation.sql apps/backend/src/db/schema/voc.ts apps/backend/src/db/__tests__/voc-foundation.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(slice3): voc_attachments polymorphic FK stub

Schema-only landing for VOC attachments per #12 Q1 resolution. Storage
upload endpoint deferred to attachment follow-up slice; this table lets
later wiring be additive. XOR CHECK ensures exactly one of voc_id /
comment_id is populated; comment_kind discriminator is paired with
comment_id.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migration — `reporter_facing_status_transitions` lookup + seeded rows + `nextReporterStates()` reader

**Files:**
- Modify: `apps/backend/migrations/0010_slice3_voc_foundation.sql` (final append)
- Modify: `apps/backend/src/db/schema/voc.ts` (append)
- Create: `apps/backend/src/modules/voc/transitions.ts`
- Create: `apps/backend/src/modules/voc/__tests__/transitions.integration.test.ts`

The seed rows mirror `docs/design-prototype/data.js · REPORTER_STATUS_TRANSITIONS` verbatim. Use the matrix dumped in this plan's source section as the authoritative input.

- [ ] **Step 1: Write failing test**

```ts
// apps/backend/src/modules/voc/__tests__/transitions.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '../../../db/client.js';
import { loadConfig } from '../../../config.js';
import { nextReporterStates } from '../transitions.js';

const handle = await createDb(loadConfig().databaseUrl);

afterAll(() => handle.pool.end());

describe('nextReporterStates', () => {
  it('mirrors prototype REPORTER_STATUS_TRANSITIONS for received', async () => {
    const r = await nextReporterStates('received', handle.db);
    expect(r.allowed.sort()).toEqual(['closed', 'reviewing'].sort());
    expect(r.forbidden).toEqual({
      resolved: '결과 확인 전에 해결됨으로 바꿀 수 없습니다.',
      prep: '먼저 검토를 시작해야 합니다.',
    });
  });

  it('returns the closed → reopened rule', async () => {
    const r = await nextReporterStates('closed', handle.db);
    expect(r.allowed).toEqual(['reopened']);
    expect(r.forbidden.resolved).toMatch(/이미 종료된/);
  });

  it('returns empty forbidden map for resolved', async () => {
    const r = await nextReporterStates('resolved', handle.db);
    expect(r.allowed.sort()).toEqual(['closed', 'reopened'].sort());
    expect(r.forbidden).toEqual({});
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement migration + seed rows + reader**

```sql
-- ───── voc.reporter_facing_status_transitions ─────────────────────────
-- Single source of truth for the reporter-facing status matrix per
-- docs/frontend/specs/voc.md §4.5. Backend nextReporterStates(current)
-- reads this table; service code MUST NOT hard-code transitions.
CREATE TABLE "voc"."reporter_facing_status_transitions" (
  "from_status" text NOT NULL,
  "to_status"   text NOT NULL,
  "allowed"     boolean NOT NULL,
  "forbidden_reason" text,
  PRIMARY KEY ("from_status", "to_status"),
  CONSTRAINT "rfst_from_enum" CHECK ("from_status" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "rfst_to_enum" CHECK ("to_status" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "rfst_allowed_no_reason" CHECK ("allowed" = false OR "forbidden_reason" IS NULL),
  CONSTRAINT "rfst_disallowed_has_reason" CHECK ("allowed" = true OR ("forbidden_reason" IS NOT NULL AND length("forbidden_reason") > 0))
);
--> statement-breakpoint
GRANT SELECT ON "voc"."reporter_facing_status_transitions" TO fops_app;
--> statement-breakpoint

-- Seed transition rows verbatim from docs/design-prototype/data.js.
INSERT INTO "voc"."reporter_facing_status_transitions" ("from_status","to_status","allowed","forbidden_reason") VALUES
  -- received
  ('received','reviewing',true, NULL),
  ('received','closed',   true, NULL),
  ('received','resolved', false,'결과 확인 전에 해결됨으로 바꿀 수 없습니다.'),
  ('received','prep',     false,'먼저 검토를 시작해야 합니다.'),
  -- reviewing
  ('reviewing','assigned',true, NULL),
  ('reviewing','progress',true, NULL),
  ('reviewing','closed',  true, NULL),
  ('reviewing','resolved',false,'담당자 배정 이후에 가능합니다.'),
  -- assigned
  ('assigned','progress', true, NULL),
  ('assigned','closed',   true, NULL),
  ('assigned','resolved', false,'처리가 완료되면 가능합니다.'),
  ('assigned','received', false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- progress
  ('progress','prep',     true, NULL),
  ('progress','resolved', true, NULL),
  ('progress','closed',   true, NULL),
  ('progress','received', false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- prep
  ('prep','resolved',     true, NULL),
  ('prep','progress',     true, NULL),
  ('prep','closed',       true, NULL),
  ('prep','received',     false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- resolved
  ('resolved','closed',   true, NULL),
  ('resolved','reopened', true, NULL),
  -- reopened
  ('reopened','progress', true, NULL),
  ('reopened','resolved', true, NULL),
  ('reopened','closed',   true, NULL),
  -- closed
  ('closed','reopened',   true, NULL),
  ('closed','resolved',   false,'이미 종료된 건입니다. 다시 해결됨으로 되돌리려면 먼저 다시 처리 중으로 전환하세요.');
--> statement-breakpoint
```

```ts
// apps/backend/src/db/schema/voc.ts (append)
import { boolean as drizzleBoolean } from 'drizzle-orm/pg-core';
import { primaryKey } from 'drizzle-orm/pg-core';

export const reporterFacingStatusTransitions = vocSchema.table(
  'reporter_facing_status_transitions',
  {
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    allowed: drizzleBoolean('allowed').notNull(),
    forbiddenReason: text('forbidden_reason'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fromStatus, t.toStatus] }),
  }),
);
```

```ts
// apps/backend/src/modules/voc/transitions.ts
import { eq } from 'drizzle-orm';

import { reporterFacingStatusTransitions } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

export interface ReporterStateOptions {
  allowed: string[];
  forbidden: Record<string, string>;
}

export async function nextReporterStates(currentStatus: string, tx: Tx): Promise<ReporterStateOptions> {
  const rows = await tx
    .select()
    .from(reporterFacingStatusTransitions)
    .where(eq(reporterFacingStatusTransitions.fromStatus, currentStatus));

  const allowed: string[] = [];
  const forbidden: Record<string, string> = {};
  for (const r of rows) {
    if (r.allowed) {
      allowed.push(r.toStatus);
    } else if (r.forbiddenReason) {
      forbidden[r.toStatus] = r.forbiddenReason;
    }
  }
  return { allowed, forbidden };
}
```

- [ ] **Step 4: Run + verify** — transition tests + previously failing tests PASS. Run the full backend suite:

```bash
pnpm --filter @fops/backend db:reset && pnpm --filter @fops/backend db:migrate && pnpm --filter @fops/backend db:seed
pnpm --filter @fops/backend test
```

Expected: previously-green Slice 1/2 suites stay green; new Slice 3 DDL + transitions tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0010_slice3_voc_foundation.sql apps/backend/src/db/schema/voc.ts apps/backend/src/modules/voc/transitions.ts apps/backend/src/modules/voc/__tests__/transitions.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(slice3): seed reporter-facing status transition matrix + reader

Mirrors docs/design-prototype/data.js · REPORTER_STATUS_TRANSITIONS
verbatim into voc.reporter_facing_status_transitions. nextReporterStates
service reads the table; never hard-coded in code per spec §4.5.

Refs #12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Seed extension — deterministic Slice 3 VOC fixtures + `permission_decisions` envelopes

**Files:**
- Create: `apps/backend/src/seed/voc-fixtures.ts`
- Create: `apps/backend/src/seed/__tests__/voc-seed.integration.test.ts`
- Modify: `apps/backend/src/seed/index.ts`
- Modify: `apps/backend/src/db/__tests__/seed.integration.test.ts`

Determinism requirements:
- Stable UUIDs: use a UUID v5 namespace derived from a constant Slice 3 namespace UUID + a deterministic seed string per row (`'voc-1'`, `'voc-1:public-update-1'`, etc.). Avoids per-run randomness without sacrificing the v5 standard.
- Stable timestamps for `evaluated_at`: pin to `'2026-05-17T10:00:00.000Z'` (fixed constant).
- Idempotency: delete-and-recreate Slice 3 rows scoped by workspace + a sentinel column (e.g. `title` prefix `'[seed]'`) on each invocation; Slice 1 / 2 untouched.

Coverage matrix (12 VOCs):
1. status=received, triage=untriaged, severity=null, source=direct_use, owner=null
2. status=reviewing, triage=untriaged, severity=null, source=proxy_report, owner=user
3. status=assigned, triage=triaged, severity=low, source=stakeholder_request, owner=team
4. status=progress, triage=triaged, severity=medium, source=operational_discovery, owner=user
5. status=prep, triage=triaged, severity=high, source=direct_use, owner=team
6. status=resolved, triage=triaged, severity=critical, source=direct_use, owner=user
7. status=reopened, triage=triaged, severity=medium, source=direct_use, owner=user
8. status=closed, triage=triaged, severity=low, source=proxy_report, owner=team
9. status=received, triage=needs_more_information, severity=null, source=direct_use, owner=null
10. status=received, triage=dismissed_not_actionable, severity=null, source=direct_use, owner=null
11. status=progress, triage=triaged, severity=high, source=direct_use, owner=user, permission_decisions.linkedFinding = `request_access` (Developer-outside-scope)
12. status=resolved, triage=triaged, severity=medium, source=direct_use, owner=user, permission_decisions.linkedFinding = `summary_visible` (restricted finding same MS)

Conversation: each VOC gets one of each visibility (one public_update, one reporter_reply by the reporter, one internal_comment) — 36 rows total.

**Permission-decisions storage caveat:** the issue says the seed must hydrate `permission_decisions` envelopes in the shape the frontend consumes. The `vocs` table does NOT have a `permission_decisions` column — that envelope is computed server-side per actor at request time (per spec §4.2). So the seed must ship **two artefacts**:
1. The deterministic VOCs that the permission service can resolve into those envelopes when the FE later queries.
2. A SQL view or test-facing fixture function that returns the envelopes by VOC id, asserting determinism.

The simplest path that meets `pnpm seed produces ... deterministically (run twice → identical UUIDs, identical decision_ids, identical evaluated_at)` is: seed writes the envelopes into a new table `voc.voc_permission_decisions_seed_fixture(voc_id uuid PK, envelope jsonb)`. This is a **seed-only fixture table** (no DDL grants for fops_app DML; only SELECT). It is NOT the production permission cache — production resolves at request time. The fixture exists so FE snapshot tests in S3-008 can rely on stable decision shapes during seed-only runs. Add a comment in the migration declaring this.

> **Plan note:** this seed-only fixture table is added via *one extra DDL block appended to migration 0010*, NOT via a new migration. Append after Task 6's transitions table block. Acceptance criterion `2 permission_decisions.linkedFinding envelopes ... state values` is asserted against this table.

- [ ] **Step 1: Append fixture DDL to migration 0010**

```sql
-- ───── voc.voc_permission_decisions_seed_fixture ──────────────────────
-- Seed-only fixture table. Holds the deterministic permission_decisions
-- envelopes the seed writes for two specific VOC fixtures (per #12
-- acceptance criterion). Production permission resolution does NOT use
-- this table — the real permission service computes envelopes per request
-- against permission_grants / permission_denies. This table exists so FE
-- snapshot tests can pin stable decision_ids and evaluated_at values
-- without re-running the live permission service.
CREATE TABLE "voc"."voc_permission_decisions_seed_fixture" (
  "voc_id" uuid PRIMARY KEY,
  "envelope" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_permission_decisions_seed_fixture"
  ADD CONSTRAINT "vpd_seed_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."voc_permission_decisions_seed_fixture" TO fops_app;
--> statement-breakpoint
```

- [ ] **Step 2: Write failing seed test**

```ts
// apps/backend/src/seed/__tests__/voc-seed.integration.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { createDb } from '../../db/client.js';
import { loadConfig } from '../../config.js';
import { runSeed } from '../index.js';

const handle = await createDb(loadConfig().databaseUrl);
afterAll(() => handle.pool.end());

describe('Slice 3 seed determinism + coverage', () => {
  it('produces identical VOC ids on two consecutive runs', async () => {
    await runSeed(handle);
    const first = await handle.db.execute(sql`select id from voc.vocs order by display_id`);
    await runSeed(handle);
    const second = await handle.db.execute(sql`select id from voc.vocs order by display_id`);
    expect(first.rows.map((r) => (r as { id: string }).id)).toEqual(
      second.rows.map((r) => (r as { id: string }).id),
    );
  });

  it('covers every reporter_facing_status', async () => {
    const r = await handle.db.execute(sql`
      select reporter_facing_status from voc.vocs group by reporter_facing_status
    `);
    expect(r.rows.map((x) => (x as { reporter_facing_status: string }).reporter_facing_status).sort()).toEqual(
      ['assigned', 'closed', 'prep', 'progress', 'received', 'reopened', 'resolved', 'reviewing'].sort(),
    );
  });

  it('covers every triage_state', async () => {
    const r = await handle.db.execute(sql`select triage_state from voc.vocs group by triage_state`);
    const states = r.rows.map((x) => (x as { triage_state: string }).triage_state).sort();
    expect(states).toEqual(['dismissed_not_actionable', 'needs_more_information', 'triaged', 'untriaged'].sort());
  });

  it('covers every severity plus one NULL', async () => {
    const r = await handle.db.execute(sql`
      select severity, count(*)::int as n from voc.vocs group by severity order by severity nulls first
    `);
    const counts = Object.fromEntries(
      r.rows.map((x) => {
        const row = x as { severity: string | null; n: number };
        return [row.severity ?? 'null', row.n];
      }),
    );
    expect(counts).toMatchObject({
      null: expect.any(Number),
      low: expect.any(Number),
      medium: expect.any(Number),
      high: expect.any(Number),
      critical: expect.any(Number),
    });
  });

  it('covers every source_context', async () => {
    const r = await handle.db.execute(sql`select source_context from voc.vocs group by source_context`);
    expect(r.rows.map((x) => (x as { source_context: string }).source_context).sort()).toEqual(
      ['direct_use', 'operational_discovery', 'proxy_report', 'stakeholder_request'].sort(),
    );
  });

  it('covers both owner forms (user, team, null)', async () => {
    const u = await handle.db.execute(sql`select count(*)::int as n from voc.vocs where owner_user_id is not null`);
    const t = await handle.db.execute(sql`select count(*)::int as n from voc.vocs where owner_team_id is not null`);
    const n = await handle.db.execute(sql`select count(*)::int as n from voc.vocs where owner_user_id is null and owner_team_id is null`);
    expect((u.rows[0] as { n: number }).n).toBeGreaterThan(0);
    expect((t.rows[0] as { n: number }).n).toBeGreaterThan(0);
    expect((n.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('seeds three conversation entries per VOC', async () => {
    const r = await handle.db.execute(sql`
      select v.id,
        (select count(*) from voc.voc_public_updates pu where pu.voc_id = v.id) as pu,
        (select count(*) from voc.voc_reporter_replies rr where rr.voc_id = v.id) as rr,
        (select count(*) from voc.voc_internal_comments ic where ic.voc_id = v.id) as ic
      from voc.vocs v
    `);
    for (const row of r.rows as Array<{ pu: string | number; rr: string | number; ic: string | number }>) {
      expect(Number(row.pu)).toBeGreaterThanOrEqual(1);
      expect(Number(row.rr)).toBeGreaterThanOrEqual(1);
      expect(Number(row.ic)).toBeGreaterThanOrEqual(1);
    }
  });

  it('writes exactly two linkedFinding decision fixtures with the right states', async () => {
    const r = await handle.db.execute(sql`select envelope from voc.voc_permission_decisions_seed_fixture`);
    const envelopes = r.rows.map((row) => (row as { envelope: { linkedFinding?: { state: string } } }).envelope);
    expect(envelopes).toHaveLength(2);
    const states = envelopes.map((e) => e.linkedFinding?.state).sort();
    expect(states).toEqual(['request_access', 'summary_visible']);
    // determinism — decision_id is the same on a re-run
    const ids = await handle.db.execute(sql`
      select envelope->'linkedFinding'->>'decision_id' as id from voc.voc_permission_decisions_seed_fixture order by id
    `);
    await runSeed(handle);
    const ids2 = await handle.db.execute(sql`
      select envelope->'linkedFinding'->>'decision_id' as id from voc.voc_permission_decisions_seed_fixture order by id
    `);
    expect(ids.rows).toEqual(ids2.rows);
  });
});
```

- [ ] **Step 3: Implement `voc-fixtures.ts`**

```ts
// apps/backend/src/seed/voc-fixtures.ts
import { createHash } from 'node:crypto';

import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { DbHandle } from '../db/client.js';
import {
  vocs,
  vocPublicUpdates,
  vocReporterReplies,
  vocInternalComments,
} from '../db/schema/voc.js';
import { actors, analyticsAreas, managedSystems, teams } from '../db/schema/core.js';

// Stable UUID v5-style generator. We don't have a uuid lib in @fops/backend
// today; sha1 of "ns:label" → first 32 hex chars formatted as a UUID with
// version 5 bits set yields the same value across runs. Used only by seed.
const NAMESPACE = 'fops-slice3-voc';
function stableUuid(label: string): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${label}`).digest('hex').slice(0, 32);
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

const SEED_EVALUATED_AT = '2026-05-17T10:00:00.000Z';
const RICH_EMPTY = { type: 'doc', content: [] } as const;

interface VocSeedRow {
  label: string; // stable namespace label for uuid
  status: 'received' | 'reviewing' | 'assigned' | 'progress' | 'prep' | 'resolved' | 'reopened' | 'closed';
  triage: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  source: 'direct_use' | 'proxy_report' | 'operational_discovery' | 'stakeholder_request';
  owner: 'user' | 'team' | 'none';
  decision?: { kind: 'linkedFinding'; state: 'request_access' | 'summary_visible'; reason: string };
}

const SEED_ROWS: VocSeedRow[] = [
  { label: 'voc-01', status: 'received',  triage: 'untriaged',                  severity: null,       source: 'direct_use',             owner: 'none' },
  { label: 'voc-02', status: 'reviewing', triage: 'untriaged',                  severity: null,       source: 'proxy_report',           owner: 'user' },
  { label: 'voc-03', status: 'assigned',  triage: 'triaged',                    severity: 'low',      source: 'stakeholder_request',    owner: 'team' },
  { label: 'voc-04', status: 'progress',  triage: 'triaged',                    severity: 'medium',   source: 'operational_discovery',  owner: 'user' },
  { label: 'voc-05', status: 'prep',      triage: 'triaged',                    severity: 'high',     source: 'direct_use',             owner: 'team' },
  { label: 'voc-06', status: 'resolved',  triage: 'triaged',                    severity: 'critical', source: 'direct_use',             owner: 'user' },
  { label: 'voc-07', status: 'reopened',  triage: 'triaged',                    severity: 'medium',   source: 'direct_use',             owner: 'user' },
  { label: 'voc-08', status: 'closed',    triage: 'triaged',                    severity: 'low',      source: 'proxy_report',           owner: 'team' },
  { label: 'voc-09', status: 'received',  triage: 'needs_more_information',     severity: null,       source: 'direct_use',             owner: 'none' },
  { label: 'voc-10', status: 'received',  triage: 'dismissed_not_actionable',   severity: null,       source: 'direct_use',             owner: 'none' },
  { label: 'voc-11', status: 'progress',  triage: 'triaged',                    severity: 'high',     source: 'direct_use',             owner: 'user',
    decision: { kind: 'linkedFinding', state: 'request_access', reason: 'developer_outside_managed_system_scope' } },
  { label: 'voc-12', status: 'resolved',  triage: 'triaged',                    severity: 'medium',   source: 'direct_use',             owner: 'user',
    decision: { kind: 'linkedFinding', state: 'summary_visible', reason: 'restricted_finding_same_managed_system' } },
];

export interface VocSeedResult {
  vocsInserted: number;
  conversationRowsInserted: number;
  permissionFixturesInserted: number;
}

export async function seedSlice3Vocs(handle: DbHandle, workspaceId: string): Promise<VocSeedResult> {
  return handle.db.transaction(async (tx) => {
    // Idempotency: delete any prior seed rows in this workspace before
    // reinserting. Cascade handles conversation + attachments + fixture
    // rows because vocs FKs use ON DELETE cascade.
    await tx
      .delete(vocs)
      .where(and(eq(vocs.workspaceId, workspaceId), sql`${vocs.title} like '[seed]%'`));

    // Reuse the first managed_system + a non-null AA matched to that MS.
    const [ms] = await tx
      .select({ id: managedSystems.id })
      .from(managedSystems)
      .where(eq(managedSystems.workspaceId, workspaceId))
      .limit(1);
    if (!ms) throw new Error('seed: no managed_systems row');

    const [aa] = await tx
      .select({ id: analyticsAreas.id })
      .from(analyticsAreas)
      .where(and(eq(analyticsAreas.workspaceId, workspaceId), eq(analyticsAreas.managedSystemId, ms.id)))
      .limit(1);

    const [reporter] = await tx
      .select({ id: actors.id })
      .from(actors)
      .where(eq(actors.workspaceId, workspaceId))
      .limit(1);
    if (!reporter) throw new Error('seed: no actors row');

    // Insert a seed-only team if none exists; reuse if already present.
    let seedTeamId: string | undefined;
    const [existingTeam] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), eq(teams.name, '[seed] VOC owner team')))
      .limit(1);
    if (existingTeam) {
      seedTeamId = existingTeam.id;
    } else {
      const [inserted] = await tx
        .insert(teams)
        .values({ workspaceId, name: '[seed] VOC owner team' })
        .returning({ id: teams.id });
      seedTeamId = inserted.id;
    }

    let convRows = 0;
    let fixtureRows = 0;
    for (const r of SEED_ROWS) {
      const vocId = stableUuid(r.label);
      await tx.insert(vocs).values({
        id: vocId,
        workspaceId,
        displayId: `VOC-SEED-${r.label.slice(-2)}`, // bypass sequence — fixture rows use deterministic slug
        primaryManagedSystemId: ms.id,
        analyticsAreaId: aa?.id ?? null,
        reporterId: reporter.id,
        title: `[seed] ${r.label} ${r.status}`,
        descriptionRichContent: RICH_EMPTY,
        severity: r.severity,
        reporterFacingStatus: r.status,
        triageState: r.triage,
        ownerUserId: r.owner === 'user' ? reporter.id : null,
        ownerTeamId: r.owner === 'team' ? seedTeamId! : null,
        sourceContext: r.source,
      });

      // One of each conversation visibility per VOC.
      await tx.insert(vocPublicUpdates).values({
        id: stableUuid(`${r.label}:public-update-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
        reporterFacingStatusBefore: r.status,
        reporterFacingStatusAfter: r.status,
      });
      await tx.insert(vocReporterReplies).values({
        id: stableUuid(`${r.label}:reporter-reply-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
      });
      await tx.insert(vocInternalComments).values({
        id: stableUuid(`${r.label}:internal-comment-1`),
        vocId,
        actorId: reporter.id,
        bodyRichContent: RICH_EMPTY,
      });
      convRows += 3;

      if (r.decision) {
        await tx.execute(sql`
          insert into voc.voc_permission_decisions_seed_fixture (voc_id, envelope) values (
            ${vocId},
            ${JSON.stringify({
              linkedFinding: {
                decision_id: stableUuid(`${r.label}:decision:linkedFinding`),
                state: r.decision.state,
                evaluated_at: SEED_EVALUATED_AT,
                reason: r.decision.reason,
              },
            })}::jsonb
          )
        `);
        fixtureRows += 1;
      }
    }

    return { vocsInserted: SEED_ROWS.length, conversationRowsInserted: convRows, permissionFixturesInserted: fixtureRows };
  });
}
```

```ts
// apps/backend/src/seed/index.ts — call into seedSlice3Vocs after the
// Slice 2 baseline runs. Extend SeedResult with VOC counts.
//
// At the end of runSeed(), after the existing Slice 2 inserts:
import { seedSlice3Vocs } from './voc-fixtures.js';
// ...
const slice3 = await seedSlice3Vocs(handle, workspaceId);
return {
  ...existing,
  vocsInserted: slice3.vocsInserted,
  conversationRowsInserted: slice3.conversationRowsInserted,
  permissionFixturesInserted: slice3.permissionFixturesInserted,
};

// Extend SeedResult:
export interface SeedResult {
  workspaceId: string;
  workspaceInserted: boolean;
  actorsInserted: number;
  managedSystemsInserted: number;
  analyticsAreasInserted: number;
  vocsInserted: number;
  conversationRowsInserted: number;
  permissionFixturesInserted: number;
}
```

> **Note on `displayId` in seed:** the SEED rows bypass the `next_voc_display_id()` sequence to keep slugs deterministic across DB resets. Production VOC creation in S3-002 will call `next_voc_display_id()`; the integration test in Task 3 already covers the sequence behavior on non-seed inserts.

- [ ] **Step 4: Run seed twice and verify tests pass**

```bash
pnpm --filter @fops/backend db:reset && pnpm --filter @fops/backend db:migrate && pnpm --filter @fops/backend db:seed && pnpm --filter @fops/backend db:seed
pnpm --filter @fops/backend test voc-seed
pnpm --filter @fops/backend test seed.integration
```

Expected: all coverage + determinism + envelope tests PASS. Existing seed.integration.test.ts updated to assert new SeedResult fields.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0010_slice3_voc_foundation.sql apps/backend/src/seed/voc-fixtures.ts apps/backend/src/seed/index.ts apps/backend/src/seed/__tests__/voc-seed.integration.test.ts apps/backend/src/db/__tests__/seed.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(slice3): deterministic Slice 3 VOC seed + permission decision fixtures

12 VOCs cover every reporter_facing_status, triage_state, severity, and
source_context, plus user/team/null owner forms. Three conversation rows
per VOC (one of each visibility). Two VOCs ship a linkedFinding
permission decision fixture (request_access, summary_visible) with
stable decision_ids and pinned evaluated_at — frontend snapshot tests
in S3-008 can rely on these.

Seed-only fixture table voc.voc_permission_decisions_seed_fixture is
NOT a production permission cache; comment in migration 0010 makes that
explicit.

Refs #12, resolves spec Q6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final gate — `pnpm typecheck`, `pnpm check:boundaries`, `pnpm test`

**Files:** none modified; fix-on-fail only.

- [ ] **Step 1: Run the full gate**

```bash
pnpm typecheck
pnpm check:boundaries
pnpm test
```

- [ ] **Step 2: Fix any failures**

Typecheck failures: missing exports / type-narrowed errors. `check:boundaries` failures: an unauthorized import path. `test` failures: any of the suites above.

If a failure is found, fix it in a small follow-up commit referencing #12.

- [ ] **Step 3: If clean, push branch (do NOT close issue per AGENTS.md orchestration rules)**

```bash
git push origin main
```

(Per memory: agent does **not** close issues. User closes after verifying.)

- [ ] **Step 4: Verify in GitHub**

```bash
gh run watch  # if CI is wired
gh issue view 12
```

---

## Acceptance Criteria — Spec ↔ Plan Mapping

| AC | Covered by |
|---|---|
| migrations land; `pnpm migrate` applies cleanly | Tasks 3–6 (one file `0010_slice3_voc_foundation.sql`) |
| `display_id` via `next_voc_display_id`; 3 sequential slugs test | Task 3 (sequence + test) |
| AA→MS integrity trigger | Task 3 (`vocs_analytics_area_integrity_trg`) |
| `owner_user_id`/`owner_team_id` XOR | Task 3 (`vocs_owner_xor`) |
| conv tables grant SELECT+INSERT only; UPDATE/DELETE denied | Task 4 |
| `voc_reporter_replies.actor_id = vocs.reporter_id` trigger | Task 4 |
| `skip_reason ≥ 8` when `skip_public_update = true` | Task 4 (CHECK) |
| transition table seeded; `nextReporterStates` matches prototype | Task 6 |
| 10 audit detail schemas + emit-helpers receive `Tx` | Task 2 (emit-helpers documented; service code wires `Tx` in S3-002 — this task only ships schemas; **note:** see "Out of scope" — issue says “emit-helpers accept Tx”, but emit-helpers proper live alongside service code in S3-002. This task ships the **schema** part, and the emit-helper signature is locked via type alias in `audit/voc.ts`.) |
| `PermissionDecision` type + envelope exported, consumed by seed | Tasks 1 + 7 |
| `pnpm seed` deterministic; 2 envelopes correct | Task 7 |
| `pnpm typecheck`, `pnpm check:boundaries`, `pnpm test` clean | Task 8 |
| no HTTP route changes | Verified by absence — none of `apps/backend/src/modules/voc/routes.ts` or controllers are touched |

**Out-of-scope items per issue:** HTTP routes (S3-002..S3-005), attachment storage endpoint, `triage_state_review_postponed_at` write path, rich-content sanitizer service, cluster CRUD, FE work. Plan does not touch these.

---

## Self-Review

1. **Spec coverage:** every acceptance criterion has a task. The emit-helper requirement is the only nuance — issue says emit-helpers must receive `Tx`. This plan lands the **schemas** in `@fops/shared` (Task 2) and defers the helpers (which call into `audit_log`) to the corresponding application service slices (S3-002..S3-005). If reviewers prefer the helper stubs to land here, Task 2 grows by a small `audit/voc.ts` `emitVocCreated(tx, detail)` export — flagged for the executor to confirm.
2. **Placeholder scan:** no TBD / placeholder text. SQL and TS bodies are complete.
3. **Type consistency:** `nextReporterStates(currentStatus, tx)` signature matches between schema, service, and test. `PermissionDecision` shape matches across `@fops/shared`, seed fixture, and tests.
4. **One open ambiguity for the executor:** the migration journal entry — Drizzle 7's journal format may require a `0010_snapshot.json`. If `pnpm migrate` errors because the journal mismatch, the executor regenerates via `pnpm --filter @fops/backend drizzle-kit generate --custom 0010_slice3_voc_foundation` or copies `0004_snapshot.json` and updates the index. Not a plan blocker.

---

## Execution

Subagent-driven per task. Two-stage review between tasks: (a) human reads the diff, (b) `pnpm test` runs on a fresh DB. Tasks ship in dependency order:

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

Each subagent receives this plan + the issue body. After every commit, ask the orchestrator (human) to confirm before dispatching the next task.
