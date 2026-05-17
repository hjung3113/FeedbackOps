// Slice 3 prologue H3: pin the AA register defence-in-depth branch that
// rejects a foreign-workspace parent Managed System with 404 not_found.record
// (analytics-area-service.ts ~L271-273).
//
// Why service-level and not HTTP-level: in MVP single-tenant mode the
// /analytics-areas POST route is guarded by `requireWorkspace`, which is
// env-bound to a single workspace. A workspace-two session is rejected with
// 403 auth.workspace_mismatch BEFORE control reaches the service, making
// this branch unreachable via `app.inject`. The service-layer check is the
// second line of defence that becomes load-bearing once multi-tenancy
// lands. We pin it here directly so a future refactor cannot silently drop
// the workspace_id comparison on the parent-MS lookup.
//
// Calls analyticsAreaService.registerAnalyticsArea with a synthesised
// workspace-two ActorContext and the workspace-one tableau MS id seeded by
// runSeed.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb, type DbHandle } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import { runSeed } from '../../../seed/index.js';
import {
  seedSecondWorkspace,
  type SecondWorkspaceSeed,
} from '../../../test-support/seed-second-workspace.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService, type ActorContext } from '../../permissions/check-service.js';
import {
  createAnalyticsAreaService,
  type AnalyticsAreaService,
} from '../analytics-area-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)(
  'AA register service-level rejection for foreign-workspace parent MS (H3)',
  () => {
    let handle: DbHandle;
    let second: SecondWorkspaceSeed;
    let tableauMsId: string;
    let aaService: AnalyticsAreaService;

    beforeAll(async () => {
      handle = createDb(APP_URL);
      await runSeed(handle);
      second = await seedSecondWorkspace(handle);

      const rows = await handle.db.execute<{ id: string }>(
        sql`SELECT id FROM core.managed_systems
              WHERE slug = 'tableau' AND workspace_id = ${WORKSPACE_ID}`,
      );
      const msId = (rows as unknown as { rows: { id: string }[] }).rows[0]?.id;
      if (!msId) {
        throw new Error(
          "seed precondition failed: no 'tableau' MS found in workspace-one — runSeed should have created it",
        );
      }
      tableauMsId = msId;

      const checkService = createCheckService({ db: handle.db });
      const auditService = createAuditService();
      const idempotencyService = createIdempotencyService();
      aaService = createAnalyticsAreaService({
        db: handle.db,
        checkService,
        auditService,
        idempotencyService,
      });
    });

    afterAll(async () => {
      await handle.close();
    });

    it('throws 404 not_found.record when parent MS lives in another workspace', async () => {
      const wkTwoAdmin: ActorContext = {
        actor_id: second.adminActorId,
        workspace_id: second.workspaceId,
        role_level: 'admin',
      };

      const body = {
        slug: `cross-aa-${randomUUID().slice(0, 8)}`,
        name: 'Cross AA H3',
        managed_system_id: tableauMsId, // workspace-ONE MS
      };

      await expect(aaService.registerAnalyticsArea(wkTwoAdmin, body, {})).rejects.toBeInstanceOf(
        HttpError,
      );
      await expect(aaService.registerAnalyticsArea(wkTwoAdmin, body, {})).rejects.toMatchObject({
        code: 'not_found.record',
      });
    });
  },
);
