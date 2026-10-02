import type { FindingDto } from '@fops/shared';
import { sanitizeRichContentOrThrow } from '../../lib/rich-content/sanitize-or-throw.js';
import { checkFindingManage, checkFindingRead } from './authorization.js';
import type { FindingReadRow, findCreatedFindingSourceLink } from './repo-read.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

export function sanitizeCommentBody(doc: unknown): unknown {
  return sanitizeRichContentOrThrow({
    surface: 'internal-comment',
    doc,
    fieldPath: ['body_rich_content'],
  });
}

export function toDto(
  row: FindingReadRow,
  source?: Awaited<ReturnType<typeof findCreatedFindingSourceLink>>,
): FindingDto {
  const sourceType = row.source_type as FindingDto['source_type'];
  const base = {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
    primary_managed_system_id: row.primary_managed_system_id,
    title: row.title,
    summary: row.summary,
    evidence_count: row.evidence_count,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    analytics_area_id: row.analytics_area_id,
    linked_task_id: row.linked_task_id,
    linked_milestone_id: row.linked_milestone_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    ...(source
      ? {
          source: {
            type: source.source_type,
            id: source.source_id,
            relation_type: 'created_finding' as const,
            link_id: source.link_id,
          },
        }
      : {}),
  };

  if (sourceType === 'survey_response') {
    return { ...base, source_type: sourceType };
  }

  return { ...base, source_type: sourceType, source_id: row.source_id } as FindingDto;
}

export async function canReadSourceVoc(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
  reporterId: string,
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.actor_id === reporterId) return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'voc.read',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

export async function canManageFinding(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  const decision = await checkFindingManage(
    deps.checkService,
    actor,
    managedSystemId,
    { requireElevatedRole: false },
    options,
  );
  return decision.allow;
}

export async function canReadFinding(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await checkFindingRead(deps.checkService, actor, managedSystemId, {
    requireElevatedRole: true,
  });
  return decision.allow;
}
