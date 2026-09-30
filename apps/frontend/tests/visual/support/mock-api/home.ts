import { homeMyWorkRequestsFixture, homeOpenPermissionRequestsFixture } from '../../fixtures/home';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from '../types';

export function createHomeRequestHandlers(context: MockApiContext): MockApiHandler[] {
  const { home } = context.options;
  if (!home) return [];

  return [
    {
      method: 'GET',
      path: '/task-requests',
      handle: (route) =>
        json(route, 200, {
          items: home === 'populated' || home === 'unscoped' ? homeMyWorkRequestsFixture : [],
        }),
    },
    {
      method: 'GET',
      path: '/permission-requests/mine',
      handle: (route) =>
        json(route, 200, {
          requests:
            home === 'populated' || home === 'unscoped' ? homeOpenPermissionRequestsFixture : [],
        }),
    },
  ];
}
