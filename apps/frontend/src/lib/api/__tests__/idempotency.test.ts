import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../client';
import { mintIdempotencyKey } from '../idempotency';

// Copied verbatim from the backend guard every mutation route applies
// (e.g. apps/backend/src/modules/permissions/routes.ts). A key this rejects is
// answered with `validation.malformed_idempotency_key`, so this regex — not a
// looser "looks like a uuid" shape — is the oracle.
const BACKEND_IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

describe('mintIdempotencyKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('produces a key the backend accepts when crypto.randomUUID exists', () => {
    expect(mintIdempotencyKey()).toMatch(BACKEND_IDEMPOTENCY_KEY_REGEX);
  });

  it('produces a key the backend accepts without crypto.randomUUID', () => {
    // `crypto.randomUUID` is secure-context only, so any non-https origin that
    // is not localhost — a LAN IP during device testing — takes this path on
    // every mutation.
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });

    for (let i = 0; i < 200; i++) {
      expect(mintIdempotencyKey()).toMatch(BACKEND_IDEMPOTENCY_KEY_REGEX);
    }
  });

  it('produces a key the backend accepts with no Web Crypto at all', () => {
    vi.stubGlobal('crypto', undefined);

    for (let i = 0; i < 200; i++) {
      expect(mintIdempotencyKey()).toMatch(BACKEND_IDEMPOTENCY_KEY_REGEX);
    }
  });

  it('does not repeat itself', () => {
    const keys = new Set(Array.from({ length: 500 }, () => mintIdempotencyKey()));
    expect(keys.size).toBe(500);
  });
});

describe('apiClient auto-minted Idempotency-Key', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function sentKey(fetchMock: ReturnType<typeof vi.fn>): string {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    return headers?.['Idempotency-Key'] ?? '';
  }

  it('sends a backend-valid key on a POST outside a secure context', async () => {
    // The regression this pins: the auto-mint fallback used to emit
    // `Math.random().toString(36) + Date.now().toString(36)`, which is not a
    // UUID, so every mutation that did not pass its own key failed with
    // validation.malformed_idempotency_key on such an origin.
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const fetchMock = stubFetch();

    await apiClient('POST', '/vocs/abc/reporter-replies', { body: {} });

    expect(sentKey(fetchMock)).toMatch(BACKEND_IDEMPOTENCY_KEY_REGEX);
  });

  it('prefers an explicitly supplied key over minting one', async () => {
    const fetchMock = stubFetch();
    const explicit = '11111111-1111-4111-8111-111111111111';

    await apiClient('POST', '/vocs', { body: {}, idempotencyKey: explicit });

    expect(sentKey(fetchMock)).toBe(explicit);
  });

  it('sends no Idempotency-Key on a GET', async () => {
    const fetchMock = stubFetch();

    await apiClient('GET', '/vocs');

    expect(sentKey(fetchMock)).toBe('');
  });
});
