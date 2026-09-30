import { routeTree } from '@/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveyReadGate,
  useSurveyManageGate,
  useSurveys,
  useOutcomeFollowUp,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useSurveys: vi.fn(),
  useOutcomeFollowUp: vi.fn(() => ({
    data: undefined as unknown,
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveys,
}));
vi.mock('@/features/surveys/hooks/useOutcomeFollowUp', () => ({ useOutcomeFollowUp }));
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/surveys/${surveyId}`] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe('/surveys/:surveyId/results route', () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    useOutcomeFollowUp.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

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
        response_state: 'visible',
        anonymity_threshold: 5,
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

  it('shows the holder follow-up callout and route link when needed', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: {
        survey_id: surveyId,
        status: 'closed',
        identity_protected: false,
        response_state: 'visible',
        anonymity_threshold: 5,
        questions: [],
        next_actions: [],
      },
      isLoading: false,
      isError: false,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: true,
        items: [],
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const callout = await screen.findByTestId('outcome-follow-up-callout');
    expect(callout).toHaveTextContent('후속 조치가 필요한 저조한 응답이 있습니다');
    expect(within(callout).getByRole('link', { name: 'Follow-up 검토' })).toHaveAttribute(
      'href',
      `/surveys/${surveyId}/follow-up`,
    );
  });

  it('shows no counts or link in the non-holder callout and hides the Follow-up tab', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: {
        survey_id: surveyId,
        status: 'closed',
        identity_protected: false,
        response_state: 'visible',
        anonymity_threshold: 5,
        questions: [],
        next_actions: [],
      },
      isLoading: false,
      isError: false,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: false,
        items: null,
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const callout = await screen.findByTestId('outcome-follow-up-callout');
    expect(callout).toHaveTextContent('개인 응답 열람 권한이 있어야 응답별로 검토할 수 있습니다.');
    expect(callout.textContent).not.toMatch(/\d/);
    expect(within(callout).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
  });

  it('hides the callout when follow-up is not needed', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: {
        survey_id: surveyId,
        status: 'closed',
        identity_protected: false,
        response_state: 'visible',
        anonymity_threshold: 5,
        questions: [],
        next_actions: [
          { id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: false,
        personal_access: false,
        items: null,
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    await waitFor(() => expect(screen.getByTestId('survey-results-summary')).toBeInTheDocument());
    expect(screen.queryByTestId('outcome-follow-up-callout')).not.toBeInTheDocument();
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
        response_state: 'visible',
        anonymity_threshold: 5,
        questions: [],
        next_actions: [],
      },
      isLoading: false,
      isError: false,
    });

    const router = renderSurveyRoute();

    await waitFor(() => expect(screen.getByTestId('survey-list')).toBeInTheDocument(), {
      timeout: 5000,
    });
    await act(async () => {
      await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });
    });
    await waitFor(() => expect(screen.getByTestId('survey-results-summary')).toBeInTheDocument(), {
      timeout: 5000,
    });
    await act(async () => {
      await router.navigate({ to: '/surveys/$surveyId', params: { surveyId } });
    });
    await waitFor(() => expect(screen.getByTestId('survey-list')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
  });
});
