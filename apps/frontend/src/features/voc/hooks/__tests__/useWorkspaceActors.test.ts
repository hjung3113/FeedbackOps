// useWorkspaceActors.test.ts — TDD RED test.
// GET /actors?workspace=current; cached by workspace; returns actor list.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { useWorkspaceActors } from '../useWorkspaceActors';

// BE wire shape per @fops/shared `listActorsResponseSchema`. The hook maps
// each row to the UI shape `{id, display_name, kind: 'user'}` (teams not
// seeded yet — ADR-0018).
const MOCK_BE_ACTORS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_name: 'Alice',
    email: 'alice@feedbackops.local',
    role_level: 'user' as const,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_name: 'Bob',
    email: 'bob@feedbackops.local',
    role_level: 'user' as const,
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useWorkspaceActors', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify({ actors: MOCK_BE_ACTORS })),
      }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns actors list from GET /actors?workspace=current', async () => {
    const { result } = renderHook(() => useWorkspaceActors(), { wrapper });

    await waitFor(() => {
      const r = result.current;
      expect(r.status === 'success').toBe(true);
    });
    expect(result.current.actors).toHaveLength(2);
    expect(result.current.actors?.[0]?.display_name).toBe('Alice');
    // BE response is mapped to UI shape with `kind: 'user'` for every row
    // until teams ship (ADR-0018). `email` / `role_level` stay on the BE
    // type and are not exposed by the hook.
    expect(result.current.actors?.[0]?.kind).toBe('user');
  });
});
