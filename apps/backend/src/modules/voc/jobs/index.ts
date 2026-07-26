// VOC module job registrations (#168 step 3). Mirrors registerCoreJobs /
// registerTasksJobs: one `register<Module>Jobs(boss, deps)` called by the
// backend entrypoint between pg-boss start and Fastify listen (ADR-0009:22-27).

import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import type { EmbeddingProvider } from '../embedding/port.js';
import { registerEmbedVoc } from './embed-voc.js';
import { registerVocEmbeddingBackfill } from './embedding-backfill.js';

export interface VocJobDeps {
  db: Db;
  provider: EmbeddingProvider;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  log?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export async function registerVocJobs(boss: PgBoss, deps: VocJobDeps): Promise<void> {
  await registerEmbedVoc(boss, {
    db: deps.db,
    provider: deps.provider,
    embeddingVersion: deps.embeddingVersion,
    embeddingEnabled: deps.embeddingEnabled,
    ...(deps.log ? { log: { info: deps.log.info, warn: deps.log.warn } } : {}),
  });
  await registerVocEmbeddingBackfill(boss, {
    db: deps.db,
    embeddingVersion: deps.embeddingVersion,
    embeddingEnabled: deps.embeddingEnabled,
    ...(deps.log ? { log: { info: deps.log.info, error: deps.log.error } } : {}),
  });
}

export {
  VOC_EMBED_QUEUE,
  embedVoc,
  embedVocHandler,
  registerEmbedVoc,
  type EmbedVocDeps,
  type EmbedVocOutcome,
  type VocEmbedPayload,
} from './embed-voc.js';
export {
  VOC_EMBEDDING_BACKFILL_BATCH_SIZE,
  VOC_EMBEDDING_BACKFILL_CRON,
  VOC_EMBEDDING_BACKFILL_QUEUE,
  backfillVocEmbeddings,
  registerVocEmbeddingBackfill,
  type VocEmbeddingBackfillResult,
} from './embedding-backfill.js';
