// ReporterReplyComposer.test.tsx — TDD RED
// Tests:
//   1. success POST shape + invalidation: renders, submits, invalidates ['voc', id]
//   2. reporter visibility: only reporter sees this composer per useComposerVisibility
//
// C5.3 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468
//   Reply variant is the same shell minus ReporterStatusChangeBlock.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: vi.fn(({ onSuccess }: { onSuccess?: () => void } = {}) => ({
    mutate: mockMutate.mockImplementation((_vars: unknown) => {
      onSuccess?.();
    }),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// Mock RichEditor to avoid TipTap JSDOM issues.
vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
      'data-testid': testId,
    }: {
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
      'data-testid'?: string;
    }) =>
      React.createElement('div', {
        'data-testid': testId ?? 'rich-editor',
        role: 'textbox',
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          }),
      }),
  };
});

import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { ReporterReplyComposer } from '../ReporterReplyComposer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-2222',
  display_id: 'VOC-0002',
  title: '테스트 VOC 리플라이',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'medium',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME_REPORTER: MeResponse = {
  actor: {
    id: REPORTER_ID,
    external_id: 'reporter-1',
    email: 'reporter@feedbackops.local',
    display_name: '리포터',
    role_level: 'user',
  },
  workspace_id: 'ws-1111',
};

const ME_ADMIN: MeResponse = {
  actor: {
    id: ADMIN_ID,
    external_id: 'admin-1',
    email: 'admin@feedbackops.local',
    display_name: '관리자',
    role_level: 'admin',
  },
  workspace_id: 'ws-1111',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<ReporterReplyComposer>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signals public after a successful Reporter Reply', () => {
    const onPosted = vi.fn();
    render(<ReporterReplyComposer voc={BASE_VOC} me={ME_REPORTER} onPosted={onPosted} />, {
      wrapper: makeWrapper(),
    });
    expect(onPosted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByRole('button', { name: '답변 보내기' }));

    expect(onPosted).toHaveBeenCalledWith('public');
  });

  it('uses 제출자 as the fallback identity in the reply preview', async () => {
    render(<ReporterReplyComposer voc={BASE_VOC} me={ME_REPORTER} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByText(/제출자 ·/)).toBeInTheDocument();
  });

  it('renders the composer and wires submit mutation: invalidates [voc, id] on success', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    // Capture the onSuccess callback from the mutation hook.
    const { useVocReporterReplyMutation } = await import(
      '@/features/voc/hooks/useVocReporterReplyMutation'
    );
    let capturedOnSuccess: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useVocReporterReplyMutation).mockImplementation((args: any = {}) => {
      capturedOnSuccess = args.onSuccess;
      return {
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });

    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    render(<ReporterReplyComposer voc={BASE_VOC} me={ME_REPORTER} />, { wrapper: Wrapper });

    // Composer renders
    expect(screen.getByTestId('reporter-reply-composer')).toBeInTheDocument();

    // Send button is present
    expect(screen.getByRole('button', { name: /답변 보내기/ })).toBeInTheDocument();

    // Trigger onSuccess (simulates mutation callback)
    capturedOnSuccess?.();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['voc', BASE_VOC.id] }),
      );
    });
  });

  it('renders for any actor it is given — the Reporter-only gate is owned by <ComposerSection>', () => {
    // This presentational composer is unguarded. Only the VOC's Reporter is offered the Reply
    // tab (useComposerVisibility: actor.id === voc.reporter_id, any role), so an Admin on
    // someone else's VOC never reaches it in the app.
    render(
      <ReporterReplyComposer voc={BASE_VOC} me={ME_REPORTER} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByTestId('reporter-reply-composer')).toBeInTheDocument();

    render(
      <ReporterReplyComposer voc={BASE_VOC} me={ME_ADMIN} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getAllByTestId('reporter-reply-composer')).toHaveLength(2);
  });

  it('disables Send reply for a whitespace-only draft without calling the mutation', () => {
    render(
      <ReporterReplyComposer
        voc={BASE_VOC}
        me={ME_REPORTER}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('reporter-reply-composer')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: /답변 보내기/ });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('enables Send reply for a text draft', () => {
    render(
      <ReporterReplyComposer
        voc={BASE_VOC}
        me={ME_REPORTER}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'reply' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('reporter-reply-composer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /답변 보내기/ })).not.toBeDisabled();
  });
});
