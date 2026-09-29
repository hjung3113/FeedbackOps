// apps/backend/src/modules/voc/service.ts
// VOC application service. Owns transactions, sanitization,
// FOR-UPDATE-guarded parent checks, INSERT, and audit emission per
// ADR-0008 + ADR-0019. Per apps/backend/AGENTS.md Layer Rules (#392), the
// `*Command` entry points own the transaction + idempotency frame; the
// Tx-aware functions are internals shared with cluster candidate-apply.

import type { Db } from '../../db/client.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import type { CheckService } from '../permissions/check-service.js';
import type { VocEmbeddingEnqueuer } from './embedding/enqueue.js';
import type { ReporterFacingStatus } from './transitions.js';
import { createVocCreateCommands } from './commands/create.js';
import { createVocEditDescriptionCommands } from './commands/edit-description.js';
import { createVocUpdateTriageCommands } from './commands/update-triage.js';

export interface CreateVocActor {
  actor_id: string;
  workspace_id: string;
}

export interface VocEnvelope {
  id: string;
  display_id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  reporter_id: string;
  title: string;
  description_rich_content: unknown;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status: ReporterFacingStatus;
  triage_state: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  owner_user_id: string | null;
  owner_team_id: string | null;
  source_context: string;
  created_at: string;
  updated_at: string;
  next_actions: never[];
  next_reporter_states: {
    allowed: ReporterFacingStatus[];
    forbidden: Partial<Record<ReporterFacingStatus, string>>;
  };
  permission_decisions: Record<string, never>;
}

export interface VocServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  /**
   * #392 — required: the `*Command` entry points own the transaction +
   * idempotency frame (apps/backend AGENTS.md Layer Rules), so every
   * constructor must wire the core idempotency service.
   */
  idempotencyService: IdempotencyService;
  notify: NotificationNotifier;
  /**
   * #168 (ADR-0034 D6) — enqueue-on-write for VOC embeddings. Optional so
   * callers booted without pg-boss stay wired; absent means no enqueue, and
   * the cron backfill is the only ingestion path. Never allowed to fail a
   * write: see `embedding/enqueue.ts`.
   */
  embeddingEnqueuer?: VocEmbeddingEnqueuer;
}


export function createVocService(deps: VocServiceDeps) {
  const createCommands = createVocCreateCommands(deps);
  const updateCommands = createVocUpdateTriageCommands(deps);
  const editDescriptionCommands = createVocEditDescriptionCommands(deps);

  return {
    createVoc: createCommands.createVoc,
    updateVoc: updateCommands.updateVoc,
    editVocDescription: editDescriptionCommands.editVocDescription,
    createVocCommand: createCommands.createVocCommand,
    updateVocCommand: updateCommands.updateVocCommand,
    editVocDescriptionCommand: editDescriptionCommands.editVocDescriptionCommand,
  };
}

export type VocService = ReturnType<typeof createVocService>;
