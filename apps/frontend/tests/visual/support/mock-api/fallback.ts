import { json } from './shared';
import type { MockApiHandler } from './shared';

export function createFindingListFallbackHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/findings',
      handle: (route, context) => json(route, 200, { items: context.scenario.findings }),
    },
  ];
}

export function createCommentHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: /^\/(findings|tasks)\/[^/]+\/comments$/,
      handle: (route) => json(route, 200, { items: [], page: { has_more: false } }),
    },
  ];
}
