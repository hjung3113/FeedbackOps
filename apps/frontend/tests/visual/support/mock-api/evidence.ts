import { listEvidenceInventoryResponseSchema } from '@fops/shared';
import {
  EVIDENCE_VISUAL_ID,
  evidenceVisualItem,
  evidenceVisualList,
  evidenceVisualNoteItem,
  evidenceWithheldItem,
} from '../../fixtures/evidence';
import { type MockApiHandler, errorEnvelope, json } from './shared';
import type { MockApiContext } from './types';

export function createEvidenceHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.evidence) return [];
  const scenario = context.options.evidence;
  return [
    {
      method: 'GET',
      path: '/evidence-highlights',
      handle: (route, _context, url) => {
        if (scenario === 'error') return json(route, 500, errorEnvelope(500));
        // The scoped request stays empty; dropping source_type (전체에서 검색) returns a row.
        if (scenario === 'scoped-search-empty') {
          return url.searchParams.has('source_type')
            ? json(
                route,
                200,
                listEvidenceInventoryResponseSchema.parse({ items: [], page: { has_more: false } }),
              )
            : json(
                route,
                200,
                listEvidenceInventoryResponseSchema.parse({
                  items: [evidenceVisualNoteItem],
                  page: { has_more: false },
                }),
              );
        }
        return json(route, 200, evidenceVisualList(scenario));
      },
    },
    {
      method: 'GET',
      path: /^\/evidence-highlights\/[^/]+$/,
      handle: (route, _context, url) =>
        url.pathname !== `/evidence-highlights/${EVIDENCE_VISUAL_ID}`
          ? json(route, 404, errorEnvelope(404))
          : scenario === 'error'
            ? json(route, 500, errorEnvelope(500))
            : json(
                route,
                200,
                scenario === 'withheld'
                  ? evidenceWithheldItem
                  : scenario === 'scoped-search-empty'
                    ? evidenceVisualNoteItem
                    : evidenceVisualItem,
              ),
    },
  ];
}
