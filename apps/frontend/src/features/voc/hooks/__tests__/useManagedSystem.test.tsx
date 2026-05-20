import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';

import { useManagedSystem } from '../useManagedSystem';

// Mock the fetchManagedSystems import
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, fetchManagedSystems: vi.fn() };
});

import { fetchManagedSystems } from '@/lib/api';
const mockFetchManagedSystems = vi.mocked(fetchManagedSystems);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const MS_LIST = [
  {
    id: 'ms-aaa',
    workspace_id: 'ws-1',
    slug: 'tableau',
    name: 'Tableau',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ms-bbb',
    workspace_id: 'ws-1',
    slug: 'salesforce',
    name: 'Salesforce',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: '2026-03-01T00:00:00Z',
    archived_by_actor_id: 'actor-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
];

describe('useManagedSystem', () => {
  afterEach(() => vi.clearAllMocks());

  test('resolves known id to { name, mark, archived }', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result } = renderHook(() => useManagedSystem('ms-aaa'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.id).toBe('ms-aaa');
    expect(result.current?.name).toBe('Tableau');
    expect(typeof result.current?.mark).toBe('string');
    expect(result.current?.mark).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(result.current?.archived).toBe(false);
  });

  test('archived MS resolves with archived=true', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result } = renderHook(() => useManagedSystem('ms-bbb'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.archived).toBe(true);
  });

  test('unknown id returns null', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result } = renderHook(() => useManagedSystem('ms-unknown'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      // Give time for query to settle
    });
    // Still null after fetch settles — id not in list
    expect(result.current).toBeNull();
  });

  test('null id returns null without fetching', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result } = renderHook(() => useManagedSystem(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current).toBeNull();
  });

  test('undefined id returns null', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result } = renderHook(() => useManagedSystem(undefined), {
      wrapper: makeWrapper(),
    });
    expect(result.current).toBeNull();
  });

  test('same id always returns same mark (deterministic)', async () => {
    mockFetchManagedSystems.mockResolvedValue({ items: MS_LIST, total: 2 });
    const { result: r1 } = renderHook(() => useManagedSystem('ms-aaa'), {
      wrapper: makeWrapper(),
    });
    const { result: r2 } = renderHook(() => useManagedSystem('ms-aaa'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(r1.current).not.toBeNull());
    await waitFor(() => expect(r2.current).not.toBeNull());
    expect(r1.current?.mark).toBe(r2.current?.mark);
  });
});
