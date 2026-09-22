// useProgressNotes.test.tsx — #377 hook contracts:
//   1. list resolves pages through the surface's endpoint
//   2. create POSTs a note and refetches the list (재조회 — the accepted
//      immediate-reflection strategy for #377)

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/findings-comments', () => ({
  listFindingComments: vi.fn(),
  createFindingComment: vi.fn(),
}));

import { createFindingComment, listFindingComments } from '@/lib/api/findings-comments';
import { useCreateProgressNote, useProgressNotesList } from '../useProgressNotes';

const NOTE = {
  id: 'c1',
  finding_id: 'f1',
  actor_id: 'a1',
  kind: 'note' as const,
  from_status: null,
  to_status: null,
  body_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
  created_at: '2026-09-01T10:00:00Z',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.mocked(listFindingComments).mockReset();
  vi.mocked(createFindingComment).mockReset();
});

describe('useProgressNotes', () => {
  it('loads the finding timeline through GET /findings/:id/comments', async () => {
    vi.mocked(listFindingComments).mockResolvedValue({
      items: [NOTE],
      page: { has_more: false },
    });

    const { result } = renderHook(() => useProgressNotesList({ kind: 'finding', id: 'f1' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toHaveLength(1);
    expect(listFindingComments).toHaveBeenCalledWith('f1', expect.objectContaining({}));
  });

  it('refetches the list after a successful create (immediate reflection)', async () => {
    vi.mocked(listFindingComments).mockResolvedValue({
      items: [],
      page: { has_more: false },
    });
    vi.mocked(createFindingComment).mockResolvedValue({ comment: NOTE });

    const wrapper = makeWrapper();
    const list = renderHook(() => useProgressNotesList({ kind: 'finding', id: 'f1' }), {
      wrapper,
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(listFindingComments).toHaveBeenCalledTimes(1);

    const create = renderHook(() => useCreateProgressNote({ kind: 'finding', id: 'f1' }), {
      wrapper,
    });
    create.result.current.mutate({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '메모' }],
        },
      ],
    });

    await waitFor(() => expect(create.result.current.isSuccess).toBe(true));
    // Body carries the note doc; mentions extracted from the doc (none here).
    expect(createFindingComment).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ body_rich_content: expect.objectContaining({ type: 'doc' }) }),
    );
    await waitFor(() => expect(listFindingComments).toHaveBeenCalledTimes(2));
  });
});
