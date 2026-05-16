// <RequestAccessButton> behavior (issue #5):
//   - POSTs to /permission-requests with an Idempotency-Key UUIDv4 header.
//   - On 201 invalidates permissionCheckQueryKey + permissionRequestsMineKey.
//   - On 409 conflict.* (capability_already_granted | permission_request_duplicate)
//     still invalidates; no inline error.
//   - On other 4xx renders inline error message.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RequestAccessButton } from '../request-access-button.js';
import { permissionCheckQueryKey, permissionRequestsMineKey } from '../use-permission-check.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  return {
    qc,
    invalidateSpy,
    ...render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>),
  };
}

describe('<RequestAccessButton>', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response('not mocked', { status: 500 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('on click → POST /permission-requests with Idempotency-Key UUID + body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: 'req-1', status: 'pending', created_at: new Date().toISOString() }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { invalidateSpy } = wrap(<RequestAccessButton capability="workspace.admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error('fetch not called');
    expect(call[0]).toBe('/permission-requests');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(UUID_REGEX);
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.requested_capability).toBe('workspace.admin');
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: permissionCheckQueryKey({ capability: 'workspace.admin' }),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: permissionRequestsMineKey });
    });
  });

  test('on 409 conflict.capability_already_granted → still invalidates, no error message', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'conflict.capability_already_granted',
            message: 'already granted',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;

    const { invalidateSpy } = wrap(<RequestAccessButton capability="workspace.admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: permissionRequestsMineKey });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('on 422 validation.unknown_capability → renders inline error message', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'validation.unknown_capability',
            message: 'unknown capability',
          }),
          { status: 422, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;

    wrap(<RequestAccessButton capability="not.real" />);
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unknown capability/i);
    });
  });
});
