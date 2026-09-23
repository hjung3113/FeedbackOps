import type { Db } from '../../db/client.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { EntityLinksService } from '../entity-links/service.js';
import type { CheckService } from '../permissions/check-service.js';
import { createFindingComments } from './comments.js';
import { createFindingCreation } from './creation.js';
import { createFindingEvidence } from './evidence.js';
import { createFindingRecord } from './record.js';

export interface FindingsActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface FindingsServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
  entityLinksService: EntityLinksService;
}

export function createFindingsService(deps: FindingsServiceDeps) {
  return {
    ...createFindingCreation(deps),
    ...createFindingComments(deps),
    ...createFindingEvidence(deps),
    ...createFindingRecord(deps),
  };
}

export type FindingsService = ReturnType<typeof createFindingsService>;
