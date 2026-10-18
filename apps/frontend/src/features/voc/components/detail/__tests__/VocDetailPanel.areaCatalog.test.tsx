import { useTaskRequestConversion } from '@/features/tasks/routes/task-requests/useTaskRequestConversion';
import type { AnalyticsAreaDto } from '@/lib/api/analytics-areas';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAnalyticsAreas } = vi.hoisted(() => ({ fetchAnalyticsAreas: vi.fn() }));

vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: vi.fn() }));
vi.mock('@/lib/cross-system/useManagedSystem', () => ({ useManagedSystem: vi.fn() }));
vi.mock('@/features/voc/hooks/useVocConversation', () => ({ useVocConversation: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/vocs', href: '/vocs?view=inbox' }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient: vi.fn(async () => ({ data: { items: [] } })),
  fetchTaskRequests: vi.fn(async () => ({ items: [] })),
  getTask: vi.fn(),
}));
vi.mock('@/lib/api/analytics-areas', () => ({ fetchAnalyticsAreas }));
vi.mock('@/lib/api/milestones', () => ({ listMilestones: vi.fn(async () => ({ items: [] })) }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@/lib/cross-system/usePermissionCheck', () => ({ usePermissionCheck: vi.fn() }));
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  RichContentRenderer: () => <div data-testid="rce" />,
}));

import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { useMe } from '@/lib/auth/useMe';
import { useManagedSystem } from '@/lib/cross-system/useManagedSystem';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { VocDetailPanel } from '../VocDetailPanel';
import {
  DETAIL_ENVELOPE,
  ME_RESPONSE,
  OTHER_ACTOR_ID,
  makeConversationQuery,
  makeDetailQuery,
  makeMeQuery,
} from './_fixtures';

const MS_ID = DETAIL_ENVELOPE.primary_managed_system_id;

function area(id: string, name: string, archived: boolean): AnalyticsAreaDto {
  return {
    id,
    workspace_id: 'ws-1111',
    managed_system_id: MS_ID,
    slug: id,
    name,
    owner_team_id: null,
    archived_at: archived ? '2026-01-01T00:00:00.000Z' : null,
    archived_by_actor_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };
}

const AREAS = [area('area-active', 'Active Area', false), area('area-old', 'Archived Area', true)];

const TASK_REQUEST = {
  id: '10000000-0000-0000-0000-000000000001',
  primary_managed_system_id: MS_ID,
  requested_outcome: '쿼리 플랜 개선 필요',
  status: 'approved',
} as unknown as TaskRequestDto;

beforeEach(() => {
  fetchAnalyticsAreas.mockReset();
  // The server omits archived rows unless include_archived is set.
  fetchAnalyticsAreas.mockImplementation(
    async ({ includeArchived }: { includeArchived?: boolean }) => {
      const items = AREAS.filter((item) => includeArchived || item.archived_at === null);
      return { items, total: items.length };
    },
  );
  vi.mocked(useManagedSystem).mockReturnValue(null);
  vi.mocked(useVocConversation).mockReturnValue(makeConversationQuery());
  vi.mocked(useWorkspaceActors).mockReturnValue({ actors: [] } as unknown as ReturnType<
    typeof useWorkspaceActors
  >);
  vi.mocked(useMe).mockReturnValue(
    makeMeQuery({
      data: {
        ...ME_RESPONSE,
        actor: { ...ME_RESPONSE.actor, id: OTHER_ACTOR_ID, role_level: 'Admin' },
      },
    }),
  );
  vi.mocked(usePermissionCheck).mockImplementation(
    () => ({ data: { state: 'approved' } }) as unknown as ReturnType<typeof usePermissionCheck>,
  );
  vi.mocked(useVocDetail).mockReturnValue(
    makeDetailQuery({ data: { ...DETAIL_ENVELOPE, analytics_area_id: 'area-old' } }),
  );
});

describe('Analytics Area catalog shared across surfaces', () => {
  it('shows an archived Area name in VOC detail after Task Request conversion read the same scope', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const conversion = renderHook(
      () => useTaskRequestConversion({ item: TASK_REQUEST, currentRole: 'admin' }),
      { wrapper },
    );
    await act(async () => {
      conversion.result.current.setOpen(true);
    });
    await vi.waitFor(() =>
      expect(conversion.result.current.analyticsAreas?.map((item) => item.name)).toEqual([
        'Active Area',
      ]),
    );

    render(<VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByText('Archived Area')).toBeInTheDocument();
  });
});
