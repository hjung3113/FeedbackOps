// EditDescriptionModal.staleWriteReload.test.tsx — codex REV-2 P1 #8 (partial)
//
// Edge: user keeps typing while the stale_write refetch is in flight. The old
// implementation unconditionally `form.reset(...)`d when voc.updated_at
// changed — clobbering any edits the user made after the 409 toast.
//
// Required behavior: on conflict.stale_write the modal must show a toast with
// a "다시 불러오기" action that, when clicked, resets the form with the fresh
// VOC defaults. Until the user clicks the action, in-flight edits stay intact
// — the form does NOT auto-reset on updated_at change.

import * as React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ───────────────────────────────────────────────────────────────────

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
        onChange={(e) =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }],
          })
        }
      />
    ),
  };
});

vi.mock('@/features/voc/hooks/useVocEditDescriptionMutation', () => ({
  useVocEditDescriptionMutation: vi.fn(),
}));

// sonner stub — capture the latest warning toast options so the test can
// invoke the action button directly.
const toastWarningMock = vi.fn();
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      warning: (...args: unknown[]) => {
        toastWarningMock(...args);
      },
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { useVocEditDescriptionMutation } from '@/features/voc/hooks/useVocEditDescriptionMutation';
import { EditDescriptionModal } from '../EditDescriptionModal';

// ── Fixture ─────────────────────────────────────────────────────────────────

const VOC_V1 = {
  id: 'voc-uuid-2222',
  title: 'v1 title',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v1 body' }] }],
  },
};

const VOC_V2 = {
  ...VOC_V1,
  title: 'v2 title (refetched)',
  updated_at: '2026-05-01T00:01:00Z',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

describe('<EditDescriptionModal> stale_write reload action (REV-2 #8)', () => {
  beforeEach(() => {
    toastWarningMock.mockClear();
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
    );
  });

  it('does NOT auto-reset the form when voc.updated_at changes mid-edit', async () => {
    const user = userEvent.setup();

    // Use a controlled component so we can flip voc props (simulating the
    // refetch landing) while the user is mid-edit.
    function Host({ voc }: { voc: typeof VOC_V1 }) {
      return <EditDescriptionModal voc={voc} open={true} onClose={vi.fn()} />;
    }

    const { rerender } = render(<Host voc={VOC_V1} />, { wrapper: makeWrapper() });

    // User starts typing AFTER the 409 toast fired — clears and types a new value.
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, 'user-in-progress edit');
    expect(titleInput).toHaveValue('user-in-progress edit');

    // Simulate the refetch landing (parent passes V2 voc with new updated_at).
    rerender(<Host voc={VOC_V2} />);

    // The in-progress edit must survive — no auto-reset.
    // The OLD implementation would have clobbered this back to "v2 title (refetched)".
    expect(titleInput).toHaveValue('user-in-progress edit');
  });

  it('stale_write toast carries a "다시 불러오기" action that resets to the latest voc', async () => {
    // We capture mutate's onError to fire the 409 error manually.
    let capturedOnError: ((err: unknown) => void) | undefined;
    const mutateMock = vi.fn((_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
      capturedOnError = opts?.onError;
    });
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      mutate: mutateMock,
    } as unknown as ReturnType<typeof useVocEditDescriptionMutation>);

    const user = userEvent.setup();

    function Host({ voc }: { voc: typeof VOC_V1 }) {
      return <EditDescriptionModal voc={voc} open={true} onClose={vi.fn()} />;
    }

    const { rerender } = render(<Host voc={VOC_V1} />, { wrapper: makeWrapper() });

    // Submit triggers mutate → captures onError.
    await user.click(screen.getByRole('button', { name: '수정 저장' }));
    expect(capturedOnError).toBeDefined();

    // Fire stale_write error.
    const { ApiError } = await import('@/lib/api');
    const staleErr = new ApiError(409, {
      code: 'conflict.stale_write',
      message: 'stale',
    });
    await act(async () => {
      capturedOnError!(staleErr);
    });

    // toast.warning was called with options containing an action with label
    // "다시 불러오기".
    expect(toastWarningMock).toHaveBeenCalled();
    const lastCall = toastWarningMock.mock.calls.at(-1) ?? [];
    const options = lastCall[1] as { action?: { label: string; onClick: () => void } } | undefined;
    expect(options).toBeDefined();
    expect(options?.action?.label).toBe('다시 불러오기');

    // User keeps typing while waiting for the refetch — value still intact.
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, 'still typing');
    expect(titleInput).toHaveValue('still typing');

    // The refetch lands (parent re-renders with V2 voc).
    rerender(<Host voc={VOC_V2} />);

    // Edit still intact (no auto-reset).
    expect(titleInput).toHaveValue('still typing');

    // User clicks the action button → resets to V2 defaults.
    await act(async () => {
      options!.action!.onClick();
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('v2 title (refetched)');
    });
  });
});
