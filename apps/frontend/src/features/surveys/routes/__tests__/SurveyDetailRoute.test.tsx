import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetailPanelSlotContext } from '@fops/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Survey } from '../../types';

const {
  useCloseSurvey,
  useManagedSystemNamesResult,
  useOpenSurvey,
  useSurvey,
  useSurveys,
  useSurveyManageGate,
  useWorkspaceActors,
  useRouteSearch,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useManagedSystemNamesResult: vi.fn(() => ({
    namesById: new Map<string, string>(),
    isSuccess: true,
  })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveys: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useWorkspaceActors: vi.fn(() => ({
    actors: [] as Array<{
      id: string;
      display_name: string;
      email: string;
      role_level: 'user';
    }>,
    isSuccess: true,
  })),
  useRouteSearch: vi.fn(() => ({})),
}));

vi.mock('@/features/surveys/hooks/useSurveys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/surveys/hooks/useSurveys')>()),
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveys,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate,
}));
vi.mock('@/lib/cross-system/useManagedSystemNames', () => ({ useManagedSystemNamesResult }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => () => ({
    useParams: () => ({ surveyId: 'survey-1' }),
    useSearch: useRouteSearch,
  }),
  useMatchRoute: () => () => false,
  useNavigate: () => vi.fn(),
}));

import { SurveyDetailRoute } from '@/routes/_authed/surveys/$surveyId';

function DetailPanelHost({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = React.useState<React.ReactNode>();
  const setContent = React.useCallback(
    (_key: string, node: React.ReactNode) => setPanel(node),
    [],
  );
  const clear = React.useCallback((_key: string) => setPanel(undefined), []);
  const context = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);

  return (
    <DetailPanelSlotContext.Provider value={context}>
      {children}
      {panel}
    </DetailPanelSlotContext.Provider>
  );
}

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: null,
  primary_managed_system_id: 'system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

describe('/surveys/:surveyId route', () => {
  it('renders the detail screen when the survey exists', () => {
    useSurvey.mockReturnValue({
      data: survey,
      isLoading: false,
      isError: false,
    });
    useSurveyManageGate.mockReturnValue({
      canManage: false,
      gateState: 'absent',
    });
    useSurveys.mockReturnValue({
      data: [survey],
      isLoading: false,
      error: null,
    });

    render(<SurveyDetailRoute />);

    expect(screen.getByTestId('survey-list')).toBeInTheDocument();
    expect(screen.getByText('Q3 사용성 진단')).toBeInTheDocument();
  });

  it('wires successful lookups into the survey detail and builder routes', () => {
    const systemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const actorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const namedSurvey = {
      ...survey,
      primary_managed_system_id: systemId,
      operator_actor_id: actorId,
    };
    useSurvey.mockReturnValue({ data: namedSurvey, isLoading: false, isError: false });
    useSurveyManageGate.mockReturnValue({ canManage: false, gateState: 'absent' });
    useSurveys.mockReturnValue({ data: [namedSurvey], isLoading: false, error: null });
    useManagedSystemNamesResult.mockReturnValue({
      namesById: new Map([[systemId, 'Revenue Analytics']]),
      isSuccess: true,
    });
    useWorkspaceActors.mockReturnValue({
      actors: [
        {
          id: actorId,
          display_name: 'Named Operator',
          email: 'operator@example.com',
          role_level: 'user',
        },
      ],
      isSuccess: true,
    });

    const detailView = render(
      <DetailPanelHost>
        <SurveyDetailRoute />
      </DetailPanelHost>,
    );
    expect(screen.getByTestId('survey-detail')).toHaveTextContent('Revenue Analytics');
    expect(screen.getByText('담당자 · Named Operator')).toBeInTheDocument();
    detailView.unmount();

    useRouteSearch.mockReturnValueOnce({ builder: true });
    useSurveyManageGate.mockReturnValue({ canManage: true, gateState: undefined });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SurveyDetailRoute />
      </QueryClientProvider>,
    );
    const settings = screen.getByText('Survey settings').closest('aside');
    if (!settings) throw new Error('Expected the builder Survey settings rail');
    expect(within(settings).getByText('Revenue Analytics')).toBeInTheDocument();
  });

  it('renders not-found when the survey is unavailable', () => {
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    useSurveyManageGate.mockReturnValue({
      canManage: false,
      gateState: 'absent',
    });
    useSurveys.mockReturnValue({ data: [], isLoading: false, error: null });

    render(<SurveyDetailRoute />);

    expect(screen.getByText('설문을 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('retries the survey list from the detail route error state', async () => {
    const refetch = vi.fn();
    useSurvey.mockReturnValue({
      data: survey,
      isLoading: false,
      isError: false,
    });
    useSurveyManageGate.mockReturnValue({
      canManage: false,
      gateState: 'absent',
    });
    useSurveys.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('list request failed'),
      refetch,
    });

    render(<SurveyDetailRoute />);

    expect(await screen.findByText('설문 목록을 불러오지 못했습니다')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
