import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createEntityLinksService } from '../../entity-links/service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createFindingsService, type FindingsService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[create-finding-display-id] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('finding display_id assignment (#142)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let findingsService: FindingsService;
  const workspaceId = randomUUID();
  let adminActorId: string | null = null;
  let managedSystemId: string | null = null;
  let vocId: string | null = null;

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const auditService = createAuditService();
    const checkService = createCheckService({ db: dbHandle.db });
    findingsService = createFindingsService({
      db: dbHandle.db,
      auditService,
      checkService,
      idempotencyService: createIdempotencyService(),
      entityLinksService: createEntityLinksService({
        db: dbHandle.db,
        checkService,
        auditService,
      }),
    });

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Finding Display ID Test Workspace',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `finding-display-admin-${workspaceId}`,
        `finding-display-${workspaceId}@local`,
        'Finding Display Admin',
      ],
    );
    adminActorId = actor.rows[0]?.id ?? null;
    if (!adminActorId) throw new Error('seed admin actor failed');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'finding-display-ms', 'Finding Display MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? null;
    if (!managedSystemId) throw new Error('seed managed system failed');

    const voc = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.vocs (
          workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state
        )
       values (
          $1, $2, $3, voc.next_voc_display_id($1::uuid), 'Finding source VOC',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged'
        )
       returning id`,
      [workspaceId, managedSystemId, adminActorId],
    );
    vocId = voc.rows[0]?.id ?? null;
    if (!vocId) throw new Error('seed source voc failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.entity_links where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from finding.findings where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from voc.vocs where workspace_id = $1`, [workspaceId]);
      if (adminActorId) {
        await migrateHandle.pool.query(`delete from core.idempotency_keys where actor_id = $1`, [
          adminActorId,
        ]);
      }
      await migrateHandle.pool.query(
        `delete from core.managed_systems where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.display_counters where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.workspaces where id = $1`, [workspaceId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('assigns FIN display_id values to successive finding creations in one workspace', async () => {
    if (!adminActorId || !managedSystemId || !vocId) throw new Error('seed IDs missing');
    const actor = {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };

    const first = await findingsService.createFindingFromVoc({
      actor,
      vocId,
      input: {
        title: 'First finding',
        summary: 'First display-id finding summary',
        severity: 'medium',
        primary_managed_system_id: managedSystemId,
      },
      idempotencyKey: randomUUID(),
      requestHash: 'create-finding-display-id:first',
    });
    const second = await findingsService.createFindingFromVoc({
      actor,
      vocId,
      input: {
        title: 'Second finding',
        summary: 'Second display-id finding summary',
        severity: 'medium',
        primary_managed_system_id: managedSystemId,
      },
      idempotencyKey: randomUUID(),
      requestHash: 'create-finding-display-id:second',
    });

    expect(first.body.display_id).toBe('FIN-1000');
    expect(second.body.display_id).toBe('FIN-1001');
  });
});
