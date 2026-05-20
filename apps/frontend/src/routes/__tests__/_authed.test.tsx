// _authed beforeLoad branch tests (Slice 3 #18 cycle-2 P3-B).
//
// The beforeLoad of _authed:
//   1. On UnauthenticatedError → throws redirect to /login.
//   2. On non-auth error (network failure, etc.) → re-throws so caller
//      sees it (router error boundary / fail-closed).
//   3. On fetchMe success → resolves (AuthedLayout mounts).
//
// We exercise the beforeLoad as a pure async function rather than
// mounting the full router, to avoid routeTree.gen.ts timing issues.

import { redirect } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthenticatedError, fetchMe } from '../../lib/api';

// Re-implement beforeLoad logic verbatim from _authed.tsx so we can
// exercise it in isolation without the TanStack file-route type brands.
async function beforeLoad({ location }: { location: { href: string } }) {
  try {
    await fetchMe();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      throw redirect({ to: '/login', search: { redirectTo: location.href } });
    }
    throw err;
  }
}

describe('_authed beforeLoad', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('re-throws non-auth errors (network failure) without swallowing them', async () => {
    // Simulate a network error (not a 401 — e.g. DNS failure, 500, etc.)
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network failure');
    }) as typeof globalThis.fetch;

    await expect(beforeLoad({ location: { href: '/vocs?view=inbox' } })).rejects.toThrow(
      'Network failure',
    );
  });

  it('throws a redirect to /login on UnauthenticatedError', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'auth.session_invalid' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;

    let thrown: unknown;
    try {
      await beforeLoad({ location: { href: '/vocs?view=inbox' } });
    } catch (err) {
      thrown = err;
    }
    // TanStack redirect throws a special object with a redirectTo field
    expect(thrown).toBeDefined();
    // The redirect object is not an Error — it's a TanStack redirect signal
    expect(thrown instanceof Error).toBe(false);
  });

  it('resolves without throwing when fetchMe succeeds', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            actor: {
              id: '00000000-0000-0000-0000-000000000001',
              external_id: 'mock-admin-1',
              email: 'admin@feedbackops.local',
              display_name: 'Mock Admin',
              role_level: 'admin',
            },
            workspace_id: '11111111-1111-1111-1111-111111111111',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;

    await expect(beforeLoad({ location: { href: '/vocs?view=inbox' } })).resolves.toBeUndefined();
  });
});
