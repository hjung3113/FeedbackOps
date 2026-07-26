// #168 step 3 — voc.embed_voc handler against the real voc.voc_embeddings
// table (ADR-0034 D2/D6). Covers idempotence, in-place content refresh,
// version coexistence, and the disabled-provider contract.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.
// Provider: always the deterministic step-2 fake, wrapped in a call counter.
// No network, no API key.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { createDisabledEmbeddingProvider } from '../../embedding/disabled.js';
import { createFakeEmbeddingProvider } from '../../embedding/fake.js';
import type { EmbeddingProvider } from '../../embedding/port.js';
import { selectVocsNeedingEmbedding, upsertVocEmbedding } from '../../embedding/repo.js';
import { deriveVocEmbeddingInput } from '../../embedding/text.js';
import { insertMsDirectly, insertVocDirectly, uid } from '../../__tests__/_seed-helpers.js';
import { embedVoc } from '../embed-voc.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-embed-voc';
const ACTIVE_VERSION = 1;

interface CountingProvider {
  provider: EmbeddingProvider;
  calls: () => number;
  texts: () => string[][];
}

function countingProvider(inner: EmbeddingProvider): CountingProvider {
  let calls = 0;
  const texts: string[][] = [];
  return {
    provider: {
      async embed(input) {
        calls += 1;
        texts.push(input);
        return inner.embed(input);
      },
    },
    calls: () => calls,
    texts: () => texts,
  };
}

function fake(embeddingVersion: number): EmbeddingProvider {
  return createFakeEmbeddingProvider({ dimensions: 8, embeddingVersion });
}

describe.skipIf(!runIntegration)('voc.embed_voc handler (#168)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;
  let msId: string;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const actors = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    actorId = actors.rows[0]?.id ?? '';
    if (!actorId) throw new Error('seed admin actor not found');
  });

  beforeEach(async () => {
    await cleanup();
    msId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Embed target');
  });

  afterAll(async () => {
    await cleanup();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  // Children before parents: voc_embeddings → vocs → managed_systems.
  // voc_embeddings.voc_id cascades on VOC delete, but deleting it explicitly
  // keeps the teardown honest if that FK ever changes.
  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    const scope = `(select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    await migrateHandle.pool.query(
      `delete from voc.voc_embeddings where voc_id in (
         select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${scope}
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${scope}`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function rowsFor(vocId: string) {
    const res = await appHandle.pool.query<{
      embedding_version: number;
      provider: string;
      model: string;
      dimensions: number;
      source_hash: string;
      created_at: string;
      updated_at: string;
    }>(
      `select embedding_version, provider, model, dimensions, source_hash,
              created_at::text as created_at, updated_at::text as updated_at
         from voc.voc_embeddings where voc_id = $1 order by embedding_version`,
      [vocId],
    );
    return res.rows;
  }

  async function seedVoc(title: string): Promise<string> {
    const voc = await insertVocDirectly(appHandle, WORKSPACE_ID, msId, actorId, title);
    return voc.id;
  }

  it('writes one row with provider metadata taken from the embedding result', async () => {
    const vocId = await seedVoc('Login fails on Safari');
    const counting = countingProvider(fake(ACTIVE_VERSION));

    const outcome = await embedVoc(
      {
        db: appHandle.db,
        provider: counting.provider,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );

    expect(outcome).toBe('written');
    const rows = await rowsFor(vocId);
    expect(rows).toHaveLength(1);
    // Not hardcoded anywhere in the handler — these come from EmbeddingResult.
    expect(rows[0]?.provider).toBe('fake');
    expect(rows[0]?.model).toBe('fake-hash-v1');
    expect(rows[0]?.dimensions).toBe(8);
    // The embedded text is exactly the derived input, title included.
    expect(counting.texts()[0]?.[0]).toContain('Login fails on Safari');
  });

  it('is idempotent: a second run writes nothing and never calls the provider', async () => {
    const vocId = await seedVoc('Duplicate run');
    const counting = countingProvider(fake(ACTIVE_VERSION));
    const deps = {
      db: appHandle.db,
      provider: counting.provider,
      embeddingVersion: ACTIVE_VERSION,
      embeddingEnabled: true,
    };
    const payload = { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' };

    expect(await embedVoc(deps, payload)).toBe('written');
    expect(counting.calls()).toBe(1);

    expect(await embedVoc(deps, payload)).toBe('unchanged');
    // The whole point of source_hash: the second run costs no provider quota.
    expect(counting.calls()).toBe(1);
    expect(await rowsFor(vocId)).toHaveLength(1);
  });

  it('marks the row as re-checked when the source_hash is unchanged', async () => {
    const vocId = await seedVoc('Recheck me');
    const counting = countingProvider(fake(ACTIVE_VERSION));
    const deps = {
      db: appHandle.db,
      provider: counting.provider,
      embeddingVersion: ACTIVE_VERSION,
      embeddingEnabled: true,
    };
    const payload = { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' };

    await embedVoc(deps, payload);
    const before = (await rowsFor(vocId))[0];

    // A write that leaves the embedded text alone still bumps vocs.updated_at
    // (unconditional trigger), making this VOC a backfill candidate.
    await appHandle.pool.query(`update voc.vocs set severity = 'high' where id = $1`, [vocId]);
    expect(await embedVoc(deps, payload)).toBe('unchanged');

    const after = (await rowsFor(vocId))[0];
    expect(counting.calls()).toBe(1);
    expect(after?.source_hash).toBe(before?.source_hash);
    // updated_at moves even though no vector was rewritten — that is what
    // clears the candidate so the backfill stops re-selecting it forever.
    expect(after?.updated_at).not.toBe(before?.updated_at);
    // And the row is genuinely no longer behind its VOC.
    const behind = await appHandle.pool.query<{ behind: boolean }>(
      `select e.updated_at < v.updated_at as behind
         from voc.voc_embeddings e join voc.vocs v on v.id = e.voc_id
        where e.voc_id = $1 and e.embedding_version = $2`,
      [vocId, ACTIVE_VERSION],
    );
    expect(behind.rows[0]?.behind).toBe(false);
  });

  it('does not mask an edit that lands while the provider call is in flight', async () => {
    const vocId = await seedVoc('original title');
    // Embed once so the racing write below takes the ON CONFLICT *update* arm.
    // That is the shape the bug actually has in production: the backfill picks
    // up an already-embedded VOC that went stale, and re-embeds it.
    await embedVoc(
      {
        db: appHandle.db,
        provider: fake(ACTIVE_VERSION),
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );
    await appHandle.pool.query(`update voc.vocs set title = $2 where id = $1`, [
      vocId,
      'first rewrite',
    ]);

    // Hold the provider open so the edit lands strictly between the handler's
    // read of voc.vocs and its write of voc.voc_embeddings. That window is
    // seconds wide in production (a real provider HTTP call), and a cron
    // backfill job overlapping the edit's own job reaches it without anything
    // going wrong — no dropped enqueue required.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = fake(ACTIVE_VERSION);
    const stalling: EmbeddingProvider = {
      async embed(texts) {
        await gate;
        return inner.embed(texts);
      },
    };

    const job = embedVoc(
      {
        db: appHandle.db,
        provider: stalling,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await appHandle.pool.query(`update voc.vocs set title = $2 where id = $1`, [
      vocId,
      'edited mid flight',
    ]);
    release();
    expect(await job).toBe('written');

    // The vector we just stored is of the pre-edit text — unavoidable, we read
    // before the edit existed. What must NOT happen is the row claiming to be
    // current: stamping now() would put it ahead of vocs.updated_at and hide
    // the staleness forever. The watermark keeps it a backfill candidate.
    const rows = await selectVocsNeedingEmbedding(appHandle.db, {
      embeddingVersion: ACTIVE_VERSION,
      limit: 10_000,
    });
    expect(rows.map((r) => r.voc_id)).toContain(vocId);
  });

  it('two concurrent writes for the same (voc, version) converge on one row', async () => {
    const vocId = await seedVoc('Concurrent run');
    const provider = fake(ACTIVE_VERSION);
    const first = await provider.embed(['first']);
    const second = await provider.embed(['second']);

    const write = (result: typeof first, sourceHash: string) =>
      upsertVocEmbedding(appHandle.db, {
        vocId,
        workspaceId: WORKSPACE_ID,
        embeddingVersion: ACTIVE_VERSION,
        provider: result.provider,
        model: result.model,
        dimensions: result.dimensions,
        embedding: result.vectors[0] as number[],
        sourceHash,
        sourceUpdatedAt: new Date().toISOString(),
      });

    // Two workers that both decided to write. A read-then-insert would fail
    // one of these with a duplicate-key error; the ON CONFLICT upsert absorbs
    // it and the last write wins, which is safe because both vectors are
    // valid embeddings of the same VOC at the same version.
    await expect(
      Promise.all([write(first, 'hash-a'), write(second, 'hash-b')]),
    ).resolves.toHaveLength(2);
    expect(await rowsFor(vocId)).toHaveLength(1);
  });

  it('updates the same row in place when the VOC content changes', async () => {
    const vocId = await seedVoc('Original title');
    const counting = countingProvider(fake(ACTIVE_VERSION));
    const deps = {
      db: appHandle.db,
      provider: counting.provider,
      embeddingVersion: ACTIVE_VERSION,
      embeddingEnabled: true,
    };
    const payload = { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' };

    await embedVoc(deps, payload);
    const before = (await rowsFor(vocId))[0];
    expect(before).toBeDefined();

    await appHandle.pool.query(`update voc.vocs set title = $2 where id = $1`, [
      vocId,
      'Rewritten title',
    ]);

    expect(await embedVoc(deps, payload)).toBe('written');
    expect(counting.calls()).toBe(2);

    const after = await rowsFor(vocId);
    expect(after).toHaveLength(1);
    expect(after[0]?.source_hash).not.toBe(before?.source_hash);
    // Same row, not a delete+insert: created_at survives, updated_at moves.
    expect(after[0]?.created_at).toBe(before?.created_at);
    expect(after[0]?.updated_at).not.toBe(before?.updated_at);
  });

  it('keeps rows at different embedding versions side by side (ADR-0034 D2)', async () => {
    const vocId = await seedVoc('Model swap');
    const payload = { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' };

    await embedVoc(
      {
        db: appHandle.db,
        provider: fake(1),
        embeddingVersion: 1,
        embeddingEnabled: true,
      },
      payload,
    );
    await embedVoc(
      {
        db: appHandle.db,
        provider: createFakeEmbeddingProvider({ dimensions: 16, embeddingVersion: 2 }),
        embeddingVersion: 2,
        embeddingEnabled: true,
      },
      payload,
    );

    const rows = await rowsFor(vocId);
    expect(rows.map((r) => r.embedding_version)).toEqual([1, 2]);
    // A version bump is a re-embed, never a reinterpretation: dimensions are
    // per-row, so the v1 vector stays readable under its own metadata.
    expect(rows.map((r) => r.dimensions)).toEqual([8, 16]);
  });

  it('writes nothing and does not throw when the provider is disabled', async () => {
    const vocId = await seedVoc('Disabled environment');
    const counting = countingProvider(fake(ACTIVE_VERSION));

    const outcome = await embedVoc(
      {
        db: appHandle.db,
        provider: counting.provider,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: false,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );

    expect(outcome).toBe('disabled');
    expect(counting.calls()).toBe(0);
    expect(await rowsFor(vocId)).toHaveLength(0);
  });

  it('treats EmbeddingUnavailableError as a skip, not a retryable failure', async () => {
    const vocId = await seedVoc('Disabled provider instance');

    // embeddingEnabled=true but the provider itself is the disabled adapter —
    // the mis-wiring case. Must not throw, or pg-boss would retry it 5 times.
    const outcome = await embedVoc(
      {
        db: appHandle.db,
        provider: createDisabledEmbeddingProvider(),
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );

    expect(outcome).toBe('disabled');
    expect(await rowsFor(vocId)).toHaveLength(0);
  });

  it('skips a VOC that no longer exists instead of retry-looping', async () => {
    const counting = countingProvider(fake(ACTIVE_VERSION));
    const outcome = await embedVoc(
      {
        db: appHandle.db,
        provider: counting.provider,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      {
        workspace_id: WORKSPACE_ID,
        voc_id: '00000000-0000-4000-8000-000000000000',
        correlation_id: 'test',
      },
    );
    expect(outcome).toBe('voc_not_found');
    expect(counting.calls()).toBe(0);
  });

  it('stores the hash of the derived text, so the pure helper and the job agree', async () => {
    const vocId = await seedVoc('Hash agreement');
    await embedVoc(
      {
        db: appHandle.db,
        provider: fake(ACTIVE_VERSION),
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: vocId, correlation_id: 'test' },
    );

    const voc = await appHandle.pool.query<{ title: string; description_rich_content: unknown }>(
      `select title, description_rich_content from voc.vocs where id = $1`,
      [vocId],
    );
    const expected = deriveVocEmbeddingInput({
      title: voc.rows[0]?.title ?? '',
      descriptionRichContent: voc.rows[0]?.description_rich_content,
    });
    expect((await rowsFor(vocId))[0]?.source_hash).toBe(expected.sourceHash);
  });
});
