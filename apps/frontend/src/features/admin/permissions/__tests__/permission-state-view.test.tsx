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
  test('approved → "Access granted"', () => {
    render(<PermissionStateView state="approved" capability="workspace.admin" />);
    expect(screen.getByText('Access granted')).toBeInTheDocument();
  });

  test('request_access → renders Request access button (Slice 1: noop click)', () => {
    render(<PermissionStateView state="request_access" capability="workspace.admin" />);
    const btn = screen.getByRole('button', { name: 'Request access' });
    expect(btn).toBeInTheDocument();
    // ADR-0021 shadcn CVA Button: h-10 px-4 for size=md (default).
    expect(btn).toHaveClass('h-10');
  });

  test('pending_request → "Request pending"', () => {
    render(<PermissionStateView state="pending_request" capability="workspace.admin" />);
    expect(screen.getByText('Request pending')).toBeInTheDocument();
    // No request button when the request is already in flight.
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });

  test('blocked_non_requestable → "Access blocked"', () => {
    render(<PermissionStateView state="blocked_non_requestable" capability="workspace.admin" />);
    expect(screen.getByText('Access blocked')).toBeInTheDocument();
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

  test('hidden_existence → "Not found"', () => {
    render(<PermissionStateView state="hidden_existence" capability="workspace.admin" />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  test('rejected → "Request rejected"', () => {
    render(<PermissionStateView state="rejected" capability="workspace.admin" />);
    expect(screen.getByText('Request rejected')).toBeInTheDocument();
  });

  test('expired → "Access expired"', () => {
    render(<PermissionStateView state="expired" capability="workspace.admin" />);
    expect(screen.getByText('Access expired')).toBeInTheDocument();
  });

  test('revoked → "Access revoked"', () => {
    render(<PermissionStateView state="revoked" capability="workspace.admin" />);
    expect(screen.getByText('Access revoked')).toBeInTheDocument();
  });
});
