// useWorkspaceActors.test.ts — TDD RED test.
// GET /actors?workspace=current; cached by workspace; returns actor list.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { useWorkspaceActors } from '../useWorkspaceActors';

// Minimal actor shape matching the hook's return type
const MOCK_ACTORS = [
  { id: 'u-1', display_name: 'Alice', kind: 'user' as const },
  { id: 'u-2', display_name: 'Bob', kind: 'user' as const },
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
        text: () => Promise.resolve(JSON.stringify({ actors: MOCK_ACTORS })),
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
  });
});
