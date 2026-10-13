import {
  type CreateFindingFromSurveyResponseRequest,
  type CreateFindingRequest,
  type FindingDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';
import { HttpError } from '../../lib/errors.js';
import { assertActiveAnalyticsAreaForManagedSystem } from '../analytics-areas/index.js';
import {
  createSurveyFindingLink,
  createEntityLink as insertActiveEntityLink,
} from '../entity-links/index.js';
import { assertLinkManagedSystemCompatibility } from '../entity-links/service.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import {
  recordSurveyFindingBinding,
  recordSurveyHighlightBinding,
  resolveApprovedSurveyResponseExcerpts,
  resolveSurveyResponseEvidenceAccess,
} from '../surveys/evidence-access.js';
import { selectVocForUpdate } from '../voc/index.js';
import { incrementFindingEvidenceCount, insertEvidenceHighlight, insertFinding } from './repo.js';
import { resolveOwner } from './responsibility.js';
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

          const area = input.analytics_area_id
            ? await assertActiveAnalyticsAreaForManagedSystem(
                tx,
                actor.workspace_id,
                targetManagedSystemId,
                input.analytics_area_id,
              )
            : null;

          const owner = await resolveOwner(
            tx,
            deps,
            actor.workspace_id,
            targetMs,
            area?.owner_team_id ?? null,
            input,
          );
          const finding = await insertFinding(tx, {
            ownerActorId: owner.owner_actor_id,
            ownerTeamId: owner.owner_team_id,
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
              ...owner,
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
            body: {
              ...owner,
              ...toDto(finding, {
                link_id: link.row.id,
                source_type: 'voc',
                source_id: sourceVoc.id,
                relation_type: 'created_finding',
              }),
            },
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
          const area = input.analytics_area_id
            ? await assertActiveAnalyticsAreaForManagedSystem(
                tx,
                actor.workspace_id,
                targetManagedSystemId,
                input.analytics_area_id,
              )
            : null;
          const safeExcerpts = await resolveApprovedSurveyResponseExcerpts(
            tx,
            actor,
            subject,
            input.approved_excerpt_ids,
          );
          const label = safeExcerpts[0]?.question_label ?? 'Survey response';
          const safeMeta = `${subject.survey_type} · ${subject.survey_display_id}`;
          const owner = await resolveOwner(
            tx,
            deps,
            actor.workspace_id,
            targetMs,
            area?.owner_team_id ?? null,
            input,
          );
          const finding = await insertFinding(tx, {
            ownerActorId: owner.owner_actor_id,
            ownerTeamId: owner.owner_team_id,
            workspaceId: actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: `${label} · ${safeMeta}`,
            summary: `Survey response from ${safeMeta}`,
            sourceType: 'survey_response',
            sourceId: null,
            severity: input.severity,
            confidence: input.confidence ?? null,
            analyticsAreaId: input.analytics_area_id ?? null,
            createdBy: actor.actor_id,
          });
          await recordSurveyFindingBinding(tx, actor, finding.id, subject.response_id);
          const sourceLink = await createSurveyFindingLink(tx, {
            workspaceId: actor.workspace_id,
            responseId: subject.response_id,
            findingId: finding.id,
            relationType: 'generated_finding',
            managedSystemId: subject.primary_managed_system_id,
            createdBy: actor.actor_id,
          });
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_created_from_survey_response',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding created from survey response',
            detail: {
              ...owner,
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
              subject_id: sourceLink.id,
              summary: 'Entity link created',
              detail: {
                link_id: sourceLink.id,
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
              sourceId: null,
              approvedExcerptId: null,
              quoteOrSummary: null,
              analyticsAreaId: input.analytics_area_id ?? null,
              sentiment: null,
              importance: null,
              createdBy: actor.actor_id,
            });
            await recordSurveyHighlightBinding(
              tx,
              actor,
              evidence.id,
              subject.response_id,
              approved.approved_excerpt_id,
            );
            await incrementFindingEvidenceCount(tx, {
              workspaceId: actor.workspace_id,
              findingId: finding.id,
            });
            const evidenceLink = await createSurveyFindingLink(tx, {
              workspaceId: actor.workspace_id,
              responseId: subject.response_id,
              findingId: finding.id,
              relationType: 'evidence_of',
              managedSystemId: subject.primary_managed_system_id,
              createdBy: actor.actor_id,
            });
            if (evidenceLink.inserted)
              await deps.auditService.record(tx, {
                workspace_id: actor.workspace_id,
                actor_id: actor.actor_id,
                event_type: 'entity_link.created',
                subject_type: 'entity_link',
                subject_id: evidenceLink.id,
                summary: 'Entity link created',
                detail: {
                  link_id: evidenceLink.id,
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
                source_id: subject.response_id,
                primary_managed_system_id: targetManagedSystemId,
              },
            });
          }
          return {
            status: 201,
            body: { ...owner, ...toDto({ ...finding, evidence_count: safeExcerpts.length }) },
          };
        },
      ),
    );
  }

  return {
    createFindingFromVoc,
    createFindingFromSurveyResponse,
  };
}
