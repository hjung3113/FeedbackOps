import {
  EVIDENCE_VISUAL_ID,
  evidenceVisualItem,
  evidenceVisualList,
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
      handle: (route) =>
        scenario === 'error'
          ? json(route, 500, errorEnvelope(500))
          : json(route, 200, evidenceVisualList(scenario)),
    },
    {
      method: 'GET',
      path: /^\/evidence-highlights\/[^/]+$/,
      handle: (route, _context, url) =>
        url.pathname !== `/evidence-highlights/${EVIDENCE_VISUAL_ID}`
          ? json(route, 404, errorEnvelope(404))
          : scenario === 'error'
            ? json(route, 500, errorEnvelope(500))
            : json(route, 200, scenario === 'withheld' ? evidenceWithheldItem : evidenceVisualItem),
    },
  ];
}
