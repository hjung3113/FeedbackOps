import type {
  EntityLinkEntityType,
  EntityLinkRef,
  EntityLinkTargetSummary,
  TaskReporterSummary,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';
import type { LinkEndpointRow } from './repo.js';

export interface EntityLinksActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export type ReporterSummaryResult =
  | { available: false }
  | { available: true; summary: TaskReporterSummary };

export interface EntityLinkProvider {
  entityType: EntityLinkEntityType;
  assertExists(db: Db, workspaceId: string, id: string): Promise<LinkEndpointRow | null>;
  getPermissionSubject(db: Db, workspaceId: string, id: string): Promise<LinkEndpointRow | null>;
  canRead(
    deps: { db: Db; checkService: CheckService },
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  canCreateTarget?(
    deps: { checkService: CheckService },
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  getReporterSummary(db: Db, workspaceId: string, id: string): Promise<ReporterSummaryResult>;
  getReporterSummaries?(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ReporterSummaryResult>>;
  getInternalSummary(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<EntityLinkTargetSummary | null>;
  listExpectedLinks(id: string): Promise<EntityLinkRef[]>;
}

export type EntityLinkProviderRegistry = Record<EntityLinkEntityType, EntityLinkProvider>;
