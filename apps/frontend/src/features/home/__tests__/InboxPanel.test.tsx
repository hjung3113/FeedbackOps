import {
  type NotificationDto,
  type NotificationEventType,
  notificationDtoSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InboxPanel, notificationTarget } from '../InboxPanel';

const VOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';

function makeNotification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return notificationDtoSchema.parse({
    id: NOTIFICATION_ID,
    event_type: 'voc.assigned_to_me',
    subject_type: 'voc',
    subject_id: NOTIFICATION_ID,
    summary: 'VOC 담당자로 지정되었습니다.',
    detail: { voc_id: VOC_ID },
    created_at: '2026-07-27T00:00:00.000Z',
    read_at: null,
    archived_at: null,
    ...overrides,
  });
}

const TARGET_CASES: Array<{
  eventType: NotificationEventType;
  subjectType: NotificationDto['subject_type'];
  detail: Record<string, unknown>;
  target: string | null;
}> = [
  {
    eventType: 'voc.assigned_to_me',
    subjectType: 'voc',
    detail: { voc_id: VOC_ID },
    target: `/vocs?view=inbox&selected=${VOC_ID}`,
  },
  {
    eventType: 'voc.reporter_replied',
    subjectType: 'voc',
    detail: { voc_id: VOC_ID },
    target: `/vocs?view=inbox&selected=${VOC_ID}`,
  },
  {
    eventType: 'voc.severity_set_high_or_critical',
    subjectType: 'voc',
    detail: { voc_id: VOC_ID },
    target: `/vocs?view=inbox&selected=${VOC_ID}`,
  },
  {
    eventType: 'task.released',
    subjectType: 'public_update_review_candidate',
    detail: { voc_id: VOC_ID },
    target: `/vocs?view=inbox&selected=${VOC_ID}`,
  },
  {
    eventType: 'task.assigned_to_me',
    subjectType: 'task',
    detail: {},
    target: `/tasks?view=board&param=${NOTIFICATION_ID}`,
  },
  {
    eventType: 'task_request.approved',
    subjectType: 'task_request',
    detail: {},
    target: `/tasks?view=requests&param=${NOTIFICATION_ID}`,
  },
  {
    eventType: 'task_request.rejected',
    subjectType: 'task_request',
    detail: {},
    target: `/tasks?view=requests&param=${NOTIFICATION_ID}`,
  },
  {
    eventType: 'task_request.needs_more_evidence',
    subjectType: 'task_request',
    detail: {},
    target: `/tasks?view=requests&param=${NOTIFICATION_ID}`,
  },
  {
    eventType: 'permission_request.submitted',
    subjectType: 'permission_request',
    detail: {},
    target: `/admin/permissions/requests?selected=${NOTIFICATION_ID}`,
  },
  {
    eventType: 'permission_request.decided',
    subjectType: 'permission_request',
    detail: {},
    target: null,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installNotificationFetch(
  initialItems: NotificationDto[],
  options: { failFirstListRequest?: boolean } = {},
) {
  let items = [...initialItems];
  let listRequests = 0;
  const calls: Array<{ path: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const url = new URL(path, 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ path, method });

    if (url.pathname === '/notifications' && method === 'GET') {
      listRequests += 1;
      if (options.failFirstListRequest && listRequests === 1) {
        return jsonResponse({ code: 'internal.unexpected', message: 'temporary failure' }, 500);
      }
      const unread = url.searchParams.get('unread');
      const visible = items.filter((item) => item.archived_at === null);
      const filtered =
        unread === 'true' ? visible.filter((item) => item.read_at === null) : visible;
      return jsonResponse({
        items: filtered,
        page: { has_more: false },
        unread_count: visible.filter((item) => item.read_at === null).length,
      });
    }

    const mutation = url.pathname.match(/^\/notifications\/([^/]+)\/(read|archive)$/);
    if (mutation && method === 'POST') {
      const [, id, action] = mutation;
      const row = items.find((item) => item.id === id);
      if (!row) return jsonResponse({ code: 'not_found.record', message: 'record not found' }, 404);
      if (action === 'read') {
        const updated = { ...row, read_at: row.read_at ?? '2026-07-28T00:00:00.000Z' };
        items = items.map((item) => (item.id === id ? updated : item));
        return jsonResponse(updated);
      }
      const updated = { ...row, archived_at: '2026-07-28T00:00:00.000Z' };
      items = items.map((item) => (item.id === id ? updated : item));
      return jsonResponse(updated);
    }

    return jsonResponse({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return { calls, fetchMock };
}

function renderInbox() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <InboxPanel />,
  });
  const vocs = createRoute({ getParentRoute: () => root, path: '/vocs', component: () => null });
  const tasks = createRoute({ getParentRoute: () => root, path: '/tasks', component: () => null });
  const permissionRequests = createRoute({
    getParentRoute: () => root,
    path: '/admin/permissions/requests',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, vocs, tasks, permissionRequests]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  const push = vi.spyOn(router.history, 'push');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { push, queryClient, router };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('notificationTarget', () => {
  it.each(TARGET_CASES)(
    'maps $eventType to its in-app destination',
    ({ eventType, subjectType, detail, target }) => {
      expect(
        notificationTarget(
          makeNotification({
            event_type: eventType,
            subject_type: subjectType,
            detail,
          }),
        ),
      ).toBe(target);
    },
  );

  it('treats a VOC event without a string detail.voc_id as having no destination', () => {
    expect(notificationTarget(makeNotification({ detail: {} }))).toBeNull();
    expect(notificationTarget(makeNotification({ detail: { voc_id: 42 } }))).toBeNull();
  });
});

describe('InboxPanel', () => {
  it('requests unread by default and omits the unread filter for All', async () => {
    const { calls } = installNotificationFetch([makeNotification()]);
    renderInbox();
    await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() =>
      expect(calls.some(({ path, method }) => method === 'GET' && path === '/notifications')).toBe(
        true,
      ),
    );

    expect(calls.some(({ path }) => path.includes('unread=true'))).toBe(true);
    expect(calls.some(({ path }) => path === '/notifications?unread=false')).toBe(false);
  });

  it('marks an unread VOC as read and navigates to its detail route', async () => {
    const { calls } = installNotificationFetch([makeNotification()]);
    const { push } = renderInbox();

    fireEvent.click(await screen.findByRole('link', { name: 'VOC 담당자로 지정되었습니다.' }));

    await waitFor(() =>
      expect(
        calls.some(
          ({ path, method }) =>
            path === `/notifications/${NOTIFICATION_ID}/read` && method === 'POST',
        ),
      ).toBe(true),
    );
    expect(push.mock.calls[0]?.[0]).toBe(`/vocs?view=inbox&selected=${VOC_ID}`);
  });

  it('navigates from an already-read row without sending a read request', async () => {
    const { calls } = installNotificationFetch([
      makeNotification({ read_at: '2026-07-27T01:00:00.000Z' }),
    ]);
    const { push } = renderInbox();

    fireEvent.click(await screen.findByRole('radio', { name: 'All' }));
    fireEvent.click(await screen.findByRole('link', { name: 'VOC 담당자로 지정되었습니다.' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.filter(({ method, path }) => method === 'POST' && path.endsWith('/read'))).toEqual(
      [],
    );
    expect(push.mock.calls[0]?.[0]).toBe(`/vocs?view=inbox&selected=${VOC_ID}`);
  });

  it('marks a permission decision as read without navigating', async () => {
    const permissionDecision = makeNotification({
      event_type: 'permission_request.decided',
      subject_type: 'permission_request',
      summary: '권한 요청이 처리되었습니다.',
      detail: {},
    });
    const { calls } = installNotificationFetch([permissionDecision]);
    const { push } = renderInbox();

    fireEvent.click(await screen.findByRole('button', { name: '권한 요청이 처리되었습니다.' }));

    await waitFor(() =>
      expect(
        calls.some(
          ({ path, method }) =>
            path === `/notifications/${NOTIFICATION_ID}/read` && method === 'POST',
        ),
      ).toBe(true),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('archives a row and removes it after the list refetches', async () => {
    installNotificationFetch([makeNotification()]);
    renderInbox();
    await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(screen.queryByTestId(`home-inbox-row-${NOTIFICATION_ID}`)).not.toBeInTheDocument(),
    );
  });

  it('shows both filter-specific empty states', async () => {
    installNotificationFetch([]);
    renderInbox();

    await screen.findByText('읽지 않은 알림이 없습니다.');
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    await screen.findByText('받은 알림이 없습니다.');
  });

  it('shows the list error and Retry refetches it', async () => {
    const { calls } = installNotificationFetch([], { failFirstListRequest: true });
    renderInbox();

    await screen.findByText('알림을 불러오지 못했습니다.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('읽지 않은 알림이 없습니다.');
    expect(calls.filter(({ method }) => method === 'GET')).toHaveLength(2);
  });
});
