// voc-composer-flow.integration.test.tsx — C6.3 cross-cutting integration test
//
// Exercises the full composer user flow:
//   1. Open detail panel → ComposerSection renders for an admin-in-MS actor
//   2. Switch tabs → each tab's composer body renders
//   3. Admin sees all 3 tabs; Reporter on own VOC sees only Reply tab
//   4. Submit Public Update → POST /vocs/:id/public-updates fires with correct body
//   5. On 200 success: ['voc', id] invalidated (refetch triggered), toast fired
//   6. DirtyConfirmation: close with dirty draft shows confirmation dialog
//
// C6.3 of slice3 #21.
// Test framework: Vitest + @testing-library/react (O-6 in PLAN-21).

import type { MeResponse } from '@/lib/api/auth';
import type { VocDetailEnvelope } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('@/lib/api/attachments', () => ({ uploadAttachment: vi.fn() }));

// ── @fops/ui RichEditor mock ─────────────────────────────────────────────────
// Replace heavy TipTap editor with a simple textarea so RTL can interact with it.
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

import { uploadAttachment } from '@/lib/api/attachments';
import { toast } from 'sonner';
import { ComposerSection } from '../../components/detail/ComposerSection';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Admin actor — role_level 'admin' sees all 3 tabs (useComposerVisibility: non-user role) */
const ME_ADMIN: MeResponse = {
  actor: {
    id: '00000000-0000-0000-0000-000000000099',
    external_id: 'ext-admin-001',
    email: 'admin@example.com',
    display_name: 'Admin User',
    role_level: 'admin',
  },
  workspace_id: '00000000-0000-0000-0000-000000000001',
};

/** Reporter actor: role_level 'user' + id matches voc.reporter_id → Reply tab only */
const REPORTER_ID = '00000000-0000-0000-0000-000000000050';
const ME_REPORTER: MeResponse = {
  actor: {
    id: REPORTER_ID,
    external_id: 'ext-reporter-001',
    email: 'reporter@example.com',
    display_name: 'Reporter User',
    role_level: 'user',
  },
  workspace_id: '00000000-0000-0000-0000-000000000001',
};

/** VOC owned by a different reporter — admin should see public+reply+internal */
const VOC_ADMIN_VIEW: VocDetailEnvelope = {
  id: '00000000-0000-0000-0000-000000000100',
  display_id: 'VOC-C-001',
  title: '컴포저 통합 테스트 VOC',
  reporter_facing_status: 'progress',
  severity: 'medium',
  owner_user_id: ME_ADMIN.actor.id,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
  reporter_id: '00000000-0000-0000-0000-000000000060',
  triage_state: 'triaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  similar: { items: [] },
  attachments: [],
  attachment_count: 0,
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'VOC 상세 내용' }] }],
  },
  next_actions: [],
  reporter_status_gate: undefined,
  next_reporter_states: {
    allowed: ['progress', 'resolved'],
    forbidden: {},
  },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

/** Reporter on their own untriaged VOC — sees Reply tab only */
const VOC_REPORTER_VIEW: VocDetailEnvelope = {
  ...VOC_ADMIN_VIEW,
  id: '00000000-0000-0000-0000-000000000101',
  display_id: 'VOC-C-002',
  triage_state: 'untriaged',
  reporter_id: REPORTER_ID,
};

const VOC_GATE_BLOCKED: VocDetailEnvelope = {
  ...VOC_ADMIN_VIEW,
  reporter_status_gate: { blocking_for: ['progress'], reason: '연결된 Task가 아직 진행 중입니다.' },
};

const ATTACHMENT = {
  id: '00000000-0000-0000-0000-000000000200',
  name: 'preview.png',
  size_bytes: 1,
  mime_type: 'image/png',
  uploaded_by_actor_id: ME_ADMIN.actor.id,
  created_at: '2026-05-01T00:00:00.000Z',
} as Awaited<ReturnType<typeof uploadAttachment>>;

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

function fillPublicUpdate(value: string): void {
  fireEvent.change(screen.getByTestId('rich-editor-public-update'), { target: { value } });
}

function previewDialog() {
  return screen.findByRole('dialog', { name: 'Public update — Reporter preview' });
}

/**
 * Installs a fetch double that records only POSTs. Reads (e.g. /actors) still
 * resolve, so a "no mutation happened" assertion counts publish attempts rather
 * than every request the screen makes.
 */
function recordPosts(): Array<{ input: RequestInfo | URL; init?: RequestInit }> {
  const posts: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push({ input, init });
    return jsonResponse({});
  }) as typeof globalThis.fetch;
  return posts;
}

/** Lets any mutation scheduled by a click actually reach fetch before we count. */
async function flushMutations(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Composer flow — integration (C6.3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadAttachment).mockResolvedValue(ATTACHMENT);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── Test 1: Admin sees all 3 tabs ─────────────────────────────────────────
  it('admin sees all three composer tabs (Public update, Reporter reply, Internal note)', () => {
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    // Tab labels from ComposerTabs TAB_CONFIGS: 'Public update', 'Reporter reply', 'Internal note'
    expect(screen.getByRole('tab', { name: /public update/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /reporter reply/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /internal note/i })).toBeInTheDocument();
  });

  // ── Test 2: Reporter sees only Reply tab ───────────────────────────────────
  it('reporter on their own untriaged VOC sees only Reporter reply tab', () => {
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <ComposerSection voc={VOC_REPORTER_VIEW} me={ME_REPORTER} />
      </Wrapper>,
    );

    // Only Reporter reply tab shown
    expect(screen.getByRole('tab', { name: /reporter reply/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /public update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /internal note/i })).not.toBeInTheDocument();
  });

  // ── Test 3: Switching tabs renders the correct composer body ────────────────
  it('switching tabs renders the corresponding composer body (rich editor surface)', async () => {
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    // Default: Public update tab active → rich-editor-public-update present
    expect(screen.getByTestId('rich-editor-public-update')).toBeInTheDocument();

    // Switch to Internal note
    fireEvent.click(screen.getByRole('tab', { name: /internal note/i }));
    await waitFor(() => {
      expect(screen.getByTestId('rich-editor-internal-comment')).toBeInTheDocument();
    });

    // Switch to Reporter reply
    fireEvent.click(screen.getByRole('tab', { name: /reporter reply/i }));
    await waitFor(() => {
      expect(screen.getByTestId('rich-editor-reporter-reply')).toBeInTheDocument();
    });
  });

  // ── Test 4: Submit Public Update → POST fires with correct body + success toast ──
  it('submitting Public Update fires POST /vocs/:id/public-updates and shows success toast', async () => {
    let capturedBody: unknown = null;
    let capturedUrl = '';
    let capturedMethod = '';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = init?.method ?? 'GET';
      if (init?.body) capturedBody = JSON.parse(init.body as string);
      return jsonResponse({
        id: 'pub-update-001',
        voc_id: VOC_ADMIN_VIEW.id,
        created_at: '2026-05-01T12:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    // Type into the public-update rich editor (mocked as textarea)
    const editor = screen.getByTestId('rich-editor-public-update');
    fireEvent.change(editor, { target: { value: '공개 업데이트 내용입니다.' } });

    // Find the Publish button on the ComposerFooter and click it
    const publishBtn = screen.getByRole('button', { name: /publish update/i });
    expect(publishBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(publishBtn);
    });

    // Wait for fetch to be called
    await waitFor(() => expect(capturedUrl).toBeTruthy());

    expect(capturedUrl).toContain(`/vocs/${VOC_ADMIN_VIEW.id}/public-updates`);
    expect(capturedMethod.toUpperCase()).toBe('POST');

    const body = capturedBody as Record<string, unknown>;
    // Must have body_rich_content and next_reporter_facing_status
    expect(body.body_rich_content).toBeTruthy();
    expect(body.next_reporter_facing_status).toBeTruthy();

    // Success toast fired
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('공개 업데이트가 게시되었습니다.');
    });
  });

  // ── Test 5: DirtyConfirmation shows when close requested with dirty draft ───
  it('shows DirtyConfirmation when close is requested with a dirty draft', async () => {
    const onCloseRequest = vi.fn();
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} onCloseRequest={onCloseRequest} />
      </Wrapper>,
    );

    // Click in the composer body area to mark dirty (ComposerSection tracks onClick)
    const editor = screen.getByTestId('rich-editor-public-update');
    fireEvent.change(editor, { target: { value: '임시 내용' } });
    // Also click the editor to trigger the onClick dirty tracking in ComposerSection
    fireEvent.click(editor);

    // Click close button (닫기)
    const closeBtn = screen.getByRole('button', { name: '닫기' });
    fireEvent.click(closeBtn);

    // DirtyConfirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });

    // onCloseRequest must NOT have been called yet
    expect(onCloseRequest).not.toHaveBeenCalled();
  });

  // ── Test 6: ['voc', id] query invalidated after successful Public Update submit ──
  it('invalidates [voc, id] query after successful submit', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    // Pre-seed the query cache so we can observe invalidation
    qc.setQueryData(['voc', VOC_ADMIN_VIEW.id], VOC_ADMIN_VIEW);

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        id: 'pub-update-002',
        voc_id: VOC_ADMIN_VIEW.id,
        created_at: '2026-05-01T12:00:00.000Z',
      }),
    ) as typeof globalThis.fetch;

    render(
      <QueryClientProvider client={qc}>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </QueryClientProvider>,
    );

    const editor = screen.getByTestId('rich-editor-public-update');
    fireEvent.change(editor, { target: { value: '쿼리 무효화 테스트' } });

    const publishBtn = screen.getByRole('button', { name: /publish update/i });
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['voc', VOC_ADMIN_VIEW.id] }),
      );
    });
  });

  it('publishes once from preview with the VOC id, If-Match value, and public-update body', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') requests.push({ input, init });
      return jsonResponse({ id: 'pub-update-preview-001' });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('미리보기에서 게시합니다.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();

    await act(async () => {
      fireEvent.click(within(preview).getByRole('button', { name: 'Publish update' }));
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(
      screen.queryByRole('dialog', { name: 'Public update — Reporter preview' }),
    ).not.toBeInTheDocument();

    const request = requests[0];
    if (!request) throw new Error('expected a public-update request');
    expect(String(request.input)).toContain(`/vocs/${VOC_ADMIN_VIEW.id}/public-updates`);
    expect(new Headers(request.init?.headers).get('if-match')).toBe(VOC_ADMIN_VIEW.updated_at);
    expect(JSON.parse(request.init?.body as string)).toEqual({
      skip_public_update: false,
      body_rich_content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '미리보기에서 게시합니다.' }] },
        ],
      },
      next_reporter_facing_status: 'progress',
      attachment_ids: [],
    });
  });

  it('continues editing from preview without mutating', async () => {
    const posts = recordPosts();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('계속 편집합니다.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();
    fireEvent.click(within(preview).getByRole('button', { name: 'Continue editing' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Public update — Reporter preview' }),
      ).not.toBeInTheDocument();
    });
    // The draft survives: this closed the preview, it did not discard the update.
    expect(screen.getByTestId('rich-editor-public-update')).toHaveValue('계속 편집합니다.');
    await flushMutations();
    expect(posts).toHaveLength(0);
  });

  it('disables preview publish for an empty public update without mutating', async () => {
    const posts = recordPosts();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    await screen.findByTestId('rich-editor-public-update');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();
    const publish = within(preview).getByRole('button', { name: 'Publish update' });
    expect(publish).toBeDisabled();
    fireEvent.click(publish);
    await flushMutations();
    expect(posts).toHaveLength(0);
  });

  it('disables preview publish when the reporter-status gate blocks it', async () => {
    const posts = recordPosts();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_GATE_BLOCKED} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('게이트가 막은 업데이트');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();
    const publish = within(preview).getByRole('button', { name: 'Publish update' });
    expect(publish).toBeDisabled();
    fireEvent.click(publish);
    await flushMutations();
    expect(posts).toHaveLength(0);
  });

  it('disables preview publish while an attachment upload is in progress', async () => {
    let resolveUpload: ((attachment: typeof ATTACHMENT) => void) | undefined;
    vi.mocked(uploadAttachment).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const posts = recordPosts();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('첨부를 기다리는 업데이트');
    fireEvent.change(screen.getByTestId('public-update-attachment-dropzone-input'), {
      target: { files: [new File(['x'], 'preview.png', { type: 'image/png' })] },
    });
    await screen.findByText(/업로드 중/);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();
    const publish = within(preview).getByRole('button', { name: 'Publish update' });
    expect(publish).toBeDisabled();
    fireEvent.click(publish);
    await flushMutations();
    expect(posts).toHaveLength(0);

    await act(async () => {
      resolveUpload?.(ATTACHMENT);
    });
    // Once the upload settles the same control becomes publishable — proving the
    // assertion above was blocked by the upload, not by a permanently dead button.
    await waitFor(() =>
      expect(within(preview).getByRole('button', { name: 'Publish update' })).toBeEnabled(),
    );
  });

  it('sends one preview publish request when activated twice before the first response', async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    let postCount = 0;
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.resolve(jsonResponse({}));
      postCount += 1;
      request = { input, init };
      return new Promise<Response>((resolve) => {
        resolvePost = resolve;
      });
    }) as typeof globalThis.fetch;
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('프리뷰 연타 방지');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await previewDialog();
    const publish = within(preview).getByRole('button', { name: 'Publish update' });
    await act(async () => {
      fireEvent.click(publish);
      fireEvent.click(publish);
    });

    expect(postCount).toBe(1);
    expect(String(request?.input)).toContain(`/vocs/${VOC_ADMIN_VIEW.id}/public-updates`);
    expect(JSON.parse(request?.init?.body as string)).toMatchObject({
      body_rich_content: { content: [{ content: [{ text: '프리뷰 연타 방지' }] }] },
    });
    await act(async () => {
      resolvePost?.(jsonResponse({ id: 'pub-update-preview-rapid-001' }));
    });
  });

  it('still publishes through the composer footer', async () => {
    let capturedBody: unknown;
    let capturedRequest: { input: RequestInfo | URL; init: RequestInit | undefined } | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = { input, init };
      if (init?.method === 'POST') capturedBody = JSON.parse(init.body as string);
      return jsonResponse({ id: 'pub-update-footer-001' });
    }) as typeof globalThis.fetch;
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <ComposerSection voc={VOC_ADMIN_VIEW} me={ME_ADMIN} />
      </Wrapper>,
    );

    fillPublicUpdate('푸터 발행 회귀 방지');
    fireEvent.click(screen.getByRole('button', { name: 'Publish update' }));

    await waitFor(() => expect(capturedBody).toBeTruthy());
    expect(String(capturedRequest?.input)).toContain(`/vocs/${VOC_ADMIN_VIEW.id}/public-updates`);
    expect(new Headers(capturedRequest?.init?.headers).get('if-match')).toBe(
      VOC_ADMIN_VIEW.updated_at,
    );
    expect(capturedBody).toMatchObject({
      body_rich_content: {
        content: [{ content: [{ text: '푸터 발행 회귀 방지' }] }],
      },
      next_reporter_facing_status: 'progress',
    });
  });
});
