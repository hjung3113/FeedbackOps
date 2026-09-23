import {
  type CreateFindingFromSurveyResponseRequest,
  type CreateFindingRequest,
  type FindingDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';
import { HttpError } from '../../lib/errors.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import { createEntityLink as insertActiveEntityLink } from '../entity-links/index.js';
import { assertLinkManagedSystemCompatibility } from '../entity-links/service.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import {
  resolveApprovedSurveyResponseExcerpts,
  resolveSurveyResponseEvidenceAccess,
} from '../surveys/evidence-access.js';
import { selectVocForUpdate } from '../voc/index.js';
import { incrementFindingEvidenceCount, insertEvidenceHighlight, insertFinding } from './repo.js';
import { canManageFinding, canReadSourceVoc, toDto } from './service-shared.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

export function createFindingCreation(deps: FindingsServiceDeps) {
  async function createFindingFromVoc(args: {
    actor: FindingsActor;
    vocId: string;
    input: CreateFindingRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: FindingDto }> {
    const { actor, vocId, input, idempotencyKey, requestHash } = args;

    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const sourceVoc = await selectVocForUpdate(tx, actor.workspace_id, vocId);
          if (!sourceVoc || sourceVoc.archivedAt !== null) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const sourceReadable = await canReadSourceVoc(
            deps,
            actor,
            sourceVoc.primaryManagedSystemId,
            sourceVoc.reporterId,
            {
              tx,
            },
          );
          if (!sourceReadable) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const targetManagedSystemId =
            input.primary_managed_system_id ?? sourceVoc.primaryManagedSystemId;
          const targetMs = await lockManagedSystem(tx, actor.workspace_id, targetManagedSystemId);
          if (!targetMs) throw new HttpError('not_found.record', 'managed system not found');
          if (targetMs.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'managed system archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

          const canManage = await canManageFinding(deps, actor, targetManagedSystemId, { tx });
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          assertLinkManagedSystemCompatibility(
            sourceVoc.primaryManagedSystemId,
            targetManagedSystemId,
            {
              path: ['primary_managed_system_id'],
            },
          );

          if (input.analytics_area_id) {
            const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
            if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
            if (aa.managed_system_id !== targetManagedSystemId) {
              throw new HttpError(
                'validation.failed',
                'analytics_area does not belong to managed_system',
                { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
              );
            }
            if (aa.archived_at !== null) {
              throw new HttpError('conflict.parent_archived', 'analytics area archived', {
                fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
              });
            }
          }

          const finding = await insertFinding(tx, {
            workspaceId: actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: input.title,
            summary: input.summary,
            sourceType: 'voc',
            sourceId: sourceVoc.id,
            severity: input.severity,
            confidence: input.confidence ?? null,
            analyticsAreaId: input.analytics_area_id ?? null,
            createdBy: actor.actor_id,
          });

          const createdFindingTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'voc',
            target_type: 'finding',
            relation_type: 'created_finding',
          });

          const link = await insertActiveEntityLink(tx, {
            workspaceId: actor.workspace_id,
            sourceType: createdFindingTuple.source_type,
            sourceId: sourceVoc.id,
            targetType: createdFindingTuple.target_type,
            targetId: finding.id,
            relationType: createdFindingTuple.relation_type,
            managedSystemId: sourceVoc.primaryManagedSystemId,
            createdBy: actor.actor_id,
            visibility: 'internal_only',
          });

          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_created_from_voc',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding created from VOC',
            detail: {
              finding_id: finding.id,
              source_voc_id: sourceVoc.id,
              primary_managed_system_id: targetManagedSystemId,
              source_type: 'voc',
            },
          });

          if (link.inserted) {
            await deps.auditService.record(tx, {
              workspace_id: actor.workspace_id,
              actor_id: actor.actor_id,
              event_type: 'entity_link.created',
              subject_type: 'entity_link',
              subject_id: link.row.id,
              summary: 'Entity link created',
              detail: {
                link_id: link.row.id,
                source: { type: 'voc', id: sourceVoc.id },
                target: { type: 'finding', id: finding.id },
                relation_type: 'created_finding',
                visibility: 'internal_only',
              },
            });
          }

          return {
            status: 201,
            body: toDto(finding, {
              link_id: link.row.id,
              source_type: 'voc',
              source_id: sourceVoc.id,
              relation_type: 'created_finding',
            }),
          };
        },
      );
    });
  }

  async function createFindingFromSurveyResponse(args: {
    actor: FindingsActor;
    responseId: string;
    input: CreateFindingFromSurveyResponseRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: FindingDto }> {
    const { actor, responseId, input, idempotencyKey, requestHash } = args;
    return deps.db.transaction(async (tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const access = await resolveSurveyResponseEvidenceAccess(
            deps,
            tx,
            actor,
            responseId,
            'create_finding',
          );
          const subject = access.subject;
          const targetManagedSystemId =
            input.primary_managed_system_id ?? subject.primary_managed_system_id;
          const targetMs = await lockManagedSystem(tx, actor.workspace_id, targetManagedSystemId);
          if (!targetMs) throw new HttpError('not_found.record', 'managed system not found');
          if (targetMs.archived_at !== null)
            throw new HttpError('conflict.parent_archived', 'managed system archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          if (!(await canManageFinding(deps, actor, targetManagedSystemId, { tx })))
            throw new HttpError('permission.denied', 'finding.manage capability required');
          if (input.analytics_area_id) {
            const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
            if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
            if (aa.managed_system_id !== targetManagedSystemId)
              throw new HttpError(
                'validation.failed',
                'analytics_area does not belong to managed_system',
                {
                  fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
                },
              );
            if (aa.archived_at !== null)
              throw new HttpError('conflict.parent_archived', 'analytics area archived', {
                fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
              });
          }
          const safeExcerpts = await resolveApprovedSurveyResponseExcerpts(
            tx,
            actor,
            subject,
            input.approved_excerpt_ids,
          );
          const label = safeExcerpts[0]?.question_label ?? 'Survey response';
          const excerpt = safeExcerpts[0]?.redacted_excerpt;
          const safeMeta = `${subject.survey_type} · ${subject.survey_display_id}`;
          const finding = await insertFinding(tx, {
            workspaceId: actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: `${label} · ${safeMeta}`,
            summary: excerpt ? `Approved excerpt: ${excerpt}` : `Survey response from ${safeMeta}`,
            sourceType: 'survey_response',
            sourceId: subject.response_id,
            severity: input.severity,
            confidence: input.confidence ?? null,
            analyticsAreaId: input.analytics_area_id ?? null,
            createdBy: actor.actor_id,
          });
          const generated = registeredEntityLinkPairSchema.parse({
            source_type: 'survey_response',
            target_type: 'finding',
            relation_type: 'generated_finding',
          });
          const sourceLink = await insertActiveEntityLink(tx, {
            workspaceId: actor.workspace_id,
            sourceType: generated.source_type,
            sourceId: subject.response_id,
            targetType: generated.target_type,
            targetId: finding.id,
            relationType: generated.relation_type,
            managedSystemId: subject.primary_managed_system_id,
            createdBy: actor.actor_id,
            visibility: 'internal_only',
          });
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_created_from_survey_response',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding created from survey response',
            detail: {
              finding_id: finding.id,
              source_survey_response_id: subject.response_id,
              source_survey_id: subject.survey_id,
              primary_managed_system_id: targetManagedSystemId,
              identity_protected: subject.identity_protected,
              source_type: 'survey_response',
            },
          });
          if (sourceLink.inserted)
            await deps.auditService.record(tx, {
              workspace_id: actor.workspace_id,
              actor_id: actor.actor_id,
              event_type: 'entity_link.created',
              subject_type: 'entity_link',
              subject_id: sourceLink.row.id,
              summary: 'Entity link created',
              detail: {
                link_id: sourceLink.row.id,
                source: { type: 'survey_response', id: subject.response_id },
                target: { type: 'finding', id: finding.id },
                relation_type: 'generated_finding',
                visibility: 'internal_only',
              },
            });
          for (const approved of safeExcerpts) {
            const evidence = await insertEvidenceHighlight(tx, {
              workspaceId: actor.workspace_id,
              findingId: finding.id,
              primaryManagedSystemId: targetManagedSystemId,
              sourceType: 'survey_response',
              sourceId: subject.response_id,
              approvedExcerptId: approved.approved_excerpt_id,
              quoteOrSummary: approved.redacted_excerpt,
              analyticsAreaId: input.analytics_area_id ?? null,
              sentiment: null,
              importance: null,
              createdBy: actor.actor_id,
            });
            await incrementFindingEvidenceCount(tx, {
              workspaceId: actor.workspace_id,
              findingId: finding.id,
            });
            const evidenceOf = registeredEntityLinkPairSchema.parse({
              source_type: 'survey_response',
              target_type: 'finding',
              relation_type: 'evidence_of',
            });
            const evidenceLink = await insertActiveEntityLink(tx, {
              workspaceId: actor.workspace_id,
              sourceType: evidenceOf.source_type,
              sourceId: subject.response_id,
              targetType: evidenceOf.target_type,
              targetId: finding.id,
              relationType: evidenceOf.relation_type,
              managedSystemId: subject.primary_managed_system_id,
              createdBy: actor.actor_id,
              visibility: 'internal_only',
            });
            if (evidenceLink.inserted)
              await deps.auditService.record(tx, {
                workspace_id: actor.workspace_id,
                actor_id: actor.actor_id,
                event_type: 'entity_link.created',
                subject_type: 'entity_link',
                subject_id: evidenceLink.row.id,
                summary: 'Entity link created',
                detail: {
                  link_id: evidenceLink.row.id,
                  source: { type: 'survey_response', id: subject.response_id },
                  target: { type: 'finding', id: finding.id },
                  relation_type: 'evidence_of',
                  visibility: 'internal_only',
                },
              });
            await deps.auditService.record(tx, {
              workspace_id: actor.workspace_id,
              actor_id: actor.actor_id,
              event_type: 'evidence_highlight_added',
              subject_type: 'finding',
              subject_id: finding.id,
              summary: 'Evidence highlight added',
              detail: {
                finding_id: finding.id,
                evidence_highlight_id: evidence.id,
                source_type: evidence.source_type,
                source_id: evidence.source_id,
                primary_managed_system_id: targetManagedSystemId,
              },
            });
          }
          return { status: 201, body: toDto({ ...finding, evidence_count: safeExcerpts.length }) };
        },
      ),
    );
  }

  return {
    createFindingFromVoc,
    createFindingFromSurveyResponse,
  };
}
