import type {
  AddEvidenceHighlightRequest,
  AttachSurveyEvidenceRequest,
  AttachSurveyEvidenceResponse,
  EvidenceHighlightDto,
  LinkEvidenceRequest,
  ListEvidenceHighlightsResponse,
} from '@fops/shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { assertActiveAnalyticsAreaForManagedSystem } from '../analytics-areas/index.js';
import { createSurveyFindingLink, resolveVocEndpoint } from '../entity-links/index.js';
import {
  recordSurveyHighlightBinding,
  resolveFindingSurveyHighlights,
  resolveSurveyAttachmentSelection,
} from '../surveys/evidence-access.js';
import { selectVocForUpdate } from '../voc/index.js';
import { createEvidenceInventory } from './evidence-inventory.js';
import { findFindingById } from './repo-read.js';
import {
  type EvidenceHighlightRow,
  findVocSourceMeta,
  incrementFindingEvidenceCount,
  insertEvidenceHighlight,
  listEvidenceHighlightsByFinding,
  listVocSourceMeta,
  lockFindingById,
} from './repo.js';
import { canManageFinding, canReadFinding, canReadSourceVoc } from './service-shared.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

function evidenceHighlightToDto(
  row: EvidenceHighlightRow,
  options: { includeQuote: boolean; source_title: string | null; source_meta: string | null },
): EvidenceHighlightDto {
  const base = {
    id: row.id,
    workspace_id: row.workspace_id,
    finding_id: row.finding_id,
    primary_managed_system_id: row.primary_managed_system_id,
    ...(options.includeQuote && row.quote_or_summary !== null
      ? { quote_or_summary: row.quote_or_summary }
      : {}),
    analytics_area_id: row.analytics_area_id,
    sentiment: row.sentiment,
    importance: row.importance,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
  };

  if (row.source_type === 'survey_response') {
    return {
      ...base,
      source_type: 'survey_response',
      source_title: 'Survey response',
      source_meta: options.source_meta ?? 'Survey response · Unknown · Identity protected',
    };
  }

  return {
    ...base,
    source_type: row.source_type,
    source_id: row.source_id,
    source_title: options.source_title,
    source_meta: options.source_meta,
  };
}

async function sourceVocReadable(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  input: { managedSystemId: string; reporterId: string | null },
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (input.reporterId && actor.actor_id === input.reporterId) return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'voc.read',
    { workspace_id: actor.workspace_id, managed_system_id: input.managedSystemId },
    options,
  );
  return decision.allow;
}

export function createFindingEvidence(deps: FindingsServiceDeps) {
  async function assertHighlightSourceReadableForWrite(args: {
    actor: FindingsActor;
    tx: Tx;
    sourceType: AddEvidenceHighlightRequest['source_type'];
    sourceId: string | null | undefined;
  }): Promise<void> {
    if (args.sourceType === 'note') return;
    if (args.sourceType === 'survey_response') {
      throw new HttpError('validation.failed', 'survey_response evidence source is not available');
    }
    const sourceVoc = await selectVocForUpdate(
      args.tx,
      args.actor.workspace_id,
      args.sourceId ?? '',
    );
    if (!sourceVoc || sourceVoc.archivedAt !== null) {
      throw new HttpError('not_found.record', 'source voc not found');
    }
    const readable = await canReadSourceVoc(
      deps,
      args.actor,
      sourceVoc.primaryManagedSystemId,
      sourceVoc.reporterId,
      { tx: args.tx },
    );
    if (!readable) throw new HttpError('not_found.record', 'source voc not found');
  }

  async function addEvidenceHighlight(args: {
    actor: FindingsActor;
    findingId: string;
    input: AddEvidenceHighlightRequest;
  }): Promise<{ status: number; body: EvidenceHighlightDto }> {
    const { actor, findingId, input } = args;

    return deps.db.transaction(async (tx) => {
      const finding = await lockFindingById(tx, {
        workspaceId: actor.workspace_id,
        findingId,
      });
      if (!finding) throw new HttpError('not_found.record', 'finding not found');

      const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
        tx,
      });
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      if (input.analytics_area_id) {
        await assertActiveAnalyticsAreaForManagedSystem(
          tx,
          actor.workspace_id,
          finding.primary_managed_system_id,
          input.analytics_area_id,
        );
      }

      await assertHighlightSourceReadableForWrite({
        actor,
        tx,
        sourceType: input.source_type,
        sourceId: input.source_id,
      });

      const row = await insertEvidenceHighlight(tx, {
        workspaceId: actor.workspace_id,
        findingId: finding.id,
        primaryManagedSystemId: finding.primary_managed_system_id,
        sourceType: input.source_type,
        sourceId: input.source_id ?? null,
        approvedExcerptId: null,
        quoteOrSummary: input.quote_or_summary,
        analyticsAreaId: input.analytics_area_id ?? null,
        sentiment: input.sentiment ?? null,
        importance: input.importance ?? null,
        createdBy: actor.actor_id,
      });
      await incrementFindingEvidenceCount(tx, {
        workspaceId: actor.workspace_id,
        findingId: finding.id,
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
          evidence_highlight_id: row.id,
          source_type: row.source_type,
          source_id: row.source_id,
          primary_managed_system_id: finding.primary_managed_system_id,
        },
      });

      const sourceMeta =
        row.source_type === 'voc' && row.source_id
          ? await findVocSourceMeta(tx, {
              workspaceId: actor.workspace_id,
              vocId: row.source_id,
            })
          : null;

      return {
        status: 201,
        body: evidenceHighlightToDto(row, {
          includeQuote: true,
          source_title: sourceMeta?.title ?? null,
          source_meta: sourceMeta?.display_id ?? null,
        }),
      };
    });
  }

  async function attachSurveyEvidence(args: {
    actor: FindingsActor;
    findingId: string;
    input: AttachSurveyEvidenceRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: AttachSurveyEvidenceResponse }> {
    const { actor, findingId, input } = args;
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const finding = await lockFindingById(tx, { workspaceId: actor.workspace_id, findingId });
          if (!finding) throw new HttpError('not_found.record', 'finding not found');
          if (finding.status === 'archived')
            throw new HttpError('conflict.parent_archived', 'finding archived');
          if (!(await canManageFinding(deps, actor, finding.primary_managed_system_id, { tx })))
            throw new HttpError('permission.denied', 'finding.manage capability required');
          const subject = await resolveSurveyAttachmentSelection(
            deps,
            tx,
            actor,
            input.approved_excerpt_id,
          );
          if (input.analytics_area_id)
            await assertActiveAnalyticsAreaForManagedSystem(
              tx,
              actor.workspace_id,
              finding.primary_managed_system_id,
              input.analytics_area_id,
            );
          const highlight = await insertEvidenceHighlight(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
            primaryManagedSystemId: finding.primary_managed_system_id,
            sourceType: 'survey_response',
            sourceId: null,
            approvedExcerptId: null,
            quoteOrSummary: null,
            analyticsAreaId: input.analytics_area_id ?? null,
            sentiment: input.sentiment ?? null,
            importance: input.importance ?? null,
            createdBy: actor.actor_id,
          });
          await recordSurveyHighlightBinding(
            tx,
            actor,
            highlight.id,
            subject.response_id,
            input.approved_excerpt_id,
          );
          const link = await createSurveyFindingLink(tx, {
            workspaceId: actor.workspace_id,
            responseId: subject.response_id,
            findingId: finding.id,
            relationType: 'evidence_of',
            managedSystemId: subject.primary_managed_system_id,
            createdBy: actor.actor_id,
          });
          await incrementFindingEvidenceCount(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
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
              evidence_highlight_id: highlight.id,
              source_type: 'survey_response',
              source_id: subject.response_id,
              primary_managed_system_id: finding.primary_managed_system_id,
            },
          });
          if (link.inserted)
            await deps.auditService.record(tx, {
              workspace_id: actor.workspace_id,
              actor_id: actor.actor_id,
              event_type: 'entity_link.created',
              subject_type: 'entity_link',
              subject_id: link.id,
              summary: 'Entity link created',
              detail: {
                link_id: link.id,
                source: { type: 'survey_response', id: subject.response_id },
                target: { type: 'finding', id: finding.id },
                relation_type: 'evidence_of',
                visibility: 'internal_only',
              },
            });
          return {
            status: 201,
            body: { evidence_highlight_id: highlight.id, finding_id: finding.id },
          };
        },
      ),
    );
  }
  async function canReadEvidenceHighlightSource(args: {
    actor: FindingsActor;
    row: EvidenceHighlightRow;
  }): Promise<boolean> {
    if (args.row.source_type === 'note') return true;
    if (args.row.source_type === 'survey_response') return false;

    if (!args.row.source_id) return false;

    const source = await resolveVocEndpoint(deps.db, args.actor.workspace_id, args.row.source_id);
    if (!source) return false;
    return sourceVocReadable(
      deps,
      args.actor,
      { managedSystemId: source.managed_system_id, reporterId: source.reporter_id },
      undefined,
    );
  }

  async function listEvidenceHighlights(args: {
    actor: FindingsActor;
    findingId: string;
  }): Promise<ListEvidenceHighlightsResponse> {
    return deps.db.transaction(async (tx) => {
      const finding = await findFindingById(tx, {
        workspaceId: args.actor.workspace_id,
        findingId: args.findingId,
      });
      if (!finding) throw new HttpError('not_found.record', 'finding not found');

      const readable = await canReadFinding(deps, args.actor, finding.primary_managed_system_id, {
        tx,
      });
      if (!readable) throw new HttpError('permission.denied', 'finding.read capability required');

      const rows = await listEvidenceHighlightsByFinding(tx, {
        workspaceId: args.actor.workspace_id,
        findingId: finding.id,
      });
      const items: EvidenceHighlightDto[] = [];
      const visibility: Array<{
        row: EvidenceHighlightRow;
        includeQuote: boolean;
        surveyMeta: string | null;
      }> = [];
      const surveyHighlights = await resolveFindingSurveyHighlights(
        deps,
        tx,
        args.actor,
        finding.id,
        rows.filter((row) => row.source_type === 'survey_response').map((row) => row.id),
      );
      for (const row of rows) {
        if (row.source_type === 'survey_response') {
          const access = surveyHighlights.get(row.id);
          visibility.push({
            row: { ...row, quote_or_summary: access?.approved_excerpt_snapshot ?? null },
            includeQuote: access !== undefined,
            surveyMeta: access
              ? `${access.survey_type} · ${access.survey_display_id} · Identity protected`
              : null,
          });
          continue;
        }
        visibility.push({
          row,
          includeQuote: await canReadEvidenceHighlightSource({ actor: args.actor, row }),
          surveyMeta: null,
        });
      }
      const readableVocIds = [
        ...new Set(
          visibility
            .filter(
              ({ row, includeQuote }) => includeQuote && row.source_type === 'voc' && row.source_id,
            )
            .map(({ row }) => row.source_id as string),
        ),
      ];
      const sourceMetaRows = await listVocSourceMeta(tx, {
        workspaceId: args.actor.workspace_id,
        vocIds: readableVocIds,
      });
      const sourceMetaById = new Map(sourceMetaRows.map((meta) => [meta.id, meta]));

      for (const { row, includeQuote, surveyMeta } of visibility) {
        const sourceMeta =
          includeQuote && row.source_type === 'voc' && row.source_id
            ? sourceMetaById.get(row.source_id)
            : null;
        items.push(
          evidenceHighlightToDto(row, {
            includeQuote,
            source_title: sourceMeta?.title ?? null,
            source_meta: surveyMeta ?? sourceMeta?.display_id ?? null,
          }),
        );
      }
      return { items };
    });
  }
  async function linkEvidence(args: {
    actor: FindingsActor;
    findingId: string;
    input: LinkEvidenceRequest;
  }): Promise<{ status: number; body: { id: string; relation_type: 'evidence_of' } }> {
    const { actor, findingId, input } = args;

    return deps.db.transaction(async (tx) => {
      const finding = await lockFindingById(tx, {
        workspaceId: actor.workspace_id,
        findingId,
      });
      if (!finding) throw new HttpError('not_found.record', 'finding not found');

      const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
        tx,
      });
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const result = await deps.entityLinksService
        .createLink({
          actor,
          source: { type: 'voc', id: input.source_id },
          target: { type: 'finding', id: finding.id },
          relation_type: 'evidence_of',
          visibility: 'internal_only',
          tx,
        })
        .catch((err: unknown) => {
          if (err instanceof HttpError && err.code === 'permission.denied') {
            throw new HttpError('not_found.record', 'source voc not found');
          }
          throw err;
        });

      return {
        status: result.status,
        body: { id: result.link.id, relation_type: 'evidence_of' },
      };
    });
  }

  return {
    ...createEvidenceInventory(deps),
    addEvidenceHighlight,
    attachSurveyEvidence,
    listEvidenceHighlights,
    linkEvidence,
  };
}
