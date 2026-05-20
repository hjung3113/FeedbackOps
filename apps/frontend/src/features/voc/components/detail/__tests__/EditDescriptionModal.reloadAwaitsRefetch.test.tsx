// EditDescriptionModal.reloadAwaitsRefetch.test.tsx — codex REV-3 Cluster W
//
// Finding: the "다시 불러오기" action resets form from `vocRef.current`, which
// is stale until the parent re-renders with the refetched VOC. Clicking the
// action between the invalidate and the refetch landing resets to the OLD
// values — the user sees the prior content again, not the latest server
// state. REV-2 #8 partial residual.
//
// Required behavior: the action handler awaits a refetch of ['voc', id]
// before resetting the form, so form.reset always reads the freshest VOC
// data.

import * as React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────

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

// sonner stub — capture warning options.
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

// ── Fixture ────────────────────────────────────────────────────────────────

const VOC_V1 = {
  id: 'voc-uuid-rev3-W',
  title: 'v1 title',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v1 body' }] }],
  },
};

const VOC_V2_FRESH = {
  ...VOC_V1,
  title: 'v2 title (server fresh)',
  updated_at: '2026-05-01T00:02:00Z',
};

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

describe('<EditDescriptionModal> reload awaits refetch (REV-3 Cluster W)', () => {
  beforeEach(() => {
    toastWarningMock.mockClear();
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocEditDescriptionMutation>,
    );
  });

  it('clicking 다시 불러오기 awaits a refetch of ["voc", id] before resetting the form', async () => {
    const user = userEvent.setup();

    // Capture mutate onError so we can fire the 409 manually.
    let capturedOnError: ((err: unknown) => void) | undefined;
    const mutateMock = vi.fn((_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
      capturedOnError = opts?.onError;
    });
    vi.mocked(useVocEditDescriptionMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      mutate: mutateMock,
    } as unknown as ReturnType<typeof useVocEditDescriptionMutation>);

    // QueryClient pre-seeded with V1; refetch will resolve to V2 (the freshest
    // server data). The Host component below renders <EditDescriptionModal>
    // with a `voc` prop tied to the V1 fixture so vocRef stays V1 until the
    // parent re-renders. The TEST asserts that the reload action, when
    // clicked, refetches the query and resets the form to V2 — NOT V1.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    // Seed the cache with V1 first.
    qc.setQueryData(['voc', VOC_V1.id], VOC_V1);

    // Spy on refetchQueries.
    let refetchResolve: () => void = () => {};
    const refetchPromise = new Promise<void>((resolve) => {
      refetchResolve = resolve;
    });
    const refetchSpy = vi.spyOn(qc, 'refetchQueries').mockImplementation(async (...args) => {
      // After the refetch is "awaited", the cache should be updated to V2.
      // The test asserts the action explicitly awaits this; resolve only
      // when the test releases it.
      await refetchPromise;
      qc.setQueryData(['voc', VOC_V1.id], VOC_V2_FRESH);
      return [] as unknown as Awaited<ReturnType<typeof qc.refetchQueries>>;
    });

    function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    }

    // Host: keeps `voc` prop pinned at V1 throughout — the parent does NOT
    // re-render with V2. The reload action must therefore read fresh data
    // from the query cache after refetch, NOT from `vocRef.current`.
    function Host() {
      return <EditDescriptionModal voc={VOC_V1} open={true} onClose={vi.fn()} />;
    }

    render(<Host />, { wrapper: Wrapper });

    // Submit triggers mutate → captures onError.
    await user.click(screen.getByRole('button', { name: '수정 저장' }));
    expect(capturedOnError).toBeDefined();

    // Fire stale_write 409.
    const { ApiError } = await import('@/lib/api');
    const staleErr = new ApiError(409, {
      code: 'conflict.stale_write',
      message: 'stale',
    });
    await act(async () => {
      capturedOnError!(staleErr);
    });

    // Toast captured.
    expect(toastWarningMock).toHaveBeenCalled();
    const lastCall = toastWarningMock.mock.calls.at(-1) ?? [];
    const options = lastCall[1] as { action?: { label: string; onClick: () => void } } | undefined;
    expect(options).toBeDefined();
    expect(options?.action?.label).toBe('다시 불러오기');

    // User clicks 다시 불러오기. The action handler MUST refetch before
    // resetting the form. Release the refetch only after asserting the
    // refetch was invoked.
    const clickPromise = act(async () => {
      options!.action!.onClick();
    });

    // The action should have called refetchQueries with ['voc', id].
    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalled();
    });
    const refetchCall = refetchSpy.mock.calls[0]?.[0] as
      | { queryKey?: readonly unknown[] }
      | undefined;
    expect(refetchCall?.queryKey).toEqual(['voc', VOC_V1.id]);

    // The form should NOT have been reset to V2 yet — the refetch hasn't
    // resolved.
    const titleInputBefore = screen.getByRole('textbox', { name: /제목/ });
    expect(titleInputBefore).toHaveValue('v1 title');

    // Release the refetch — now V2 is in the cache.
    refetchResolve();
    await clickPromise;

    // After the action handler awaits the refetch and resets, the title
    // input must reflect V2 (fresh server data), NOT V1 (the stale prop
    // value the parent is still passing).
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('v2 title (server fresh)');
    });
  });
});
