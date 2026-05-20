// EditDescriptionModal.test.tsx — TDD RED
// Tests:
//   1. Modal prefills title + description from voc props
//   2. AttachmentDropzone is visible and disabled (aria-disabled)
//   3. Dirty form + close attempt shows DirtyConfirmation
//   4. validation.failed renders per-field error
//   5. (DescriptionSection) 수정 button shown only when gate passes — lives in DescriptionSection.test
//
// C6.2 of slice3 #21.

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ───────────────────────────────────────────────────────────────────

// RichEditor: render a textarea so form tests can interact
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      value,
      onChange,
      surface,
      placeholder,
    }: {
      value?: unknown;
      onChange?: (doc: unknown) => void;
      surface?: string;
      placeholder?: string;
    }) => (
      <textarea
        data-testid={`rich-editor-${surface ?? 'default'}`}
        placeholder={placeholder}
        defaultValue={value ? JSON.stringify(value) : ''}
        onChange={(e) => onChange?.({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }] })}
      />
    ),
  };
});

// useVocEditDescriptionMutation mock
vi.mock('@/features/voc/hooks/useVocEditDescriptionMutation', () => ({
  useVocEditDescriptionMutation: vi.fn(),
}));

import { useVocEditDescriptionMutation } from '@/features/voc/hooks/useVocEditDescriptionMutation';
import { EditDescriptionModal } from '../EditDescriptionModal';

// ── Fixture ─────────────────────────────────────────────────────────────────

const VOC = {
  id: 'voc-uuid-1111',
  title: '기존 제목',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '기존 내용' }] }],
  },
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const DEFAULT_MUTATION = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  reset: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('<EditDescriptionModal>', () => {
  beforeEach(() => {
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(DEFAULT_MUTATION as ReturnType<typeof useVocEditDescriptionMutation>);
  });

  // Test 1: Modal prefills title + description from voc props
  it('prefills title and description from voc on open', () => {
    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const titleInput = screen.getByLabelText('제목');
    expect(titleInput).toHaveValue('기존 제목');

    // RichEditor is rendered with the voc description surface
    expect(screen.getByTestId('rich-editor-voc-description')).toBeInTheDocument();
  });

  // Test 2: AttachmentDropzone is visible and has aria-disabled
  it('renders AttachmentDropzone with aria-disabled', () => {
    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const dropzone = screen.getByRole('button', { name: /첨부 파일/i });
    expect(dropzone).toBeInTheDocument();
    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
  });

  // Test 3: Dirty form + close attempt shows DirtyConfirmation
  it('shows DirtyConfirmation when modal is closed with dirty form', async () => {
    const onClose = vi.fn();
    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={onClose}
      />,
      { wrapper: makeWrapper() },
    );

    // Dirty the title field
    const titleInput = screen.getByLabelText('제목');
    fireEvent.change(titleInput, { target: { value: '변경된 제목' } });

    // Click the cancel/close button
    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);

    // DirtyConfirmation should appear
    await waitFor(() => {
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });

    // onClose should NOT have been called yet
    expect(onClose).not.toHaveBeenCalled();
  });

  // Test 4: validation.failed renders per-field error
  it('renders per-field error when mutation returns validation.failed', async () => {
    const { ApiError } = await import('@/lib/api');
    const validationError = new ApiError(422, {
      code: 'validation.failed',
      message: '입력값이 올바르지 않습니다.',
      detail: {
        fields: [{ path: ['title'], code: 'too_short', message: '제목을 입력해 주세요.' }],
      },
    });

    vi.mocked(useVocEditDescriptionMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      isError: true,
      error: validationError,
    } as ReturnType<typeof useVocEditDescriptionMutation>);

    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    // Submit to trigger error display
    const submitButton = screen.getByRole('button', { name: '수정 저장' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('제목을 입력해 주세요.')).toBeInTheDocument();
    });
  });
});
