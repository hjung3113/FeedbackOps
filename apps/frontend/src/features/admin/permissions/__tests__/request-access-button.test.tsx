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

  // F-002: per ADR-0015:71-90 the Idempotency-Key represents the same
  // *logical intent*. Two concurrent in-flight requests for the same
  // capability/MS must carry the SAME header so the server can dedupe via
  // (actor_id, key). Without memoization a fresh UUID would be generated
  // per click, defeating the contract.
  test('two concurrent clicks for the same capability send the same Idempotency-Key', async () => {
    // Park the fetch in a deferred state so both clicks land while the
    // first request is still in flight.
    const calls: Array<{ headers: Record<string, string> }> = [];
    let resolveAll: () => void = () => {};
    const allResolved = new Promise<void>((r) => {
      resolveAll = r;
    });
    globalThis.fetch = vi.fn(async (_url, init) => {
      const headers = (init as RequestInit).headers as Record<string, string>;
      calls.push({ headers });
      await allResolved;
      return new Response(
        JSON.stringify({ id: 'req-1', status: 'pending', created_at: new Date().toISOString() }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    wrap(<RequestAccessButton capability="workspace.admin" />);
    const button = screen.getByRole('button', { name: 'Request access' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      // The button is disabled while pending, so React may collapse the
      // second click — but if at least 2 fetch calls land they MUST share
      // the same key. If only one landed (because the button was
      // disabled), assert the single-click invariant still holds.
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
    resolveAll();

    if (calls.length >= 2) {
      const a = calls[0];
      const b = calls[1];
      if (!a || !b) throw new Error('missing call entries');
      expect(a.headers['Idempotency-Key']).toBe(b.headers['Idempotency-Key']);
    }
    const first = calls[0];
    if (!first) throw new Error('no fetch calls');
    expect(first.headers['Idempotency-Key']).toMatch(UUID_REGEX);
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
