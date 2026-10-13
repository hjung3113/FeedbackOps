import {
  type EvidenceInventoryItem,
  type ListEvidenceInventoryQuery,
  type ListEvidenceInventoryResponse,
  evidenceInventoryItemSchema,
} from '@fops/shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { ListCursor } from '../../lib/list-cursor.js';
import { resolveInventorySurveyHighlights } from '../surveys/evidence-access.js';
import { readVocEvidenceSources } from '../voc/index.js';
import { hasElevatedFindingRole, readableEvidenceInventorySystems } from './authorization.js';
import {
  decodeEvidenceInventoryCursor,
  encodeEvidenceInventoryCursor,
  inventoryCursorContext,
} from './evidence-inventory-cursor.js';
import {
  type EvidenceInventoryRow,
  listPrimaryManagedSystemIds,
  readEvidenceInventoryBatch,
} from './repo-read.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

// Memory and source hydration are bounded independently of search selectivity.
const BATCH_SIZE = 100;
function assertRole(actor: FindingsActor) {
  if (!hasElevatedFindingRole(actor))
    throw new HttpError('permission.denied', 'elevated finding.read capability required');
}
function matches(item: EvidenceInventoryItem, q: string): boolean {
  const labels = [item.finding.title, item.finding.display_id];
  if (item.content_state === 'available') labels.push(item.quote_or_summary ?? '');
  if (item.source_type === 'voc' && item.source)
    labels.push(item.source.title, item.source.display_id);
  if (item.source_type === 'survey_response' && item.source)
    labels.push(item.source.survey_type, item.source.survey_display_id, item.source.question_label);
  return labels.some((text) => text.toLowerCase().includes(q));
}

export function createEvidenceInventory(deps: FindingsServiceDeps) {
  async function systems(tx: Tx, actor: FindingsActor, managedSystemId?: string) {
    const ids = await listPrimaryManagedSystemIds(tx, {
      workspaceId: actor.workspace_id,
      ...(managedSystemId === undefined || managedSystemId === 'all' ? {} : { managedSystemId }),
    });
    return readableEvidenceInventorySystems(deps.checkService, actor, ids, tx);
  }
  async function project(tx: Tx, actor: FindingsActor, rows: EvidenceInventoryRow[]) {
    const voc = await readVocEvidenceSources(deps.checkService, tx, actor, [
      ...new Set(
        rows
          .filter((row) => row.source_type === 'voc' && row.source_id)
          .flatMap((row) => (row.source_id === null ? [] : [row.source_id])),
      ),
    ]);
    const survey = await resolveInventorySurveyHighlights(
      deps,
      tx,
      actor,
      rows.filter((row) => row.source_type === 'survey_response').map((row) => row.id),
    );
    return rows.map((row) => {
      const base = {
        id: row.id,
        finding_id: row.finding_id,
        primary_managed_system_id: row.primary_managed_system_id,
        analytics_area_id: row.analytics_area_id,
        sentiment: row.sentiment,
        importance: row.importance,
        created_at: row.created_at.toISOString(),
        finding: {
          id: row.finding_id,
          display_id: row.finding_display_id,
          title: row.finding_title,
        },
      };
      const source =
        row.source_type === 'voc' && row.source_id ? voc.get(row.source_id) : undefined;
      const approved = row.source_type === 'survey_response' ? survey.get(row.id) : undefined;
      const quote =
        row.source_type === 'note'
          ? row.quote_or_summary
          : row.source_type === 'voc'
            ? source
              ? row.quote_or_summary
              : null
            : (approved?.approved_excerpt_snapshot ?? null);
      return evidenceInventoryItemSchema.parse({
        ...base,
        source_type: row.source_type,
        content_state: quote === null ? 'withheld' : 'available',
        ...(quote === null ? {} : { quote_or_summary: quote }),
        ...(quote !== null && source ? { source } : {}),
        ...(approved
          ? {
              source: {
                survey_type: approved.survey_type,
                survey_display_id: approved.survey_display_id,
                question_label: approved.question_label,
                identity_protected: approved.identity_protected,
              },
            }
          : {}),
      });
    });
  }
  async function listEvidenceInventory(args: {
    actor: FindingsActor;
    query: ListEvidenceInventoryQuery;
  }): Promise<ListEvidenceInventoryResponse> {
    assertRole(args.actor);
    const context = inventoryCursorContext(args.actor, args.query);
    let after: ListCursor | undefined =
      args.query.cursor === undefined
        ? undefined
        : decodeEvidenceInventoryCursor(args.query.cursor, context);
    const matchesWithRows: Array<{ item: EvidenceInventoryItem; row: EvidenceInventoryRow }> = [];
    while (matchesWithRows.length <= args.query.limit) {
      // Locks never span hydration batches. Each batch authorizes parents and source
      // content together; the Survey reader sorts ALL response locks within the batch.
      const { rows, items } = await deps.db.transaction(async (tx) => {
        const allowedSystemIds = await systems(tx, args.actor, args.query.managed_system_id);
        const rows = await readEvidenceInventoryBatch(tx, {
          workspaceId: args.actor.workspace_id,
          allowedSystemIds,
          limit: BATCH_SIZE,
          ...(args.query.source_type === undefined ? {} : { sourceType: args.query.source_type }),
          ...(after === undefined ? {} : { cursor: after }),
        });
        return { rows, items: await project(tx, args.actor, rows) };
      });
      for (let i = 0; i < rows.length; i++) {
        const item = items[i];
        const row = rows[i];
        if (!item || !row) throw new Error('inventory projection missing row');
        if (matches(item, context.q)) matchesWithRows.push({ item, row });
        if (matchesWithRows.length > args.query.limit) break;
      }
      if (matchesWithRows.length > args.query.limit || rows.length < BATCH_SIZE) break;
      const last = rows.at(-1);
      if (!last) break;
      after = { id: last.id, timestamp: last.cursor_timestamp };
    }
    const hasMore = matchesWithRows.length > args.query.limit;
    const page = matchesWithRows.slice(0, args.query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ item }) => item),
      page: {
        has_more: hasMore,
        ...(hasMore && last
          ? {
              cursor: encodeEvidenceInventoryCursor({
                ...context,
                id: last.row.id,
                timestamp: last.row.cursor_timestamp,
              }),
            }
          : {}),
      },
    };
  }
  async function getEvidenceInventoryItem(args: {
    actor: FindingsActor;
    highlightId: string;
  }): Promise<EvidenceInventoryItem> {
    assertRole(args.actor);
    return deps.db.transaction(async (tx) => {
      const allowedSystemIds = await systems(tx, args.actor);
      const rows = await readEvidenceInventoryBatch(tx, {
        workspaceId: args.actor.workspace_id,
        allowedSystemIds,
        highlightId: args.highlightId,
        limit: 1,
      });
      const item = (await project(tx, args.actor, rows))[0];
      if (!item) throw new HttpError('not_found.record', 'evidence highlight not found');
      return item;
    });
  }
  return { listEvidenceInventory, getEvidenceInventoryItem };
}
