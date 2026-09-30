import {
  adminSettingsFixture,
  adminSettingsFixtureSchema,
  adminSettingsPatchSchema,
} from '../../fixtures/admin-settings';
import {
  managedSystemVisualSchema,
  registerManagedSystemVisualBodySchema,
} from '../../fixtures/managed-system-owner';
import {
  permissionRequestComposeBodySchema,
  permissionRequestComposeSuccess,
} from '../../fixtures/permission-request-compose';
import { permissionSettingsFixture } from '../../fixtures/permissions';
import { IDS } from '../../fixtures/voc-clusters';
import { errorEnvelope, json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createAdminMutationHandlers(context: MockApiContext): MockApiHandler[] {
  const { options } = context;
  const handlers: MockApiHandler[] = [];

  if (options.permissionRequestCompose) {
    handlers.push({
      method: 'POST',
      path: '/permission-requests',
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = permissionRequestComposeBodySchema.parse(request.postDataJSON());
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        await json(route, 201, permissionRequestComposeSuccess);
      },
    });
  }

  if (options.managedSystemOwner) {
    handlers.push({
      method: 'POST',
      path: '/managed-systems',
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = registerManagedSystemVisualBodySchema.parse(request.postDataJSON());
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        await json(
          route,
          201,
          managedSystemVisualSchema.parse({
            id: '22222222-2222-4222-8222-222222222274',
            workspace_id: IDS.workspace,
            slug: body.slug,
            name: body.name,
            external_key: body.external_key ?? null,
            default_owner_actor_id: body.default_owner_actor_id ?? null,
            default_owner_team_id: body.default_owner_team_id ?? null,
            archived_at: null,
            archived_by_actor_id: null,
            created_at: '2026-08-03T09:30:00.000Z',
            updated_at: '2026-08-03T09:30:00.000Z',
          }),
        );
      },
    });
  }

  return handlers;
}

export function createWorkspaceSettingHandlers(context: MockApiContext): MockApiHandler[] {
  const handlers: MockApiHandler[] = [
    {
      method: 'GET',
      path: '/workspace/settings',
      handle: (route, mockContext) => {
        const settingsFixture = mockContext.options.adminSettingsScenario
          ? adminSettingsFixture
          : permissionSettingsFixture;
        return json(
          route,
          mockContext.options.adminSettingsScenario === 'error' ? 500 : 200,
          mockContext.options.adminSettingsScenario === 'error'
            ? errorEnvelope(500)
            : settingsFixture,
        );
      },
    },
  ];

  if (context.options.adminSettingsScenario) {
    handlers.push({
      method: 'PATCH',
      path: '/workspace/settings',
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const patch = adminSettingsPatchSchema.parse(request.postDataJSON());
        const next = adminSettingsFixtureSchema.parse({ ...adminSettingsFixture, ...patch });
        mockContext.postedBodies.push(patch);
        mockContext.postedRequests.push({
          body: patch,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        await json(route, 200, next);
      },
    });
  }

  return handlers;
}
