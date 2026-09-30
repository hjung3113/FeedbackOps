import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  needMoreInfoPermissionRequestSchema,
  permissionDecisionResultSchema,
  rejectPermissionRequestSchema,
} from '@fops/shared';
import { permissionDecisionResultTemplates } from '../../fixtures/permissions';
import { json } from './shared';
import type { MockApiHandler, MockApiPathMatch } from './shared';

export function createPermissionRequestHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/permissions/requests',
      handle: (route, context) =>
        json(route, 200, {
          requests: context.permissionRequests,
          count: context.permissionRequests.length,
        }),
    },
    {
      method: 'POST',
      path: /^\/permissions\/requests\/([^/]+)\/(approve|reject|need-more-info|deny)$/,
      handle: async (route, context, url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Permission decision path must include captures');
        const [, requestId, rawAction] = pathMatch;
        const action = rawAction as keyof typeof permissionDecisionResultTemplates | undefined;
        const request = route.request();
        if (!requestId || !action)
          throw new Error(`Missing permission decision target for ${request.method()} ${url}`);
        const rawBody = request.postDataJSON();
        const body = parsePermissionDecisionBody(action, rawBody);
        context.postedBodies.push(body);
        context.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        const target = context.permissionRequests.find((candidate) => candidate.id === requestId);
        if (!target)
          throw new Error(`No mutable permission request fixture for ${request.method()} ${url}`);
        const template = permissionDecisionResultTemplates[action];
        target.status = template.status;
        await json(
          route,
          200,
          permissionDecisionResultSchema.parse({ ...template, id: requestId }),
        );
      },
    },
  ];
}

export function parsePermissionDecisionBody(
  action: keyof typeof permissionDecisionResultTemplates,
  body: unknown,
): unknown {
  switch (action) {
    case 'approve':
      return approvePermissionRequestSchema.parse(body);
    case 'reject':
      return rejectPermissionRequestSchema.parse(body);
    case 'need-more-info':
      return needMoreInfoPermissionRequestSchema.parse(body);
    case 'deny':
      return denyPermissionRequestSchema.parse(body);
  }
}
