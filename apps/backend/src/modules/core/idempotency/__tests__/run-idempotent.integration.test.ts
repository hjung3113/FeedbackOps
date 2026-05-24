import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { HttpError } from '../../../../lib/errors.js';
import { createIdempotencyService } from '../idempotency-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('idempotencyService.runIdempotent', () => {
  let handle: DbHandle;
  let actorId: string;

  beforeAll(async () => {
    handle = createDb(APP_URL);

    const actorRows = await handle.db.execute<{ id: string }>(sql`
      SELECT id FROM core.actors
      WHERE workspace_id = ${WORKSPACE_ID}
        AND external_id = 'mock-admin-1'
    `);
    actorId = (actorRows as unknown as { rows: { id: string }[] }).rows[0]?.id ?? '';
    expect(actorId).toBeTruthy();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('runs the handler once, records the response, and replays matching retries', async () => {
    const svc = createIdempotencyService();
    const key = randomUUID();
    const requestHash = 'run-idempotent-hash';
    const body = { ok: true, id: randomUUID() };
    const handler = vi.fn(async () => ({ status: 201, body }));
    const replayHandler = vi.fn(async () => ({ status: 201, body: { ok: false } }));

    try {
      const first = await handle.db.transaction((tx) =>
        svc.runIdempotent(tx, actorId, key, requestHash, handler),
      );
      const replay = await handle.db.transaction((tx) =>
        svc.runIdempotent(tx, actorId, key, requestHash, replayHandler),
      );

      expect(first).toEqual({ status: 201, body });
      expect(replay).toEqual({ status: 201, body });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(replayHandler).not.toHaveBeenCalled();
    } finally {
      await handle.db.execute(sql`
        DELETE FROM core.idempotency_keys WHERE actor_id = ${actorId} AND key = ${key}
      `);
    }
  });

  it('rejects reused keys with a different request hash before running the handler', async () => {
    const svc = createIdempotencyService();
    const key = randomUUID();
    const handler = vi.fn(async () => ({ status: 201, body: { ok: true } }));

    try {
      await handle.db.transaction((tx) =>
        svc.runIdempotent(tx, actorId, key, 'original-hash', handler),
      );

      await expect(
        handle.db.transaction((tx) =>
          svc.runIdempotent(tx, actorId, key, 'changed-hash', handler),
        ),
      ).rejects.toMatchObject({
        code: 'conflict.idempotency_key_reuse',
      } satisfies Partial<HttpError>);

      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      await handle.db.execute(sql`
        DELETE FROM core.idempotency_keys WHERE actor_id = ${actorId} AND key = ${key}
      `);
    }
  });
});
