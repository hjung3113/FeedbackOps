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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InboxPanel, notificationTarget } from '../InboxPanel';

const VOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
const REFERENCED_NOTIFICATION_ID = '22222222-2222-4222-8222-222222222222';
const UNAVAILABLE_NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333';
const LONG_SUBJECT_TITLE =
  'A long VOC title that should remain available to people who need the complete subject text';

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
    target: `/admin/permissions/requests?tab=all&selected=${NOTIFICATION_ID}`,
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
  options: {
    failFirstListRequest?: boolean;
    hasMore?: boolean;
    holdSecondListRequest?: boolean;
  } = {},
) {
  let items = [...initialItems];
  let listRequests = 0;
  let releaseHeldListRequest: (() => void) | undefined;
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
      const response = jsonResponse({
        items: filtered,
        page: {
          has_more: options.hasMore ?? false,
          ...(options.hasMore ? { cursor: 'next-page' } : {}),
        },
        unread_count: visible.filter((item) => item.read_at === null).length,
      });
      if (options.holdSecondListRequest && listRequests === 2) {
        return new Promise<Response>((resolve) => {
          releaseHeldListRequest = () => resolve(response);
        });
      }
      return response;
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
  return { calls, fetchMock, releaseHeldListRequest: () => releaseHeldListRequest?.() };
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
  it('shows allowed subject references and hides unavailable subject text', async () => {
    const allowed = makeNotification({
      id: REFERENCED_NOTIFICATION_ID,
      subject_ref: {
        visibility_state: 'allowed',
        display_id: 'VOC-0123',
        title: 'Could not submit the form',
      },
    });
    const unavailable = makeNotification({
      id: UNAVAILABLE_NOTIFICATION_ID,
      subject_ref: { visibility_state: 'unavailable' },
    });
    installNotificationFetch([allowed, unavailable]);
    renderInbox();

    const allowedRow = await screen.findByTestId(`home-inbox-row-${REFERENCED_NOTIFICATION_ID}`);
    const unavailableRow = await screen.findByTestId(
      `home-inbox-row-${UNAVAILABLE_NOTIFICATION_ID}`,
    );
    expect(within(allowedRow).getByText('VOC-0123')).toBeInTheDocument();
    expect(within(allowedRow).getByText('Could not submit the form')).toBeInTheDocument();
    expect(within(unavailableRow).getByText('접근할 수 없는 항목')).toBeInTheDocument();
    expect(within(unavailableRow).queryByText('Could not submit the form')).not.toBeInTheDocument();
  });

  it.each([
    { subjectState: 'allowed', interaction: 'hover', shouldShowTooltip: true },
    { subjectState: 'allowed', interaction: 'focus', shouldShowTooltip: true },
    { subjectState: 'unavailable', interaction: 'hover', shouldShowTooltip: false },
    { subjectState: 'unavailable', interaction: 'focus', shouldShowTooltip: false },
  ] as const)(
    'handles $subjectState subject title on row $interaction',
    async ({ subjectState, interaction, shouldShowTooltip }) => {
      const allowed = makeNotification({
        id: REFERENCED_NOTIFICATION_ID,
        subject_ref: {
          visibility_state: 'allowed',
          display_id: 'VOC-0123',
          title: LONG_SUBJECT_TITLE,
        },
      });
      const unavailable = makeNotification({
        id: UNAVAILABLE_NOTIFICATION_ID,
        subject_ref: { visibility_state: 'unavailable' },
      });
      installNotificationFetch([allowed, unavailable]);
      renderInbox();

      const rowId =
        subjectState === 'allowed' ? REFERENCED_NOTIFICATION_ID : UNAVAILABLE_NOTIFICATION_ID;
      const row = await screen.findByTestId(`home-inbox-row-${rowId}`);
      const link = within(row).getByRole('link');
      expect(within(row).getAllByRole('link')).toHaveLength(1);
      expect(within(row).getAllByRole('button')).toHaveLength(2);

      if (interaction === 'hover') {
        fireEvent.pointerMove(link, { pointerType: 'mouse' });
      } else {
        fireEvent.focus(link);
      }

      if (shouldShowTooltip) {
        expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_SUBJECT_TITLE);
      } else {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 450));
        });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      }
    },
  );

  it.each([
    { subjectState: 'allowed', interaction: 'hover', shouldShowTooltip: true },
    { subjectState: 'allowed', interaction: 'focus', shouldShowTooltip: true },
    { subjectState: 'unavailable', interaction: 'hover', shouldShowTooltip: false },
    { subjectState: 'unavailable', interaction: 'focus', shouldShowTooltip: false },
  ] as const)(
    'keeps the read/no-target Archive tab stop for a $subjectState subject on $interaction',
    async ({ subjectState, interaction, shouldShowTooltip }) => {
      const user = userEvent.setup();
      const readPermissionDecision = makeNotification({
        id: REFERENCED_NOTIFICATION_ID,
        event_type: 'permission_request.decided',
        subject_type: 'permission_request',
        summary: '권한 요청이 처리되었습니다.',
        detail: {},
        read_at: '2026-07-27T01:00:00.000Z',
        subject_ref:
          subjectState === 'allowed'
            ? {
                visibility_state: 'allowed',
                display_id: 'PR-0123',
                title: LONG_SUBJECT_TITLE,
              }
            : { visibility_state: 'unavailable' },
      });
      installNotificationFetch([makeNotification(), readPermissionDecision]);
      renderInbox();

      await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);
      fireEvent.click(screen.getByRole('radio', { name: '전체' }));
      const row = await screen.findByTestId(`home-inbox-row-${REFERENCED_NOTIFICATION_ID}`);
      const archive = within(row).getByRole('button', { name: '보관' });

      expect(within(row).queryByRole('link')).not.toBeInTheDocument();
      expect(within(row).getAllByRole('button')).toEqual([archive]);
      expect(
        Array.from(
          row.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        ),
      ).toEqual([archive]);

      if (interaction === 'hover') {
        fireEvent.pointerMove(archive, { pointerType: 'mouse' });
      } else {
        screen.getByRole('radio', { name: '전체' }).focus();
        for (let tab = 0; tab < 4; tab += 1) await user.tab();
        expect(archive).toHaveFocus();
      }

      if (shouldShowTooltip) {
        expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_SUBJECT_TITLE);
      } else {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 450));
        });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      }
    },
  );

  it('requests unread by default and omits the unread filter for All', async () => {
    const { calls } = installNotificationFetch([makeNotification()]);
    renderInbox();
    await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    expect(screen.getByRole('radio', { name: '읽지 않음' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: '전체' }));
    await waitFor(() =>
      expect(calls.some(({ path, method }) => method === 'GET' && path === '/notifications')).toBe(
        true,
      ),
    );

    expect(calls.some(({ path }) => path.includes('unread=true'))).toBe(true);
    expect(calls.some(({ path }) => path === '/notifications?unread=false')).toBe(false);
    expect(screen.getByRole('radio', { name: '읽지 않음' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'true');
  });

  it('marks an unread VOC as read and navigates to its detail route', async () => {
    const { calls } = installNotificationFetch([makeNotification()]);
    const { push } = renderInbox();

    fireEvent.click(await screen.findByRole('link', { name: /VOC 담당자로/ }));

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

    fireEvent.click(await screen.findByRole('radio', { name: '전체' }));
    fireEvent.click(await screen.findByRole('link', { name: /VOC 담당자로/ }));
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

    fireEvent.click(
      await screen.findByRole('button', { name: /권한 요청이 처리되었습니다.*읽음으로 표시/ }),
    );

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

  it('keeps an already-read permission decision main area noninteractive while allowing Archive', async () => {
    const permissionDecision = makeNotification({
      event_type: 'permission_request.decided',
      subject_type: 'permission_request',
      summary: '권한 요청이 처리되었습니다.',
      detail: {},
      read_at: '2026-07-27T01:00:00.000Z',
    });
    installNotificationFetch([permissionDecision]);
    renderInbox();

    fireEvent.click(await screen.findByRole('radio', { name: '전체' }));
    const row = await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /권한 요청이 처리되었습니다/ }),
    ).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '보관' })).toBeInTheDocument();
    expect(within(row).getAllByRole('button')).toHaveLength(1);
  });

  it('disables Load more while the notification list refetches', async () => {
    const { calls, releaseHeldListRequest } = installNotificationFetch([makeNotification()], {
      hasMore: true,
      holdSecondListRequest: true,
    });
    renderInbox();
    await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    const loadMore = screen.getByRole('button', { name: '더 불러오기' });
    expect(loadMore).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '보관' }));
    await waitFor(() =>
      expect(
        calls.filter(({ method, path }) => method === 'GET' && path.startsWith('/notifications')),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(loadMore).toBeDisabled());

    releaseHeldListRequest();
    await waitFor(() => expect(loadMore).toBeEnabled());
  });

  it('archives a row and removes it after the list refetches', async () => {
    installNotificationFetch([makeNotification()]);
    renderInbox();
    await screen.findByTestId(`home-inbox-row-${NOTIFICATION_ID}`);

    fireEvent.click(screen.getByRole('button', { name: '보관' }));

    await waitFor(() =>
      expect(screen.queryByTestId(`home-inbox-row-${NOTIFICATION_ID}`)).not.toBeInTheDocument(),
    );
  });

  it('shows both filter-specific empty states', async () => {
    installNotificationFetch([]);
    renderInbox();

    const unreadEmpty = await screen.findByTestId('list-state-message');
    expect(unreadEmpty).toHaveAttribute('data-variant', 'empty');
    expect(within(unreadEmpty).getByText('읽지 않은 알림이 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '전체' }));
    const allEmpty = await screen.findByTestId('list-state-message');
    expect(allEmpty).toHaveAttribute('data-variant', 'empty');
    expect(within(allEmpty).getByText('받은 알림이 없습니다.')).toBeInTheDocument();
  });

  it('shows the list error and Retry refetches it', async () => {
    const { calls } = installNotificationFetch([], { failFirstListRequest: true });
    renderInbox();

    await screen.findByText('알림을 불러오지 못했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('읽지 않은 알림이 없습니다.');
    expect(calls.filter(({ method }) => method === 'GET')).toHaveLength(2);
  });
});
