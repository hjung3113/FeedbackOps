// C8 — Integration tests for VocCreateScreen.
// Mocks global.fetch directly (no msw) per the house style in client.test.ts.
// Tests cover: happy-path 201, 422 field errors, 429 rate-limit, 409 idempotency
// reuse, 404 not-found, and empty MS list.

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ── Mock modules ──────────────────────────────────────────────────────────────

// sonner toast — capture calls for assertions
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

// useMe — return a stable reporter actor; avoids QueryClient complexity for /me
vi.mock('@/lib/auth/useMe', () => ({
  useMe: vi.fn(),
}));

import { toast } from 'sonner';
import { useMe } from '@/lib/auth/useMe';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@/lib/auth/useMe';
import { VocCreateScreen } from '../VocCreateScreen';

// ── Shared fixture data ───────────────────────────────────────────────────────

const MS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AA_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VOC_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const MS_ITEM = {
  id: MS_ID,
  workspace_id: 'ws-1',
  slug: 'test-ms',
  name: 'Test MS',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
};

const AA_ITEM = {
  id: AA_ID,
  workspace_id: 'ws-1',
  managed_system_id: MS_ID,
  slug: 'test-aa',
  name: 'Test AA',
  owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
};

const MOCK_ME: MeResponse = {
  actor: {
    id: '00000000-0000-0000-0000-000000000001',
    external_id: 'reporter-1',
    email: 'reporter@feedbackops.local',
    display_name: '김테스트',
    role_level: 'Reporter',
  },
  workspace_id: '11111111-1111-1111-1111-111111111111',
};

function makeUseMeSuccess(): UseQueryResult<MeResponse> {
  return {
    data: MOCK_ME,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isPaused: false,
    refetch: vi.fn() as UseQueryResult<MeResponse>['refetch'],
  } as UseQueryResult<MeResponse>;
}

// ── Router harness (matches managed-systems.test.tsx pattern) ─────────────────

function buildHarness(screenProps?: Partial<React.ComponentProps<typeof VocCreateScreen>>) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const vocCreateRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vocs',
    component: () => (
      <VocCreateScreen
        onCancel={vi.fn()}
        {...screenProps}
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([vocCreateRoute]),
    history: createMemoryHistory({ initialEntries: ['/vocs'] }),
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { router, qc };
}

function renderHarness(screenProps?: Partial<React.ComponentProps<typeof VocCreateScreen>>) {
  const { router, qc } = buildHarness(screenProps);
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, qc };
}

// Helper: build a JSON Response
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// Helper: install a fetch mock with per-URL routing
function installFetch(
  options: {
    msItems?: unknown[];
    aaItems?: unknown[];
    postVocsResponse?: { status: number; body: unknown; headers?: Record<string, string> };
  },
) {
  const { msItems = [MS_ITEM], aaItems = [AA_ITEM], postVocsResponse } = options;
  const postBodies: unknown[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/managed-systems') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ items: msItems, total: msItems.length });
    }
    if (url.includes('/analytics-areas') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ items: aaItems, total: aaItems.length });
    }
    if (url.includes('/vocs') && init?.method === 'POST') {
      postBodies.push(JSON.parse(String(init.body)));
      if (!postVocsResponse) return jsonResponse({}, 500);
      return jsonResponse(postVocsResponse.body, postVocsResponse.status, postVocsResponse.headers ?? {});
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
  return { postBodies };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('VocCreateScreen integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(useMe).mockReturnValue(makeUseMeSuccess());
    // Reset all mocked toast fns before each test
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.warning).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── 1. Happy path (201) ────────────────────────────────────────────────────
  test('happy path: 201 navigates to /vocs?view=my&selected=<id>', async () => {
    installFetch({
      postVocsResponse: {
        status: 201,
        body: { id: VOC_ID, display_id: 'V-1', created_at: '2026-05-20T00:00:00Z' },
      },
    });

    const { router } = renderHarness({ onCancel: vi.fn() });

    // Wait for MS picker to appear
    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    // Select the managed system by clicking its label button
    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));

    // Fill in title
    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '테스트 제목입니다' } });
    fireEvent.blur(titleInput);

    // The description_rich_content has a default emptyTipTapDoc() — zod allows
    // it (type: 'doc', content: []). The form's isValid gate depends on the
    // zodResolver; with a valid MS ID and title the form should become valid.
    // Find the submit button — it is disabled until the form is valid.
    // We need to wait for the form to become valid after selecting MS + title.
    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: 'VOC 제출' });
      expect(submitBtn).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    // The route must land on the reporter-readable My VOCs list with the
    // submitted record still selected.
    await waitFor(() => {
      expect(router.state.location.search).toEqual(
        expect.objectContaining({ view: 'my', selected: VOC_ID }),
      );
    });
  });

  test('AC-E14 renders help and submits independent source and Analytics Area values without a warning dialog', async () => {
    const { postBodies } = installFetch({
      postVocsResponse: {
        status: 201,
        body: { id: VOC_ID, display_id: 'V-1', created_at: '2026-05-20T00:00:00Z' },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => expect(screen.getByTestId('ms-picker')).toBeInTheDocument());
    expect(screen.getByText('타인 대신 보고는 다른 팀원이나 고객의 경험을 대신 등록하는 경우입니다.')).toBeInTheDocument();
    expect(screen.getByText('Analytics Area는 VOC를 분석할 때 함께 볼 주제에 맞춰 선택하세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));
    // Radix TabsTrigger activates on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: '타인 대신 보고' }));
    await waitFor(() => expect(screen.getByTestId('aa-picker')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: AA_ITEM.name }));
    fireEvent.change(screen.getByRole('textbox', { name: /제목/i }), { target: { value: '분류와 출처가 독립적인 VOC' } });
    fireEvent.blur(screen.getByRole('textbox', { name: /제목/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]).toEqual(expect.objectContaining({
      primary_managed_system_id: MS_ID,
      analytics_area_id: AA_ID,
      source_context: 'proxy_report',
      title: '분류와 출처가 독립적인 VOC',
      attachment_ids: [],
    }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── 2. 422 validation.failed with detail.fields ───────────────────────────
  test('422 validation.failed: per-field errors shown, toast.error NOT called', async () => {
    installFetch({
      postVocsResponse: {
        status: 422,
        body: {
          code: 'validation.failed',
          message: 'Validation failed',
          detail: {
            fields: [
              { path: ['title'], code: 'too_small', message: '제목은 1자 이상이어야 합니다.' },
              { path: ['primary_managed_system_id'], code: 'invalid_uuid', message: '올바른 UUID가 아닙니다.' },
            ],
          },
        },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    // Wait for MS picker
    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    // Select MS to make submit button reachable
    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));

    // Fill title
    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '제목' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    // Field errors should surface
    await waitFor(() => {
      expect(screen.getByText('제목은 1자 이상이어야 합니다.')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('올바른 UUID가 아닙니다.')).toBeInTheDocument();
    });

    // toast.error should NOT be called (per-field mode suppresses top toast)
    expect(toast.error).not.toHaveBeenCalled();
  });

  // ── 3. 429 rate_limited.actor with retry_after_seconds ────────────────────
  test('429 rate_limited.actor: toast.warning with "30초"', async () => {
    const futureReset = Math.floor(Date.now() / 1000) + 30;
    installFetch({
      postVocsResponse: {
        status: 429,
        body: {
          code: 'rate_limited.actor',
          message: 'rate limit exceeded',
          detail: { retry_after_seconds: 30 },
        },
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(futureReset),
          'retry-after': '30',
        },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));

    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '제목' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('30초'));
    });
  });

  // ── 4. 409 conflict.idempotency_key_reuse ─────────────────────────────────
  test('409 conflict.idempotency_key_reuse: toast.error with Korean copy', async () => {
    installFetch({
      postVocsResponse: {
        status: 409,
        body: {
          code: 'conflict.idempotency_key_reuse',
          message: 'idempotency key already used with different payload',
        },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));

    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '제목' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('같은 요청 키로 다른 작업을 시도했습니다'),
      );
    });
  });

  // ── 5. 404 not_found.record ───────────────────────────────────────────────
  test('404 not_found.record: toast.error with Korean copy', async () => {
    installFetch({
      postVocsResponse: {
        status: 404,
        body: {
          code: 'not_found.record',
          message: 'record not found',
        },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));

    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '제목' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('존재하지 않거나 접근할 수 없는 항목입니다'),
      );
    });
  });

  // ── 7. PLAN-22 Bug-3: submit-blocked alert when an attachment row errors ──
  test('PLAN-22 Bug-3: attachment row in error → inline alert visible + submit disabled', async () => {
    installFetch({
      postVocsResponse: {
        status: 201,
        body: { id: VOC_ID, display_id: 'V-1', created_at: '2026-05-20T00:00:00Z' },
      },
    });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => {
      expect(screen.getByTestId('ms-picker')).toBeInTheDocument();
    });

    // Fill the rest of the form so the only remaining gate is the attachment.
    fireEvent.click(screen.getByRole('radio', { name: MS_ITEM.name }));
    const titleInput = screen.getByRole('textbox', { name: /제목/i });
    fireEvent.change(titleInput, { target: { value: '제목' } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });

    // Initially: no alert.
    expect(screen.queryByTestId('attachment-submit-blocked-alert')).not.toBeInTheDocument();

    // Drop an oversize file (client-side rejection sets row.state = 'error').
    const input = screen
      .getByTestId('attachment-dropzone')
      .querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024, configurable: true });
    fireEvent.change(input, { target: { files: [big] } });

    // Alert appears.
    await waitFor(() => {
      expect(screen.getByTestId('attachment-submit-blocked-alert')).toBeInTheDocument();
    });
    expect(screen.getByTestId('attachment-submit-blocked-alert').textContent).toContain(
      '첨부 파일에 오류가 있어 제출할 수 없습니다',
    );
    // Submit becomes disabled while the alert is visible.
    expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeDisabled();

    // Remove the error row → alert disappears + submit re-enables.
    fireEvent.click(screen.getByLabelText('첨부 제거'));
    await waitFor(() => {
      expect(screen.queryByTestId('attachment-submit-blocked-alert')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled();
    });
  });

  // ── 6. Empty MS list ──────────────────────────────────────────────────────
  test('empty MS list: shows empty-state copy and link to /admin/managed-systems', async () => {
    installFetch({ msItems: [] });

    renderHarness({ onCancel: vi.fn() });

    await waitFor(() => {
      expect(screen.getByText(/등록된 Managed System이 없습니다/)).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /관리 페이지에서 추가하세요/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('/admin/managed-systems'));
  });
});
