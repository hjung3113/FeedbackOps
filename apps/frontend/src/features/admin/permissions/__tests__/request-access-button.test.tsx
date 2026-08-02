import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RequestAccessButton } from '../request-access-button.js';
import { permissionCheckQueryKey, permissionRequestsMineKey } from '../use-permission-check.js';

const CAPABILITY = 'finding.manage';
const MANAGED_SYSTEM_ID = '11111111-1111-4111-8111-111111111111';
const RETURN_ROUTE = '/findings?selected=FND-274';
const REASON = 'Need scoped access to verify the distinct finding fixture.';
const CREATED_AT = '2026-08-03T09:30:00.000Z';

function success(id = 'PR-D8-001') {
  return new Response(JSON.stringify({ id, status: 'pending', created_at: CREATED_AT }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <RequestAccessButton
        capability={CAPABILITY}
        managedSystemId={MANAGED_SYSTEM_ID}
        returnRouteIntent={RETURN_ROUTE}
      />
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Request access' }));
  expect(screen.getByTestId('permission-request-form')).toBeInTheDocument();
  expect(screen.getByText(CAPABILITY)).toBeInTheDocument();
  expect(screen.getByText(MANAGED_SYSTEM_ID)).toBeInTheDocument();
}

function fillReasonAndSubmit(reason = REASON) {
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: reason } });
  fireEvent.submit(screen.getByTestId('permission-request-form'));
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

function idempotencyKey(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return ((call[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key'];
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

  test('AC-D8a clicking Request access renders confirmation before exactly zero POSTs', async () => {
    const fetchMock = vi.fn(async () => success());
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();

    openForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('AC-D8b submitting sends exactly one matching non-hardcoded reason', async () => {
    const fetchMock = vi.fn(async () => success());
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();
    openForm();

    fillReasonAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = requestBody(fetchMock);
    expect(body.reason).toBe(REASON);
    expect(body.reason).not.toBe('Requested via permission gate');
  });

  test('AC-D8c empty expiration sends capability and exactly no expiration key', async () => {
    const fetchMock = vi.fn(async () => success());
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();
    openForm();

    fillReasonAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = requestBody(fetchMock);
    expect(body.requested_capability).toBe(CAPABILITY);
    expect(body).not.toHaveProperty('requested_expiration');
  });

  test('AC-D8d expiration sends its end-of-day ISO value exactly once', async () => {
    const fetchMock = vi.fn(async () => success());
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();
    openForm();
    fireEvent.change(screen.getByTestId('permission-request-expiration'), {
      target: { value: '2026-09-30' },
    });

    fillReasonAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock).requested_expiration).toBe('2026-09-30T23:59:59.000Z');
  });

  test('AC-D8f successful submit shows the request identifier and submitted content', async () => {
    const fetchMock = vi.fn(async () => success('PR-D8-IDENTIFIABLE'));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();
    openForm();

    fillReasonAndSubmit();

    expect(await screen.findByText('Request submitted')).toBeInTheDocument();
    expect(screen.getByTestId('permission-request-id')).toHaveTextContent('PR-D8-IDENTIFIABLE');
    expect(screen.getByText(CAPABILITY)).toBeInTheDocument();
    expect(screen.getByText(MANAGED_SYSTEM_ID)).toBeInTheDocument();
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText(CREATED_AT)).toBeInTheDocument();
  });

  test('AC-D8g capability-already-granted shows no error and invalidates queries', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 'conflict.capability_already_granted',
          message: 'already granted',
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    ) as typeof globalThis.fetch;
    const { invalidateSpy } = wrap();
    openForm();

    fillReasonAndSubmit();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: permissionCheckQueryKey({
          capability: CAPABILITY,
          managedSystemId: MANAGED_SYSTEM_ID,
        }),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: permissionRequestsMineKey });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('AC-D8h failed retry reuses the key and a post-success new intent rotates it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('failed', { status: 500 }))
      .mockResolvedValueOnce(success('PR-D8-RETRY'))
      .mockResolvedValueOnce(success('PR-D8-NEXT'));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap();
    openForm();

    fillReasonAndSubmit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('request failed'));
    fireEvent.submit(screen.getByTestId('permission-request-form'));
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-id')).toHaveTextContent('PR-D8-RETRY'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request another access' }));
    fillReasonAndSubmit('A distinct second intent after the successful request.');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(idempotencyKey(fetchMock, 0)).toBe(idempotencyKey(fetchMock, 1));
    expect(idempotencyKey(fetchMock, 2)).not.toBe(idempotencyKey(fetchMock, 1));
  });
});
