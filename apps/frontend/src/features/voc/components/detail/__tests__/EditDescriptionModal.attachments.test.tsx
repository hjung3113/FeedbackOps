// EditDescriptionModal — attachment upload wiring tests (PLAN-22 C6).
//
// Covers: successful upload → PATCH body includes attachment_ids[];
// failed upload → not included; submit disabled while uploading.

import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RichEditor stub so the modal mounts headlessly.
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({ value, onChange, surface }: { value?: unknown; onChange?: (doc: unknown) => void; surface?: string }) => (
      <textarea
        data-testid={`rich-editor-${surface ?? 'default'}`}
        defaultValue={value ? JSON.stringify(value) : ''}
        onChange={(e) => onChange?.({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }] })}
      />
    ),
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Mutation mock so we can capture the PATCH body.
vi.mock('@/features/voc/hooks/useVocEditDescriptionMutation', () => ({
  useVocEditDescriptionMutation: vi.fn(),
}));

import { useVocEditDescriptionMutation } from '@/features/voc/hooks/useVocEditDescriptionMutation';
import { EditDescriptionModal } from '../EditDescriptionModal';
import * as attachmentsApi from '@/lib/api/attachments';
import { ApiError } from '@/lib/api/types';

const VOC = {
  id: 'voc-uuid-1111',
  title: '기존 제목',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '기존 내용' }] }] },
};

const ATTACHMENT = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  name: 'shot.png',
  size_bytes: 1024,
  mime_type: 'image/png',
  uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
  created_at: '2026-05-22T10:00:00.000Z',
};

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const DEFAULT_MUTATION = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  isIdle: true,
  isSuccess: false,
  isPaused: false,
  status: 'idle' as const,
  submittedAt: 0,
  variables: undefined,
  data: undefined,
  error: null,
  reset: vi.fn(),
  context: undefined,
  failureCount: 0,
  failureReason: null,
  mutateAsync: vi.fn(),
};

function makeFile(name = 'shot.png', type = 'image/png', size = 1024): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function pickFile(_container: HTMLElement, file: File): void {
  // Dialog content is portaled outside the render container — look up the
  // dropzone input on document.
  const input = document.querySelector(
    '[data-testid="edit-attachment-dropzone-input"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error('edit-attachment-dropzone-input not found in document');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('<EditDescriptionModal> attachments (C6)', () => {
  beforeEach(() => {
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Attach → upload → PATCH body includes attachment_ids[]', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const mutateMock = vi.fn();
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
      { ...DEFAULT_MUTATION, mutate: mutateMock } as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
    );

    const { container } = render(
      <EditDescriptionModal voc={VOC} open={true} onClose={vi.fn()} />,
      { wrapper: wrap() },
    );

    await act(async () => {
      pickFile(container, makeFile());
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });

    // Dirty the form (otherwise RHF won't submit) and click Save.
    const user = userEvent.setup();
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');

    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const calledVars = mutateMock.mock.calls[0]![0] as {
      body: { attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([ATTACHMENT.id]);
  });

  it('failed upload not included in PATCH body', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const mutateMock = vi.fn();
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
      { ...DEFAULT_MUTATION, mutate: mutateMock } as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
    );

    const { container } = render(
      <EditDescriptionModal voc={VOC} open={true} onClose={vi.fn()} />,
      { wrapper: wrap() },
    );

    await act(async () => {
      pickFile(container, makeFile('a.zip', 'application/zip'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('error');
    });

    const user = userEvent.setup();
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');

    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const calledVars = mutateMock.mock.calls[0]![0] as {
      body: { attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([]);
  });

  // ── PLAN-22 §Bug-3 (2026-05-22): existing-attachment hydration on reopen ───
  describe('existing attachments (GET-side hydration)', () => {
    const EXISTING_A = {
      id: 'cccc3333-0000-4000-8000-000000000001',
      name: 'previously-uploaded.png',
      size_bytes: 4096,
      mime_type: 'image/png',
      uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
      created_at: '2026-05-20T10:00:00.000Z',
      linked_at: '2026-05-20T10:00:00.000Z',
    };

    it('renders existing attachments[] when opened on a VOC with attachments', () => {
      const vocWithExisting = { ...VOC, attachments: [EXISTING_A] };
      render(
        <EditDescriptionModal voc={vocWithExisting} open={true} onClose={vi.fn()} />,
        { wrapper: wrap() },
      );
      // The existing-attachment list is portaled to the dialog; query the
      // document for the chip.
      const chip = document.querySelector('[data-testid="attachment-chip"]');
      expect(chip).not.toBeNull();
      expect(chip?.getAttribute('data-attachment-id')).toBe(EXISTING_A.id);
      expect(document.body.textContent).toContain('previously-uploaded.png');
      expect(document.body.textContent).toContain('기존 첨부');
    });

    it('PATCH body only includes NEW upload ids — additive semantics (BE rejects re-link)', async () => {
      vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
      const mutateMock = vi.fn();
      vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
        { ...DEFAULT_MUTATION, mutate: mutateMock } as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
      );

      const vocWithExisting = { ...VOC, attachments: [EXISTING_A] };
      const { container } = render(
        <EditDescriptionModal voc={vocWithExisting} open={true} onClose={vi.fn()} />,
        { wrapper: wrap() },
      );

      await act(async () => {
        pickFile(container, makeFile());
      });
      await waitFor(() => {
        expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
      });

      const user = userEvent.setup();
      const titleInput = screen.getByRole('textbox', { name: /제목/ });
      await user.clear(titleInput);
      await user.type(titleInput, '새 제목');
      await user.click(screen.getByRole('button', { name: '수정 저장' }));

      await waitFor(() => {
        expect(mutateMock).toHaveBeenCalled();
      });
      const calledVars = mutateMock.mock.calls[0]![0] as {
        body: { attachment_ids: string[] };
      };
      // Additive: only NEW upload id, NOT the pre-existing EXISTING_A.id
      // (BE linkAttachments rejects already-linked rows).
      expect(calledVars.body.attachment_ids).toEqual([ATTACHMENT.id]);
      expect(calledVars.body.attachment_ids).not.toContain(EXISTING_A.id);
    });
  });

  it('submit disabled while any attachment is mid-upload', async () => {
    let resolveUpload!: (v: typeof ATTACHMENT) => void;
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );

    const { container } = render(
      <EditDescriptionModal voc={VOC} open={true} onClose={vi.fn()} />,
      { wrapper: wrap() },
    );

    await act(async () => {
      pickFile(container, makeFile());
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '수정 저장' })).toBeDisabled();
    });

    await act(async () => {
      resolveUpload(ATTACHMENT);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '수정 저장' })).not.toBeDisabled();
    });
  });
});
