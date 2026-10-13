import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  directPermissionGrantSchema,
  needMoreInfoPermissionRequestSchema,
  permissionDecisionResultSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  rejectPermissionRequestSchema,
  revokePermissionBodySchema,
  revokePermissionResultSchema,
} from '@fops/shared';
import {
  PERMISSION_GRANTS_IDS,
  directGrantPermissionOptions,
} from '../../fixtures/permission-grants';
import {
  permissionAdminDetailFixture,
  permissionDecisionResultTemplates,
} from '../../fixtures/permissions';
import { json } from './shared';
import type { MockApiHandler, MockApiPathMatch } from './shared';

export function createPermissionRequestHandlers(): MockApiHandler[] {
  let staleInjected = false;
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
      method: 'GET',
      path: /^\/permissions\/requests\/([^/]+)$/,
      handle: async (route, context, _url, match) => {
        const target = context.permissionRequests.find(
          (row) => match !== true && row.id === match[1],
        );
        await json(
          route,
          target ? 200 : 404,
          target
            ? permissionAdminDetailFixture(
                target,
                context.options.permissionScenario === 'risk-signals',
              )
            : { code: 'not_found.record', message: 'not found' },
        );
      },
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
        if (context.options.permissionScenario === 'stale-review' && !staleInjected) {
          staleInjected = true;
          target.revision += 1;
          target.reason = '요청자가 검토 중에 사유를 수정했습니다.';
        }
        if (
          (body as { expected_revision: number }).expected_revision !== target.revision ||
          !['pending', 'needs_more_info'].includes(target.status)
        ) {
          await json(route, 409, {
            code: 'conflict.stale_write',
            message: 'stale',
            detail: { current_revision: target.revision },
          });
          return;
        }
        const template = permissionDecisionResultTemplates[action];
        target.status = template.status;
        target.revision += 1;
        await json(
          route,
          200,
          permissionDecisionResultSchema.parse({
            ...template,
            id: requestId,
            revision: target.revision,
          }),
        );
      },
    },
  ];
}

export function createPermissionGrantHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/permissions/grant-options',
      handle: (route, context, url) => {
        const actorId = url.searchParams.get('actor_id');
        if (
          context.options.permissionGrantsScenario !== 'direct-grant-form' ||
          actorId !== PERMISSION_GRANTS_IDS.actor
        ) {
          return json(route, 404, { code: 'not_found.record', message: 'actor not found' });
        }
        return json(route, 200, permissionGrantOptionsSchema.parse(directGrantPermissionOptions));
      },
    },
    {
      method: 'GET',
      path: '/permissions/grants',
      handle: (route, context) => json(route, 200, { items: context.permissionGrants.grants }),
    },
    {
      method: 'POST',
      path: '/permissions/grants',
      handle: async (route, context) => {
        const body = directPermissionGrantSchema.parse(route.request().postDataJSON());
        context.postedBodies.push(body);
        context.postedRequests.push({
          body,
          idempotencyKey: await route.request().headerValue('Idempotency-Key'),
          pathname: '/permissions/grants',
        });
        const item = permissionGrantAdminItemSchema.parse({
          id: '88888888-8888-4888-8888-888888888888',
          actor_id: body.actor_id,
          capability: body.capability,
          managed_system_id: body.managed_system_id ?? null,
          granted_by_actor_id: context.reporterActorId,
          granted_at: '2026-07-22T09:00:00.000Z',
          expires_at: body.expires_at ?? null,
        });
        context.permissionGrants.grants.unshift(item);
        await json(route, 200, item);
      },
    },
    {
      method: 'GET',
      path: '/permissions/denies',
      handle: (route, context) => json(route, 200, { items: context.permissionGrants.denies }),
    },
    {
      method: 'POST',
      path: /^\/permissions\/(grants|denies)\/([^/]+)\/revoke$/,
      handle: async (route, context, url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Permission revoke path must include captures');
        const [, rawKind, id] = pathMatch;
        if (!id || (rawKind !== 'grants' && rawKind !== 'denies')) {
          throw new Error(
            `Missing permission revoke target for ${route.request().method()} ${url}`,
          );
        }
        const kind = rawKind;
        const body = revokePermissionBodySchema.parse(route.request().postDataJSON());
        context.postedBodies.push(body);
        context.postedRequests.push({
          body,
          idempotencyKey: await route.request().headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        const items =
          kind === 'grants' ? context.permissionGrants.grants : context.permissionGrants.denies;
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) throw new Error(`No active permission fixture for ${kind} ${id}`);
        items.splice(index, 1);
        await json(
          route,
          200,
          revokePermissionResultSchema.parse({ id, revoked_at: '2026-07-18T00:00:00.000Z' }),
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
