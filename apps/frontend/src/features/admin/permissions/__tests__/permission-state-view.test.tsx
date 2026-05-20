// <PermissionStateView> renders the correct label + icon for each of the
// four Slice 1 active states. The other states are also exercised to pin
// the dead-state copy so S1.2 producers don't surprise the UI.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { PermissionStateView } from '../permission-state-view.js';

// Slice 1 #5: RequestAccessButton now uses useQueryClient, so anything that
// transitively renders it needs a QueryClientProvider in the test harness.
function render(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('<PermissionStateView>', () => {
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
