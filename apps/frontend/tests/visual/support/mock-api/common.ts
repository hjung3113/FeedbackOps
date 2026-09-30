import { managedSystemOwnerActors } from '../../fixtures/managed-system-owner';
import { workspaceActorsFixture } from '../../fixtures/permissions';
import { IDS } from '../../fixtures/voc-clusters';
import type { MockApiHandler, MockApiPathMatch } from './shared';
import { errorEnvelope, json } from './shared';
import type { MockApiContext } from './types';

export function createCommonHandlers(context: MockApiContext): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/me',
      handle: (route) =>
        json(route, 200, {
          actor: {
            id: context.reporterActorId,
            external_id: `visual-${context.role}`,
            email: `${context.role}@example.test`,
            display_name: `Visual ${context.role}`,
            role_level: context.role,
          },
          workspace_id: IDS.workspace,
        }),
    },
    {
      method: 'GET',
      path: '/notifications',
      handle: (route, mockContext, url) => {
        const unread = url.searchParams.get('unread');
        const includeArchived = url.searchParams.get('include_archived') === 'true';
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const visible = mockContext.notificationItems.filter(
          (item) =>
            (includeArchived || item.archived_at === null) &&
            (unread === null ||
              (unread === 'true' ? item.read_at === null : item.read_at !== null)),
        );
        const unreadCount = mockContext.notificationItems.filter(
          (item) => item.read_at === null && item.archived_at === null,
        ).length;
        return json(route, 200, {
          items: visible.slice(0, limit),
          page: { has_more: false },
          unread_count: unreadCount,
        });
      },
    },
    {
      method: 'POST',
      path: /^\/notifications\/([^/]+)\/(read|archive)$/,
      handle: async (route, mockContext, _url, pathMatch: MockApiPathMatch) => {
        if (pathMatch === true) throw new Error('Notification mutation path must include captures');
        const [, id, action] = pathMatch;
        const item = mockContext.notificationItems.find((candidate) => candidate.id === id);
        if (!item) {
          await json(route, 404, errorEnvelope(404));
          return;
        }
        const updated =
          action === 'read'
            ? { ...item, read_at: item.read_at ?? '2026-07-21T09:00:00.000Z' }
            : { ...item, archived_at: item.archived_at ?? '2026-07-21T09:00:00.000Z' };
        mockContext.notificationItems = mockContext.notificationItems.map((candidate) =>
          candidate.id === id ? updated : candidate,
        );
        await json(route, 200, updated);
      },
    },
    {
      method: 'GET',
      path: '/nav/counts',
      handle: (route) =>
        json(route, 200, {
          counts: {
            'voc.inbox': 0,
            'voc.triage': 6,
            'voc.my': 2,
            'voc.tab.high': 1,
            'voc.tab.unassigned': 3,
            'voc.clusters': 4,
            'findings.all': 8,
            'surveys.all': 5,
          },
        }),
    },
  ];
}

export function createDefaultActorHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/actors',
      handle: (route, mockContext) =>
        json(
          route,
          200,
          mockContext.options.managedSystemOwner
            ? managedSystemOwnerActors
            : workspaceActorsFixture,
        ),
    },
  ];
}
