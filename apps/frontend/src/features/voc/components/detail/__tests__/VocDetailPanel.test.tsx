import type { TaskDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({ useWorkspaceActors: vi.fn() }));
vi.mock('@/features/voc/hooks/usePermissionDecision', () => ({ usePermissionDecision: vi.fn() }));
vi.mock('@/features/voc/hooks/useManagedSystem', () => ({ useManagedSystem: vi.fn() }));
vi.mock('@/features/voc/hooks/useVocConversation', () => ({ useVocConversation: vi.fn() }));
const navigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getTask: vi.fn() };
});
vi.mock('@/lib/api/analytics-areas', () => ({ fetchAnalyticsAreas: vi.fn() }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichContentRenderer: () => <div data-testid="rce" />,
  };
});
vi.mock('@/features/voc/components/list/VocRow', () => ({
  formatVocCreatedAt: () => '방금 전',
}));

// EditDescriptionModal uses QueryClient + mutation hooks — stub to isolate VocDetailPanel tests
vi.mock('@/features/voc/components/detail/EditDescriptionModal', () => ({
  EditDescriptionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-description-modal" /> : null,
}));

// PublicUpdateComposer uses QueryClient — stub to isolate VocDetailPanel tests (C5.2)
vi.mock('@/features/voc/components/detail/PublicUpdateComposer', () => ({
  PublicUpdateComposer: () => <div data-testid="public-update-composer-stub" />,
}));

// ComposerSection stub that can report dirty state via onDirtyChange callback.
// REV-1 #6: VocDetailPanel must intercept close when a composer draft is dirty.
vi.mock('@/features/voc/components/detail/ComposerSection', () => ({
  ComposerSection: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div data-testid="composer-section-stub">
      <button
        type="button"
        data-testid="composer-dirty-trigger"
        onClick={() => onDirtyChange?.(true)}
      >
        make dirty
      </button>
    </div>
  ),
}));

import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import { getTask } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { useMe } from '@/lib/auth/useMe';
import { VocDetailPanel } from '../VocDetailPanel';
import {
  DETAIL_ENVELOPE,
  ME_RESPONSE,
  OTHER_ACTOR_ID,
  makeConversationQuery,
  makeDetailQuery,
  makeMeQuery,
} from './_fixtures';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithClient(ui: React.ReactElement, queryClient = createQueryClient()) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  navigate.mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(useManagedSystem).mockReturnValue(null);
  vi.mocked(usePermissionDecision).mockReturnValue(null);
  vi.mocked(useVocConversation).mockReturnValue(makeConversationQuery());
  vi.mocked(useWorkspaceActors).mockReturnValue({
    actors: [
      {
        id: DETAIL_ENVELOPE.reporter_id,
        display_name: ME_RESPONSE.actor.display_name,
        kind: 'user',
      },
      { id: '00000000-0000-0000-0000-000000000002', display_name: '박운영', kind: 'user' },
    ],
  } as ReturnType<typeof useWorkspaceActors>);
  vi.mocked(fetchAnalyticsAreas).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(useMe).mockReturnValue(makeMeQuery());
});

describe('<VocDetailPanel>', () => {
  const allowedTaskLink = {
    id: '11111111-1111-4111-8111-111111111179',
    source_type: 'voc' as const,
    source_id: DETAIL_ENVELOPE.id,
    target_type: 'task' as const,
    target_id: '33333333-3333-4333-8333-333333333179',
    relation_type: 'evidence_of' as const,
    visibility: 'internal_only' as const,
    status: 'active' as const,
    managed_system_id: DETAIL_ENVELOPE.primary_managed_system_id,
    created_by: OTHER_ACTOR_ID,
    created_at: '2026-07-18T09:00:00.000Z',
    updated_at: null,
    visibility_state: 'allowed' as const,
    target_summary: {
      type: 'task' as const,
      id: '33333333-3333-4333-8333-333333333179',
      display_id: 'TASK-SECRET',
      title: '내부 Task 제목',
      status: 'in_progress',
      priority: 'critical',
      primary_managed_system_id: DETAIL_ENVELOPE.primary_managed_system_id,
      assignee_actor_id: OTHER_ACTOR_ID,
      due_date: null,
    },
  };
  const cachedTask: TaskDetailDto = {
    id: allowedTaskLink.target_id,
    workspace_id: '11111111-1111-4111-8111-111111111111',
    display_id: 'TASK-CACHED-SECRET',
    primary_managed_system_id: DETAIL_ENVELOPE.primary_managed_system_id,
    title: '캐시된 내부 Task 제목',
    status: 'done',
    priority: 'urgent',
    assignee_actor_id: OTHER_ACTOR_ID,
    due_date: '2026-07-31',
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: OTHER_ACTOR_ID,
    created_at: '2026-07-18T09:00:00.000Z',
    updated_at: '2026-07-18T09:00:00.000Z',
    source: null,
  };

  it('fails closed while /me is unresolved: no Task fetch or allowed Task fields', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, links: [allowedTaskLink] } }),
    );
    vi.mocked(useMe).mockReturnValue(
      makeMeQuery({
        data: undefined,
        isLoading: true,
        isPending: true,
        isSuccess: false,
        status: 'pending',
      }),
    );

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />);

    expect(screen.queryByText('내부 Task 제목')).not.toBeInTheDocument();
    expect(screen.queryByText('TASK-SECRET')).not.toBeInTheDocument();
    expect(getTask).not.toHaveBeenCalled();
  });

  it('fails closed for a non-owner User: no Task fetch or allowed Task fields', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, links: [allowedTaskLink] } }),
    );
    vi.mocked(useMe).mockReturnValue(
      makeMeQuery({
        data: {
          ...ME_RESPONSE,
          actor: { ...ME_RESPONSE.actor, id: OTHER_ACTOR_ID, role_level: 'user' },
        },
      }),
    );

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />);

    expect(screen.queryByText('내부 Task 제목')).not.toBeInTheDocument();
    expect(screen.queryByText('TASK-SECRET')).not.toBeInTheDocument();
    expect(getTask).not.toHaveBeenCalled();
  });

  it('does not consume a cached Task while /me is unresolved', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, links: [allowedTaskLink] } }),
    );
    vi.mocked(useMe).mockReturnValue(
      makeMeQuery({
        data: undefined,
        isLoading: true,
        isPending: true,
        isSuccess: false,
        status: 'pending',
      }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(['task', allowedTaskLink.target_id], cachedTask);

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />, queryClient);

    expect(screen.queryByText('캐시된 내부 Task 제목')).not.toBeInTheDocument();
    expect(screen.queryByText('done')).not.toBeInTheDocument();
    expect(getTask).not.toHaveBeenCalled();
  });

  it('does not consume a cached Task for a User actor', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, links: [allowedTaskLink] } }),
    );
    vi.mocked(useMe).mockReturnValue(
      makeMeQuery({
        data: {
          ...ME_RESPONSE,
          actor: { ...ME_RESPONSE.actor, id: OTHER_ACTOR_ID, role_level: 'user' },
        },
      }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(['task', allowedTaskLink.target_id], cachedTask);

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />, queryClient);

    expect(screen.queryByText('캐시된 내부 Task 제목')).not.toBeInTheDocument();
    expect(screen.queryByText('done')).not.toBeInTheDocument();
    expect(getTask).not.toHaveBeenCalled();
  });

  it('renders a cached Task for an operator actor', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, links: [allowedTaskLink] } }),
    );
    vi.mocked(useMe).mockReturnValue(
      makeMeQuery({
        data: { ...ME_RESPONSE, actor: { ...ME_RESPONSE.actor, role_level: 'admin' } },
      }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(['task', allowedTaskLink.target_id], cachedTask);

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />, queryClient);

    expect(screen.getByText('캐시된 내부 Task 제목')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(getTask).not.toHaveBeenCalled();
  });

  it('happy path: renders the detail panel with title', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('테스트 VOC 제목')).toBeInTheDocument();
  });

  it('closes a mounted detail when the Managed System scope changes outside its envelope', async () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    const { rerender } = renderWithClient(
      <VocDetailPanel
        vocId={DETAIL_ENVELOPE.id}
        managedSystemId={DETAIL_ENVELOPE.primary_managed_system_id}
        onClose={onClose}
      />,
    );

    await screen.findByText('테스트 VOC 제목');
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <VocDetailPanel
          vocId={DETAIL_ENVELOPE.id}
          managedSystemId="another-managed-system"
          onClose={onClose}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByText('테스트 VOC 제목')).not.toBeInTheDocument();
    expect(screen.queryByText('VOC를 찾을 수 없습니다.')).not.toBeInTheDocument();
  });

  it('keeps a selected detail open for all Managed Systems', async () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={onClose} />);

    await screen.findByText('테스트 VOC 제목');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close while detail data is loading', async () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isLoading: true,
        isPending: true,
        isSuccess: false,
        status: 'pending',
      }),
    );
    const onClose = vi.fn();
    renderWithClient(
      <VocDetailPanel
        vocId={DETAIL_ENVELOPE.id}
        managedSystemId="another-managed-system"
        onClose={onClose}
      />,
    );

    await screen.findByLabelText('VOC 상세 불러오는 중');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a selected detail open when its Managed System scope remains the same', async () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    const { rerender } = renderWithClient(
      <VocDetailPanel
        vocId={DETAIL_ENVELOPE.id}
        managedSystemId={DETAIL_ENVELOPE.primary_managed_system_id}
        onClose={onClose}
      />,
    );

    await screen.findByText('테스트 VOC 제목');
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <VocDetailPanel
          vocId={DETAIL_ENVELOPE.id}
          managedSystemId={DETAIL_ENVELOPE.primary_managed_system_id}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('테스트 VOC 제목')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('loading state: renders skeletons instead of content', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isLoading: true,
        isPending: true,
        isSuccess: false,
        status: 'pending',
        data: undefined,
      }),
    );
    const { container } = renderWithClient(
      <VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText('테스트 VOC 제목')).not.toBeInTheDocument();
  });

  it('404 state: renders DetailPanelNotFound', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isError: true,
        isSuccess: false,
        isLoading: false,
        isPending: false,
        status: 'error',
        error: { code: 'not_found.record' } as unknown as Error,
        data: undefined,
      }),
    );
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('VOC를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('summary envelope: renders PermissionBlockedPanel', () => {
    const summaryData = {
      id: 'voc-uuid-1111',
      display_id: 'VOC-0001',
      primary_managed_system_id: 'ms-1',
      reporter_facing_status: 'received',
      created_at: '2026-05-01T00:00:00Z',
      permission_decisions: { _self: { state: 'denied' } },
    };
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: summaryData as unknown as typeof DETAIL_ENVELOPE }),
    );
    vi.mocked(usePermissionDecision).mockReturnValue({ state: 'denied' });
    vi.mocked(useMe).mockReturnValue(makeMeQuery());

    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    // PermissionBlockedPanel renders; title should NOT be present
    expect(screen.queryByText('테스트 VOC 제목')).not.toBeInTheDocument();
  });

  it('calls onClose when DetailPanelNotFound clear button is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isError: true,
        isSuccess: false,
        isLoading: false,
        isPending: false,
        status: 'error',
        error: { code: 'not_found.record' } as unknown as Error,
        data: undefined,
      }),
    );
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={onClose} />);
    screen.getByRole('button', { name: '선택 해제' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render an empty related-entity section in the happy path', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('트리아지 (Read only)')).toBeInTheDocument();
    // Description section now uses an English 'BODY' label per the
    // reference image (see .review/title-reference.png + relaxed copy rule).
    expect(screen.getByText('BODY')).toBeInTheDocument();
    expect(screen.getByText('연결된 실행')).toBeInTheDocument();
    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.getByText('대화')).toBeInTheDocument();
  });

  it('only renders the Similar section navigation entry and anchor when similar VOCs render', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const { container, rerender } = renderWithClient(
      <VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Similar' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-anchor="similar"]')).toBeNull();

    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        data: {
          ...DETAIL_ENVELOPE,
          similar_count: 1,
          similar: {
            items: [
              {
                id: '00000000-0000-0000-0000-000000000002',
                display_id: 'VOC-0002',
                title: '유사 VOC 제목',
                reporter_facing_status: 'reviewing',
                severity: 'medium',
              },
            ],
          },
        },
      }),
    );
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Similar' })).toBeInTheDocument();
    expect(container.querySelector('[data-anchor="similar"]')).not.toBeNull();
  });

  it('#337: reporter-arm envelope omits Triage, Similar, and their navigation entries', async () => {
    const {
      analytics_area_id: _analyticsAreaId,
      owner_user_id: _ownerUserId,
      owner_team_id: _ownerTeamId,
      similar_count: _similarCount,
      similar: _similar,
      ...reporterArmEnvelope
    } = DETAIL_ENVELOPE;
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery({ data: reporterArmEnvelope }));

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />);

    await screen.findByText('테스트 VOC 제목');
    expect(screen.queryByText('트리아지 (Read only)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('유사 VOC')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Triage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Similar' })).not.toBeInTheDocument();
  });

  it('#337: treats a half-redacted envelope as the reporter arm', async () => {
    // The backend drops the peer fields together, so a partial envelope means a
    // contract has drifted. Fail closed rather than rendering internal triage
    // because one of the two keys happened to survive.
    const { similar_count: _similarCount, ...halfRedacted } = DETAIL_ENVELOPE;
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery({ data: halfRedacted }));

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />);

    await screen.findByText('테스트 VOC 제목');
    expect(screen.queryByText('트리아지 (Read only)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Triage' })).not.toBeInTheDocument();
  });

  it('#337: scoped envelope renders Triage and Similar with their navigation entries', async () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        data: {
          ...DETAIL_ENVELOPE,
          similar_count: 1,
          similar: {
            items: [
              {
                id: '00000000-0000-0000-0000-000000000002',
                display_id: 'VOC-0002',
                title: '유사 VOC 제목',
                reporter_facing_status: 'reviewing',
                severity: 'medium',
              },
            ],
          },
        },
      }),
    );

    renderWithClient(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />);

    await screen.findByText('테스트 VOC 제목');
    expect(screen.getByText('트리아지 (Read only)')).toBeInTheDocument();
    expect(screen.getByLabelText('유사 VOC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Triage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Similar' })).toBeInTheDocument();
  });

  it('renders me.display_name when me matches reporter', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, reporter_id: ME_RESPONSE.actor.id } }),
    );
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getAllByText('김개발').length).toBeGreaterThan(0);
  });

  it('navigates to a selected similar VOC while preserving list search state', () => {
    const peerId = '00000000-0000-0000-0000-000000000002';
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        data: {
          ...DETAIL_ENVELOPE,
          similar_count: 1,
          similar: {
            items: [
              {
                id: peerId,
                display_id: 'VOC-0002',
                title: '유사 VOC 제목',
                reporter_facing_status: 'reviewing',
                severity: 'medium',
              },
            ],
          },
        },
      }),
    );
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /VOC-0002 유사 VOC 제목/i }));

    expect(navigate).toHaveBeenCalledOnce();
    const navigation = navigate.mock.calls[0]?.[0] as {
      to: string;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.to).toBe('/vocs');
    expect(navigation.search({ view: 'inbox', tab: 'similar' })).toEqual({
      view: 'inbox',
      tab: 'similar',
      selected: peerId,
    });
  });

  // REV-1 #6: dirty composer close must show DirtyConfirmation, not call onClose immediately.
  it('#6 dirty composer close: shows DirtyConfirmation before closing panel', async () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    renderWithClient(<VocDetailPanel vocId="voc-uuid-1111" onClose={onClose} />);

    // Mark composer dirty via stub trigger
    fireEvent.click(screen.getByTestId('composer-dirty-trigger'));

    // Click the DetailHeader close button (aria-label "닫기" on the X icon button)
    const closeBtn = screen.getByRole('button', { name: /닫기|패널 닫기|close/i });
    fireEvent.click(closeBtn);

    // DirtyConfirmation should appear; onClose NOT called yet
    await waitFor(() => {
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
