// ProgressNotesComposer on a real TipTap editor (#1182 Do 7): a rejected submit keeps the note
// text; a successful one clears it and puts DOM focus back in the editable.

import { useJsdomRangeGeometry } from '@/test/realEditor';
import type { TipTapEditor } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/api/findings-comments', () => ({
  listFindingComments: vi.fn(),
  createFindingComment: vi.fn(),
}));

import { createFindingComment } from '@/lib/api/findings-comments';
import { ProgressNotesComposer } from '../ProgressNotesComposer';

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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('<ProgressNotesComposer> submit outcomes (real editor)', () => {
  useJsdomRangeGeometry();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mountWithNote(): Promise<TipTapEditor> {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ProgressNotesComposer resource={{ kind: 'finding', id: 'finding-1' }} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('progress-notes-composer').querySelector('.ProseMirror'),
      ).not.toBeNull(),
    );
    const dom = screen
      .getByTestId('progress-notes-composer')
      .querySelector('.ProseMirror') as HTMLElement & { editor: TipTapEditor };
    act(() => {
      dom.editor.commands.setContent('진행 메모');
    });
    return dom.editor;
  }

  it('uses the attachment picker focus-visible ring on toolbar buttons', async () => {
    await mountWithNote();
    expect(screen.getByRole('button', { name: '굵게' })).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-focus-ring',
    );
  });

  it('a rejected submit keeps the note text', async () => {
    vi.mocked(createFindingComment).mockRejectedValue(new Error('서버 오류'));
    const editor = await mountWithNote();

    fireEvent.click(screen.getByRole('button', { name: '메모 추가' }));
    await waitFor(() => expect(createFindingComment).toHaveBeenCalledTimes(1));
    await act(async () => {
      await nextFrame();
    });

    expect(editor.getText()).toBe('진행 메모');
  });

  it('a successful submit clears the note and focuses the editor', async () => {
    vi.mocked(createFindingComment).mockResolvedValue({ comment: NOTE });
    const editor = await mountWithNote();
    const submit = screen.getByRole('button', { name: '메모 추가' });
    act(() => submit.focus());

    fireEvent.click(submit);

    await waitFor(() => expect(editor.getText()).toBe(''));
    await act(async () => {
      await nextFrame();
    });
    await waitFor(() => expect(editor.view.dom).toHaveFocus());
  });
});
