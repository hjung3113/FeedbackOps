import { json } from './shared';
import type { MockApiHandler } from './shared';

export function createPermissionContextHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/me/permissions/check',
      handle: (route, context) =>
        json(route, 200, {
          state: context.options.permissionRequestCompose
            ? 'request_access'
            : context.role === 'admin'
              ? 'approved'
              : 'blocked_non_requestable',
          decision: {
            allow: context.role === 'admin' && !context.options.permissionRequestCompose,
          },
        }),
    },
    {
      method: 'GET',
      path: '/me/permissions/scope',
      handle: (route, context) =>
        json(route, 200, {
          scope:
            context.role === 'admin' ? { kind: 'all' } : { kind: 'scoped', managed_system_ids: [] },
        }),
    },
  ];
}
