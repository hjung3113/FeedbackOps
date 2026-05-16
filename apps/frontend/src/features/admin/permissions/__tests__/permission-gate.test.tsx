// <PermissionGate> contract: children render only when the backend returns
// state=approved; every other state delegates to <PermissionStateView>.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PermissionGate } from '../permission-gate.js';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('<PermissionGate>', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response('not mocked', { status: 500 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('renders children when /me/permissions/check returns approved', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ state: 'approved', decision: { allow: true, via: 'role' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    await waitFor(() => {
      expect(screen.getByText('secret payload')).toBeInTheDocument();
    });
  });

  test('renders request_access state when backend says request_access', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            state: 'request_access',
            decision: {
              allow: false,
              reason: 'no_grant',
              requestable: [{ workspace_id: 'ws' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    });
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
  });

  test('renders blocked_non_requestable when backend says so', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            state: 'blocked_non_requestable',
            decision: { allow: false, reason: 'explicit_deny', requestable: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Access blocked/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
  });
});
