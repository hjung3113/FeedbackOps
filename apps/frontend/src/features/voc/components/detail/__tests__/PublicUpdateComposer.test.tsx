// PublicUpdateComposer.test.tsx — TDD RED
// Tests:
//   1. body+status path: when nextStatus !== currentStatus, renders ReporterStatusChangeBlock
//   2. body-only path: when nextStatus === currentStatus, ReporterStatusChangeBlock still renders
//      (it's always shown in public update — user controls the status picker)
//   3. Publish disabled when gate blocks the staged next status
//
// C5.2 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468

import type { PublicUpdateSuccess } from '@/features/voc/hooks/useVocPublicUpdateMutation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

const mutationMock = vi.hoisted(() => ({
  mutate: vi.fn(),
  onSuccess: undefined as ((data: PublicUpdateSuccess) => void) | undefined,
}));

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn((args: { onSuccess?: (data: PublicUpdateSuccess) => void }) => {
    mutationMock.onSuccess = args.onSuccess;
    return {
      mutate: mutationMock.mutate,
      isPending: false,
      isError: false,
      error: null,
    };
  }),
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
import { PublicUpdateComposer } from '../PublicUpdateComposer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: '00000000-0000-0000-0000-000000000111',
  display_id: 'VOC-0001',
  title: '테스트 VOC 제목',
  primary_managed_system_id: '00000000-0000-0000-0000-000000000222',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  similar: { items: [] },
  attachments: [],
  attachment_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

const UPDATED_VOC: VocDetailEnvelope = {
  ...BASE_VOC,
  reporter_facing_status: 'reviewing',
  updated_at: '2026-05-01T00:01:00Z',
  next_reporter_states: { allowed: ['assigned'], forbidden: {} },
};

const PUBLIC_UPDATE_ENVELOPE: PublicUpdateSuccess = {
  public_update: {
    id: '00000000-0000-0000-0000-000000000333',
    voc_id: BASE_VOC.id,
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    },
    reporter_facing_status_before: 'received',
    reporter_facing_status_after: 'reviewing',
    skip_public_update: false,
    skip_reason: null,
    created_at: '2026-05-01T00:01:00Z',
  },
  voc: UPDATED_VOC,
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

describe('<PublicUpdateComposer>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationMock.onSuccess = undefined;
  });

  it('renders ReporterStatusChangeBlock for body+status path (status change)', () => {
    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: makeWrapper() });
    // ReporterStatusChangeBlock should always be visible in the public composer.
    expect(screen.getByTestId('reporter-status-change-block')).toBeInTheDocument();
  });

  it('renders ReporterStatusChangeBlock for body-only path (status unchanged)', () => {
    // VOC with no allowed transitions — status picker stays at current value.
    const vocNoTransitions = {
      ...BASE_VOC,
      next_reporter_states: { allowed: [], forbidden: {} },
    } as unknown as VocDetailEnvelope;

    render(<PublicUpdateComposer voc={vocNoTransitions} me={ME_ADMIN} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTestId('reporter-status-change-block')).toBeInTheDocument();
  });

  it('disables Publish when reporter_status_gate.blocking_for includes nextStatus', () => {
    const vocGated = {
      ...BASE_VOC,
      reporter_status_gate: {
        blocking_for: ['received'], // blocks the current/default status
        reason: 'Task is still in review',
      },
    } as unknown as VocDetailEnvelope;

    render(<PublicUpdateComposer voc={vocGated} me={ME_ADMIN} />, { wrapper: makeWrapper() });

    // The Publish button must be disabled when gate blocks the staged next status.
    const publishBtn = screen.getByRole('button', { name: /publish update/i });
    expect(publishBtn).toBeDisabled();
  });

  it('disables Publish for a whitespace-only draft without calling the mutation', () => {
    render(
      <PublicUpdateComposer
        voc={BASE_VOC}
        me={ME_ADMIN}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('public-update-composer')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: /^publish update$/i });
    expect(publish).toBeDisabled();
    publish.click();
    expect(mutationMock.mutate).not.toHaveBeenCalled();
  });

  it('enables Publish for a text draft', () => {
    render(
      <PublicUpdateComposer
        voc={BASE_VOC}
        me={ME_ADMIN}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'update' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('public-update-composer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^publish update$/i })).not.toBeDisabled();
  });

  it('keeps the response status through the delayed detail refetch after publishing', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let resolveDetailRefetch: (voc: VocDetailEnvelope) => void = vi.fn();
    const delayedDetailRefetch = vi.fn(
      () =>
        new Promise<VocDetailEnvelope>((resolve) => {
          resolveDetailRefetch = resolve;
        }),
    );

    function CachedComposer() {
      const { data: voc } = useQuery({
        queryKey: ['voc', BASE_VOC.id],
        queryFn: delayedDetailRefetch,
        initialData: BASE_VOC,
        staleTime: Number.POSITIVE_INFINITY,
      });
      return <PublicUpdateComposer voc={voc} me={ME_ADMIN} />;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <CachedComposer />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('combobox', { name: '다음 reporter-facing status 선택' }), {
      target: { value: 'reviewing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^publish update$/i }));

    expect(mutationMock.mutate).toHaveBeenCalledTimes(1);
    await React.act(async () => {
      mutationMock.onSuccess?.(PUBLIC_UPDATE_ENVELOPE);
    });

    await waitFor(() => {
      expect(delayedDetailRefetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('combobox', { name: '다음 reporter-facing status 선택' }),
      ).toHaveValue('reviewing');
      // The "(현재)" marker tracks the response VOC, and that option is the one
      // selected — i.e. nextStatus was resynced from data.voc, not the stale prop.
      const currentOption = screen.getByRole('option', {
        name: '검토 중 (현재)',
      }) as HTMLOptionElement;
      expect(currentOption.value).toBe('reviewing');
      expect(currentOption.selected).toBe(true);
      expect(screen.getByText('Reporter-facing status는 그대로 유지됩니다.')).toBeInTheDocument();
    });
    expect(queryClient.getQueryData(['voc', BASE_VOC.id])).toEqual(UPDATED_VOC);

    await React.act(async () => {
      resolveDetailRefetch(UPDATED_VOC);
    });
  });
});
