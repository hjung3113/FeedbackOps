// <PermissionStateView> renders the correct label + icon for each of the
// four Slice 1 active states. The other states are also exercised to pin
// the dead-state copy so S1.2 producers don't surprise the UI.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PermissionStateView } from '../permission-state-view.js';

// Slice 1 #5: RequestAccessButton now uses useQueryClient, so anything that
// transitively renders it needs a QueryClientProvider in the test harness.
function render(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('<PermissionStateView>', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  test('approved state shows Korean access copy', () => {
    render(<PermissionStateView state="approved" capability="workspace.admin" />);
    expect(screen.getByText('접근이 허용되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('이 화면을 볼 수 있는 권한이 있습니다.')).toBeInTheDocument();
  });

  test('request_access → renders 권한 요청 button (Slice 1: noop click)', () => {
    render(<PermissionStateView state="request_access" capability="workspace.admin" />);
    expect(screen.getByRole('heading', { name: '권한 요청' })).toBeInTheDocument();
    expect(screen.getByText('이 화면을 보려면 권한이 필요합니다.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: '권한 요청' });
    expect(btn).toBeInTheDocument();
    // ADR-0021 shadcn CVA Button: h-10 px-4 for size=md (default).
    expect(btn).toHaveClass('h-10');
  });

  test('pending_request state shows Korean pending copy', () => {
    render(<PermissionStateView state="pending_request" capability="workspace.admin" />);
    expect(screen.getByText('권한 요청 검토 중')).toBeInTheDocument();
    expect(screen.getByText('관리자가 권한 요청을 검토하고 있습니다.')).toBeInTheDocument();
    // No request button when the request is already in flight.
    expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
  });

  test('blocked_non_requestable state shows Korean blocked copy', () => {
    render(<PermissionStateView state="blocked_non_requestable" capability="workspace.admin" />);
    expect(screen.getByText('접근할 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('현재 계정에서는 이 작업을 사용할 수 없습니다.')).toBeInTheDocument();
  });

  test('AC-D13a blocked non-requestable state renders contact guidance and all Admin names', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            actors: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                display_name: 'Admin One',
                email: 'admin.one@example.test',
                role_level: 'admin',
              },
              {
                id: '22222222-2222-4222-8222-222222222222',
                display_name: 'Admin Two',
                email: 'admin.two@example.test',
                role_level: 'admin',
              },
              {
                id: '33333333-3333-4333-8333-333333333333',
                display_name: 'Developer',
                email: 'developer@example.test',
                role_level: 'developer',
              },
            ],
          }),
          { status: 200 },
        ),
    ) as typeof fetch;
    render(<PermissionStateView state="blocked_non_requestable" capability="workspace.admin" />);
    await waitFor(() =>
      expect(screen.getByTestId('permission-contact-admin')).toHaveTextContent(
        'Admin One, Admin Two',
      ),
    );
    expect(screen.getByTestId('permission-contact-admin')).toHaveTextContent(
      '담당 관리자에게 문의하세요.',
    );
    expect(screen.queryByText('admin.one@example.test', { exact: true })).not.toBeInTheDocument();
  });

  test('AC-D13b failed Admin lookup retains contact guidance without names', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'internal.unexpected', message: 'failed' }), {
          status: 500,
        }),
    );
    globalThis.fetch = fetchSpy as typeof fetch;
    render(<PermissionStateView state="blocked_non_requestable" capability="workspace.admin" />);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/actors?workspace=current', expect.anything()),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('permission-contact-admin')).toHaveTextContent(
      '담당 관리자에게 문의하세요.',
    );
  });

  test('hidden_existence state shows Korean not found copy', () => {
    render(<PermissionStateView state="hidden_existence" capability="workspace.admin" />);
    expect(screen.getByText('찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('요청한 항목을 사용할 수 없습니다.')).toBeInTheDocument();
  });

  test('rejected state shows Korean rejection copy', () => {
    render(<PermissionStateView state="rejected" capability="workspace.admin" />);
    expect(screen.getByText('권한 요청이 거절되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('이 권한 요청은 이전에 거절되었습니다.')).toBeInTheDocument();
  });

  test('expired state shows Korean expiration copy', () => {
    render(<PermissionStateView state="expired" capability="workspace.admin" />);
    expect(screen.getByText('권한이 만료되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('이전에 받은 권한이 만료되었습니다.')).toBeInTheDocument();
  });

  test('revoked state shows Korean revocation copy', () => {
    render(<PermissionStateView state="revoked" capability="workspace.admin" />);
    expect(screen.getByText('권한이 취소되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('이전에 받은 권한이 취소되었습니다.')).toBeInTheDocument();
  });
});
