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
  const button = screen.getAllByRole('button', { name: '편집' })[1];
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
      expect(await screen.findByText('접근 확인 중…')).toBeInTheDocument();
    } else {
      await screen.findByText('접근할 수 없습니다.');
    }
    expect(screen.queryByTestId('workspace-settings-screen')).not.toBeInTheDocument();
  });

  test('renders resolved settings and five read-only locked policies', async () => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    expect(screen.getByText('권한 요청 직접 승인', { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByText('Self-approval of Task Request', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '다른 Managed System의 항목을 참조하거나 연결할 수 있는지 결정합니다. 접근할 수 없는 항목에는 차단 안내가 표시됩니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '명시 거부 이후 재요청을 허용하는 기간입니다. 0이면 정책 갱신 전까지 재요청할 수 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '관리자만 all을 워크스페이스 전체로 해석합니다. 다른 역할은 유효 범위의 합집합 (교집합 = 워크스페이스 ∩ 부여된 범위)으로 해석합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('금지', { exact: true })).toHaveLength(2);
    expect(screen.getByText('Survey 응답 → VOC').closest('div[class*="grid"]')).toHaveTextContent(
      '금지',
    );
    expect(
      screen
        .getByText('Survey 응답 → VOC')
        .closest('div[class*="grid"]')
        ?.querySelector('.text-accent-danger'),
    ).toHaveTextContent('금지');
    expect(screen.getByText('응답 9건', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('정책 강제 연결 후 편집 가능')).not.toBeInTheDocument();
    for (const label of [
      'Managed System 간 연결',
      '권한 요청 재신청 기간',
      'Survey 응답 → VOC',
      '개발자의 기본 Managed System 범위',
      'all = 워크스페이스 전체',
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
      screen.queryByText('소급 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).not.toBeInTheDocument();

    const selfApprovalEditButton = screen.getAllByRole('button', { name: '편집' })[0];
    if (!selfApprovalEditButton) throw new Error('Self-approval edit button is missing');
    fireEvent.click(selfApprovalEditButton);
    fireEvent.click(screen.getByRole('combobox', { name: '직접 승인' }));
    fireEvent.click(await screen.findByRole('option', { name: '허용' }));

    expect(
      screen.getByText('소급 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '활성 권한 부여는 유지됩니다. 새 직접 승인은 권한 없이도 허용되며 감사 라벨은 동일합니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ active capability grant$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    expect(
      screen.queryByText('소급 영향: 백로그 일부가 자동 해제될 수 있습니다'),
    ).not.toBeInTheDocument();
  });

  test('patches only the changed field, applies its response, and discards local edits', async () => {
    const patches: unknown[] = [];
    installFetch({ onPatch: (body) => patches.push(body) });
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    const threshold = screen.getByLabelText('익명성 임계값');
    fireEvent.change(threshold, { target: { value: '12' } });
    expect(screen.getByTestId('workspace-settings-save-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));

    await waitFor(() => expect(patches).toEqual([{ survey_anonymity_threshold: 12 }]));
    await waitFor(() => expect(screen.getByText('응답 12건', { exact: true })).toBeInTheDocument());

    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('익명성 임계값'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    expect(screen.queryByTestId('workspace-settings-save-bar')).not.toBeInTheDocument();
    expect(screen.getByText('응답 12건', { exact: true })).toBeInTheDocument();
  });

  test('keeps the draft and save bar visible when patching fails', async () => {
    installFetch({ patchStatus: 500 });
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('익명성 임계값'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '워크스페이스 설정 저장에 실패했습니다.',
    );
    expect(screen.getByTestId('workspace-settings-save-bar')).toBeInTheDocument();
    expect(screen.getByLabelText('익명성 임계값')).toHaveValue(12);
    expect(screen.getByText('이전 값:')).toHaveTextContent('응답 9건');
  });

  test('shows dirty row parity and changed field names, then clears them after save or discard', async () => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('익명성 임계값'), { target: { value: '12' } });

    expect(screen.getByText('변경됨')).toBeInTheDocument();
    expect(screen.getByText('이전 값:')).toHaveTextContent('응답 9건');
    const saveBar = screen.getByTestId('workspace-settings-save-bar');
    expect(saveBar).toHaveTextContent('저장되지 않은 변경 1건');
    expect(saveBar).toHaveTextContent('익명성 임계값');

    const selfApprovalEditButton = screen.getAllByRole('button', { name: '편집' })[0];
    if (!selfApprovalEditButton) throw new Error('Self-approval edit button is missing');
    fireEvent.click(selfApprovalEditButton);
    fireEvent.click(screen.getByRole('combobox', { name: '직접 승인' }));
    fireEvent.click(await screen.findByRole('option', { name: '허용' }));
    expect(saveBar).toHaveTextContent('저장되지 않은 변경 2건');
    expect(saveBar).toHaveTextContent('권한 요청 직접 승인 · 익명성 임계값');

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(screen.queryByText('변경됨')).not.toBeInTheDocument());

    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('익명성 임계값'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    expect(screen.queryByText('변경됨')).not.toBeInTheDocument();
    expect(screen.queryByText('이전 값:')).not.toBeInTheDocument();
  });

  test.each(['4', '51'])('blocks save for an anonymity threshold of %s', async (invalid) => {
    installFetch({});
    renderRoute();

    await screen.findByTestId('workspace-settings-screen');
    fireEvent.click(thresholdEditButton());
    fireEvent.change(screen.getByLabelText('익명성 임계값'), { target: { value: invalid } });
    expect(screen.getByText('5에서 50 사이의 정수를 입력하세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
  });

  test('removes the placeholder destination from the default settings navigation', () => {
    // #612: the footer link renders only for an actor approved for workspace.admin.
    render(<AppSidebar entries={[]} canAccessWorkspaceAdmin={true} />);
    const settings = screen.getByTestId('sidebar-footer-workspace-settings');
    expect(settings).toHaveAttribute('href', '/admin/settings');
    expect(settings).not.toHaveAttribute('href', '/admin/placeholder');
  });
});
