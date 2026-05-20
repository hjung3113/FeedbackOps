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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('<EditDescriptionModal>', () => {
  beforeEach(() => {
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(DEFAULT_MUTATION as unknown as ReturnType<typeof useVocEditDescriptionMutation>);
  });

  // Test 1: Modal prefills title + description from voc props
  it('prefills title and description from voc on open', async () => {
    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    // FieldLabel renders a <label for="edit-title"> with extra children (* and tip icon).
    // Use getByRole with name regex to match the accessible label.
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    expect(titleInput).toHaveValue('기존 제목');

    // RichEditor is rendered with the voc description surface
    expect(screen.getByTestId('rich-editor-voc-description')).toBeInTheDocument();
  });

  // Test 2: AttachmentDropzone is visible and has aria-disabled
  it('renders AttachmentDropzone with aria-disabled', async () => {
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
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={onClose}
      />,
      { wrapper: makeWrapper() },
    );

    // Dirty the title field using userEvent (fires realistic keyboard events that
    // properly trigger react-hook-form's onChange handler and isDirty tracking)
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, '변경된 제목');

    // Click the cancel/close button
    await user.click(screen.getByRole('button', { name: '취소' }));

    // DirtyConfirmation uses DirtyConfirmation (AlertDialog from @radix-ui/react-dialog)
    // which renders with role="dialog". Query by the title text.
    await waitFor(() => {
      // The DirtyConfirmation title text is the default:
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });

    // onClose should NOT have been called yet
    expect(onClose).not.toHaveBeenCalled();
  });

  // Test 4: validation.failed renders per-field error
  // The useEffect in EditDescriptionModal watches mutation.error and calls
  // form.setError when a validation.failed error is present. This test verifies
  // that the per-field message is visible after the effect fires.
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
      isIdle: false,
      status: 'error' as const,
      error: validationError,
    } as unknown as ReturnType<typeof useVocEditDescriptionMutation>);

    render(
      <EditDescriptionModal
        voc={VOC}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    // The useEffect should fire on mount and call form.setError.
    // waitFor ensures the effect has run and the DOM has updated.
    await waitFor(() => {
      expect(screen.getByText('제목을 입력해 주세요.')).toBeInTheDocument();
    });
  });
});
