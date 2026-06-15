import type { EntityLinkDto, EntityLinkRef } from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import {
  type EntityLinkRow,
  insertActiveVocRelatedToLink,
  resolveVocEndpoint,
  selectActiveLinksForEndpoint,
} from './repo.js';

export interface EntityLinksActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface EntityLinksServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
}

function toAllowedDto(row: EntityLinkRow): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    target_type: row.target_type,
    target_id: row.target_id,
    relation_type: row.relation_type,
    visibility: row.visibility,
    status: row.status,
    managed_system_id: row.managed_system_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: 'allowed',
  };
}

function toHiddenDto(row: EntityLinkRow): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    target_type: row.target_type,
    relation_type: row.relation_type,
    visibility_state: 'hidden',
  };
}

async function assertVocReadScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await deps.checkService.checkCapability(actor, 'voc.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: managedSystemId,
  });
  return decision.allow;
}

export function createEntityLinksService(deps: EntityLinksServiceDeps) {
  async function createLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: 'related_to';
    visibility?: 'internal_only';
  }): Promise<{ link: EntityLinkDto; status: 200 | 201 }> {
    const { actor, source, target } = args;
    const visibility = args.visibility ?? 'internal_only';

    if (source.type !== 'voc' || target.type !== 'voc' || args.relation_type !== 'related_to') {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    if (visibility !== 'internal_only') {
      throw new HttpError('validation.failed', 'unsupported visibility', {
        fields: [{ path: ['visibility'], code: 'unsupported_visibility' }],
      });
    }
    if (source.id === target.id) {
      throw new HttpError('validation.failed', 'entity link source and target must differ', {
        fields: [{ path: ['target', 'id'], code: 'self_link' }],
      });
    }

    const [sourceRow, targetRow] = await Promise.all([
      resolveVocEndpoint(deps.db, actor.workspace_id, source.id),
      resolveVocEndpoint(deps.db, actor.workspace_id, target.id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const sourceAllowed = await assertVocReadScope(deps, actor, sourceRow.managed_system_id);
    if (!sourceAllowed) {
      throw new HttpError('permission.denied', 'missing source VOC read scope');
    }

    const targetAllowed = await assertVocReadScope(deps, actor, targetRow.managed_system_id);
    if (!targetAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const result = await deps.db.transaction(async (tx) => {
      const inserted = await insertActiveVocRelatedToLink(tx, {
        workspaceId: actor.workspace_id,
        sourceId: source.id,
        targetId: target.id,
        managedSystemId: sourceRow.managed_system_id,
        createdBy: actor.actor_id,
        visibility,
      });

      if (inserted.inserted) {
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'entity_link.created',
          subject_type: 'entity_link',
          subject_id: inserted.row.id,
          summary: 'Entity link created',
          detail: {
            link_id: inserted.row.id,
            source,
            target,
            relation_type: args.relation_type,
            visibility,
          },
        });
      }

      return inserted;
    });

    return { link: toAllowedDto(result.row), status: result.inserted ? 201 : 200 };
  }

  async function listLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
  }): Promise<EntityLinkDto[]> {
    const { actor, endpoint, side } = args;
    if (endpoint.type !== 'voc') {
      throw new HttpError('validation.failed', 'unsupported entity type', {
        fields: [{ path: ['type'], code: 'unsupported_entity_type' }],
      });
    }

    const focus = await resolveVocEndpoint(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    const focusAllowed = await assertVocReadScope(deps, actor, focus.managed_system_id);
    if (!focusAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const listArgs = {
      workspaceId: actor.workspace_id,
      endpointType: endpoint.type,
      endpointId: endpoint.id,
    };
    const rows = await selectActiveLinksForEndpoint(
      deps.db,
      side === undefined ? listArgs : { ...listArgs, side },
    );

    const resolvedByVocId = new Map<string, Awaited<ReturnType<typeof resolveVocEndpoint>>>();
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      const otherId = row.source_id === endpoint.id ? row.target_id : row.source_id;
      let other = resolvedByVocId.get(otherId);
      if (other === undefined) {
        other = await resolveVocEndpoint(deps.db, actor.workspace_id, otherId);
        resolvedByVocId.set(otherId, other);
      }
      if (!other) {
        items.push(toHiddenDto(row));
        continue;
      }
      const otherAllowed = await assertVocReadScope(deps, actor, other.managed_system_id);
      items.push(otherAllowed ? toAllowedDto(row) : toHiddenDto(row));
    }
    return items;
  }

  return { createLink, listLinks };
}

export type EntityLinksService = ReturnType<typeof createEntityLinksService>;
