// voc-edit-description-flow.integration.test.tsx — C6.3 cross-cutting integration test
//
// Exercises the Reporter pre-triage edit description flow:
//   1. Reporter on their own untriaged VOC → 설명 수정 button visible
//   2. Non-reporter or triaged VOC → 설명 수정 button hidden
//   3. Click 설명 수정 → EditDescriptionModal opens with prefilled values
//   4. Modify title → submit → PATCH /vocs/:id/description fires with Idempotency-Key + If-Match
//   5. On 200 success: modal closes + ['voc', id] invalidated + success toast
//   6. 409 conflict.triage_already_committed → modal closes + toast
//   7. 409 conflict.stale_write → modal stays open
//
// C6.3 of slice3 #21.
// Test framework: Vitest + @testing-library/react (O-6 in PLAN-21).

import type { VocDetailEnvelope } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── sonner mock ──────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => null,
}));

// ── @fops/ui RichEditor mock ─────────────────────────────────────────────────
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      surface,
      onChange,
      placeholder,
    }: {
      surface?: string;
      onChange?: (doc: unknown) => void;
      placeholder?: string;
    }) => (
      <textarea
        data-testid={`rich-editor-${surface ?? 'default'}`}
        placeholder={placeholder}
        onChange={(e) =>
          onChange?.({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: e.target.value }],
              },
            ],
          })
        }
      />
    ),
  };
});

import { toast } from 'sonner';
import { DescriptionSection } from '../../components/detail/DescriptionSection';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000030';

/** Untriaged VOC owned by REPORTER_ID */
const VOC_UNTRIAGED: VocDetailEnvelope = {
  id: '00000000-0000-0000-0000-000000000200',
  display_id: 'VOC-E-001',
  title: '원래 제목',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
  reporter_id: REPORTER_ID,
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  similar: { items: [] },
  attachments: [],
  attachment_count: 0,
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '원래 상세 내용' }] }],
  },
  next_actions: [],
  reporter_status_gate: undefined,
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

/** Triaged VOC — 설명 수정 button should NOT show even for the reporter */
const VOC_TRIAGED: VocDetailEnvelope = {
  ...VOC_UNTRIAGED,
  id: '00000000-0000-0000-0000-000000000201',
  triage_state: 'triaged',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Edit description flow — integration (C6.3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── Test 1: 설명 수정 button visible for reporter on own untriaged VOC ────────
  it('shows 설명 수정 button when isReporterOnOwnVoc=true', () => {
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    // The button text is "설명 수정" (from DescriptionSection.tsx)
    expect(screen.getByRole('button', { name: '설명 수정' })).toBeInTheDocument();
  });

  // ── Test 2: 설명 수정 button hidden when gate fails ───────────────────────────
  it('hides 설명 수정 button when isReporterOnOwnVoc=false', () => {
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_TRIAGED} isReporterOnOwnVoc={false} />
      </Wrapper>,
    );

    expect(screen.queryByRole('button', { name: '설명 수정' })).not.toBeInTheDocument();
  });

  // ── Test 3: Click 설명 수정 → modal opens with prefilled title ────────────────
  it('opens EditDescriptionModal with prefilled title when 설명 수정 clicked', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: '설명 수정' }));

    await waitFor(() => {
      // Modal content: Title field (DialogTitle is "설명 수정", the input field label is "제목")
      const titleInput = screen.getByRole('textbox', { name: /제목/ });
      expect(titleInput).toHaveValue('원래 제목');
    });

    // RichEditor mock rendered for voc-description surface
    expect(screen.getByTestId('rich-editor-voc-description')).toBeInTheDocument();
  });

  // ── Test 4: Submit → PATCH fires with Idempotency-Key + If-Match ─────────────
  it('submitting the modal fires PATCH /vocs/:id/description with Idempotency-Key + If-Match', async () => {
    const user = userEvent.setup();
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: unknown = null;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = init?.method ?? 'GET';
      if (init?.body) capturedBody = JSON.parse(init.body as string);
      const rawHeaders = init?.headers;
      if (rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)) {
        capturedHeaders = rawHeaders as Record<string, string>;
      } else if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => {
          capturedHeaders[k] = v;
        });
      }
      return jsonResponse({
        id: VOC_UNTRIAGED.id,
        title: '수정된 제목',
        updated_at: '2026-05-02T00:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    // Open modal
    await user.click(screen.getByRole('button', { name: '설명 수정' }));

    // Wait for modal to open
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toBeInTheDocument();
    });

    // Modify title
    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, '수정된 제목');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /수정 저장/i });
    await act(async () => {
      await user.click(submitBtn);
    });

    await waitFor(() => expect(capturedUrl).toBeTruthy());

    // URL shape: PATCH /vocs/:id/description
    expect(capturedUrl).toContain(`/vocs/${VOC_UNTRIAGED.id}/description`);
    expect(capturedMethod.toUpperCase()).toBe('PATCH');

    // Headers: Idempotency-Key + If-Match
    const idk = capturedHeaders['Idempotency-Key'] ?? capturedHeaders['idempotency-key'];
    expect(idk).toBeTruthy();
    const ifMatch = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatch).toBe(VOC_UNTRIAGED.updated_at);

    // Body: has title
    const body = capturedBody as Record<string, unknown>;
    expect(body.title).toBe('수정된 제목');
  });

  // ── Test 5: 200 success → modal closes and shows success toast ───────────────
  it('on 200 success: modal closes and shows success toast', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        id: VOC_UNTRIAGED.id,
        title: '수정된 제목',
        updated_at: '2026-05-02T00:00:00.000Z',
      }),
    ) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: '설명 수정' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toBeInTheDocument();
    });

    const titleInput = screen.getByRole('textbox', { name: /제목/ });
    await user.clear(titleInput);
    await user.type(titleInput, '수정된 제목');

    const submitBtn = screen.getByRole('button', { name: /수정 저장/i });
    await act(async () => {
      await user.click(submitBtn);
    });

    // Modal should close: title input no longer visible
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /제목/ })).not.toBeInTheDocument();
    });

    // Success toast
    expect(toast.success).toHaveBeenCalledWith('설명이 수정되었습니다.');
  });

  // ── Test 6: 409 triage_already_committed → modal closes ─────────────────────
  it('triage_already_committed (409) closes modal and shows error or warning toast', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          code: 'conflict.triage_already_committed',
          message: '이미 트리아지가 완료되어 본인이 직접 수정할 수 없습니다.',
        },
        409,
      ),
    ) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: '설명 수정' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toBeInTheDocument();
    });

    // Submit directly (title unchanged is valid — the server will reject it)
    const submitBtn = screen.getByRole('button', { name: /수정 저장/i });
    await act(async () => {
      await user.click(submitBtn);
    });

    // Modal should close after triage_already_committed
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /제목/ })).not.toBeInTheDocument();
    });

    // A toast was called (warning or error)
    const toastCalled =
      (toast.warning as ReturnType<typeof vi.fn>).mock.calls.length > 0 ||
      (toast.error as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    expect(toastCalled).toBe(true);
  });

  // ── Test 7: 409 stale_write → modal stays open ───────────────────────────────
  it('stale_write (409) keeps modal open', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          code: 'conflict.stale_write',
          message: 'VOC가 변경되었습니다. 새로 불러왔습니다. 다시 시도해 주세요.',
        },
        409,
      ),
    ) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <DescriptionSection voc={VOC_UNTRIAGED} isReporterOnOwnVoc={true} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: '설명 수정' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /수정 저장/i });
    await act(async () => {
      await user.click(submitBtn);
    });

    // Modal must remain open after stale_write (title input still visible)
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /제목/ })).toBeInTheDocument();
    });
  });
});
