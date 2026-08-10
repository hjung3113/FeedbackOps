import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AppSidebar } from '../../../lib/layout/AppSidebar';
import { AdminSettingsPage } from './settings';

const resolvedSettings = {
  permission_self_approval: 'forbidden' as const,
  survey_anonymity_threshold: 9,
};

type PermissionResponse =
  | { kind: 'approved' }
  | { kind: 'blocked' }
  | { kind: 'error' }
  | { kind: 'pending' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(options: {
  permission?: PermissionResponse;
  settingsStatus?: number;
  patchStatus?: number;
  onPatch?: (body: unknown) => void;
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/me/permissions/check')) {
      const permission = options.permission ?? { kind: 'approved' };
      if (permission.kind === 'pending') return new Promise<Response>(() => undefined);
      if (permission.kind === 'error')
        return jsonResponse({ code: 'internal.unexpected', message: 'nope' }, 500);
      return jsonResponse({
        state: permission.kind === 'approved' ? 'approved' : 'blocked_non_requestable',
        decision: { allow: permission.kind === 'approved' },
      });
    }
    if (url === '/workspace/settings' && (!init?.method || init.method === 'GET')) {
      return jsonResponse(
        options.settingsStatus === undefined || options.settingsStatus === 200
          ? resolvedSettings
          : { code: 'internal.unexpected', message: 'nope' },
        options.settingsStatus ?? 200,
      );
    }
    if (url === '/workspace/settings' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      options.onPatch?.(body);
      return jsonResponse(
        options.patchStatus === undefined || options.patchStatus === 200
          ? { ...resolvedSettings, ...body }
          : { code: 'internal.unexpected', message: 'nope' },
        options.patchStatus ?? 200,
      );
    }
    return jsonResponse({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderRoute() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/settings',
    component: AdminSettingsPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([settingsRoute]),
    history: createMemoryHistory({ initialEntries: ['/admin/settings'] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function thresholdEditButton() {
  const button = screen.getAllByRole('button', { name: 'Edit' })[1];
  if (!button) throw new Error('Anonymity threshold edit button is missing');
  return button;
}

describe('/admin/settings route', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test.each([
    ['loading', { kind: 'pending' }],
    ['error', { kind: 'error' }],
    ['capability absent', { kind: 'blocked' }],
  ] as const)('fails closed when /me permission is %s', async (_name, permission) => {
    installFetch({ permission });
    renderRoute();

    if (permission.kind === 'pending') {
      expect(await screen.findByText('Checking access…')).toBeInTheDocument();
    } else {
      await screen.findByText('Access blocked');
    }
    expect(screen.queryByTestId('workspace-settings-screen')).not.toBeInTheDocument();
  });

  test('renders resolved settings and five read-only locked policies', async () => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    expect(
      screen.getByText('Self-approval of Permission Request', { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Self-approval of Task Request', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '다른 Managed System 의 entity 를 참조·연결할 수 있는지 결정합니다. 차단된 경우 PermissionBlockedPanel 로 표시됩니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '명시 거부(denied) 이후 재요청을 허용하는 기간입니다. 0 이면 정책 갱신 전까지 재요청 불가.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Admin 만 all 을 workspace-wide 로 해석합니다. 다른 역할은 effective scope union (교집합 = workspace ∩ grants) 으로 해석합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Forbidden', { exact: true })).toHaveLength(2);
    expect(
      screen.getByText('Survey Response → VOC').closest('div[class*="grid"]'),
    ).toHaveTextContent('Forbidden');
    expect(
      screen
        .getByText('Survey Response → VOC')
        .closest('div[class*="grid"]')
        ?.querySelector('.text-accent-danger'),
    ).toHaveTextContent('Forbidden');
    expect(screen.getByText('9 responses', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('정책 강제 연결 후 편집 가능')).not.toBeInTheDocument();
    for (const label of [
      'Cross-Managed-System linking',
      'Permission request appeal window',
      'Survey Response → VOC',
      'Default Managed System scope (Developer)',
      'all = workspace-wide',
    ]) {
      const row = screen.getByText(label, { exact: true }).closest('div[class*="grid"]');
      expect(row?.querySelector('button,input,select')).toBeNull();
    }
  });

  test('shows the self-approval retro warning only while that field is dirty', async () => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    expect(
      screen.queryByText('Retro 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).not.toBeInTheDocument();

    const selfApprovalEditButton = screen.getAllByRole('button', { name: 'Edit' })[0];
    if (!selfApprovalEditButton) throw new Error('Self-approval edit button is missing');
    fireEvent.click(selfApprovalEditButton);
    fireEvent.change(screen.getByLabelText('Self-approval'), {
      target: { value: 'allowed' },
    });

    expect(
      screen.getByText('Retro 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^active capability grant —/)).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ active capability grant$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(
      screen.queryByText('Retro 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).not.toBeInTheDocument();
  });

  test('patches only the changed field, applies its response, and discards local edits', async () => {
    const patches: unknown[] = [];
    installFetch({ onPatch: (body) => patches.push(body) });
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    const threshold = screen.getByLabelText('Anonymity threshold');
    fireEvent.change(threshold, { target: { value: '12' } });
    expect(screen.getByTestId('workspace-settings-save-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patches).toEqual([{ survey_anonymity_threshold: 12 }]));
    await waitFor(() =>
      expect(screen.getByText('12 responses', { exact: true })).toBeInTheDocument(),
    );

    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('Anonymity threshold'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('workspace-settings-save-bar')).not.toBeInTheDocument();
    expect(screen.getByText('12 responses', { exact: true })).toBeInTheDocument();
  });

  test('keeps the draft and save bar visible when patching fails', async () => {
    installFetch({ patchStatus: 500 });
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('Anonymity threshold'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workspace settings 저장에 실패했습니다.',
    );
    expect(screen.getByTestId('workspace-settings-save-bar')).toBeInTheDocument();
    expect(screen.getByLabelText('Anonymity threshold')).toHaveValue(12);
    expect(screen.getByText('Previously:')).toHaveTextContent('9 responses');
  });

  test('shows dirty row parity and changed field names, then clears them after save or discard', async () => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('Anonymity threshold'), { target: { value: '12' } });

    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.getByText('Previously:')).toHaveTextContent('9 responses');
    const saveBar = screen.getByTestId('workspace-settings-save-bar');
    expect(saveBar).toHaveTextContent('1 unsaved change');
    expect(saveBar).toHaveTextContent('Anonymity threshold');

    const selfApprovalEditButton = screen.getAllByRole('button', { name: 'Edit' })[0];
    if (!selfApprovalEditButton) throw new Error('Self-approval edit button is missing');
    fireEvent.click(selfApprovalEditButton);
    fireEvent.change(screen.getByLabelText('Self-approval'), {
      target: { value: 'allowed' },
    });
    expect(saveBar).toHaveTextContent('2 unsaved changes');
    expect(saveBar).toHaveTextContent('Self-approval of Permission Request · Anonymity threshold');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByText('Unsaved')).not.toBeInTheDocument());

    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('Anonymity threshold'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument();
    expect(screen.queryByText('Previously:')).not.toBeInTheDocument();
  });

  test.each(['4', '51'])('blocks save for an anonymity threshold of %s', async (invalid) => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('Anonymity threshold'), { target: { value: invalid } });
    expect(screen.getByText('5에서 50 사이의 정수를 입력하세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('removes the placeholder destination from the default settings navigation', () => {
    render(<AppSidebar entries={[]} />);
    const settings = screen.getByTestId('sidebar-footer-workspace-settings');
    expect(settings).toHaveAttribute('href', '/admin/settings');
    expect(settings).not.toHaveAttribute('href', '/admin/placeholder');
  });
});
