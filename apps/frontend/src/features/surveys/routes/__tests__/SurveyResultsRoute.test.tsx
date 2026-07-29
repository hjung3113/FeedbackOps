import { routeTree } from '@/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveyReadGate,
  useSurveyManageGate,
  useSurveys,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useSurveys: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveys,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate,
  useSurveyReadGate,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchMe: vi.fn().mockResolvedValue({}),
}));

const surveyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const survey = {
  id: surveyId,
  display_id: 'SRV-21',
  title: 'Results',
  type: 'outcome' as const,
  status: 'closed' as const,
  description: null,
  primary_managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function renderSurveyRoute() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/surveys/${surveyId}`] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe('/surveys/:surveyId/results route', () => {
  afterEach(() => vi.clearAllMocks());

  function mockParentRoute() {
    useSurveyManageGate.mockReturnValue({ canManage: false, gateState: 'absent' });
    useSurveys.mockReturnValue({ data: [survey], isLoading: false, error: null });
  }

  it.each(['loading', 'error', 'absent'] as const)(
    'fails closed and does not render result content when the read gate is %s',
    async (gateState) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      mockParentRoute();
      useSurveyReadGate.mockReturnValue({ canRead: false, gateState });
      useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

      const router = renderSurveyRoute();
      await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

      await waitFor(() => {
        expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
      });
      if (gateState !== 'loading') expect(screen.getByText('Survey Result')).toBeInTheDocument();
    },
  );

  it('renders the results route through the nested router composition', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: {
        survey_id: surveyId,
        status: 'closed',
        identity_protected: false,
        questions: [],
        next_actions: [],
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    await waitFor(() => expect(screen.getByTestId('survey-results-summary')).toBeInTheDocument());
  });

  it('renders not-found state when results cannot be loaded', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    await waitFor(() =>
      expect(screen.getByText('설문 결과를 찾을 수 없습니다.')).toBeInTheDocument(),
    );
  });

  it('preserves a stable parent hook order when navigating to results and back', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: {
        survey_id: surveyId,
        status: 'closed',
        identity_protected: false,
        questions: [],
        next_actions: [],
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();

    await waitFor(() => expect(screen.getByTestId('survey-list')).toBeInTheDocument());
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });
    await waitFor(() => expect(screen.getByTestId('survey-results-summary')).toBeInTheDocument());
    await router.navigate({ to: '/surveys/$surveyId', params: { surveyId } });
    await waitFor(() => expect(screen.getByTestId('survey-list')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
  });
});
