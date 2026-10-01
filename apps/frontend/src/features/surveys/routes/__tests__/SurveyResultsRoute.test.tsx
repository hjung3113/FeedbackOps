import { ApiError } from '@/lib/api/types';
import { routeTree } from '@/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('renders the result header in the WorkbenchShell toolbar at 50px', async () => {
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

    const header = await screen.findByTestId('survey-result-header');
    expect(header).toHaveClass('h-toolbar');
    expect(header).toHaveAttribute('data-shell-header', 'toolbar');
    expect(header.closest('[data-shell="workbench"]')).toBeInTheDocument();
    expect(screen.getByTestId('survey-results-summary')).toBeInTheDocument();
  });

  it('keeps the results body in a bounded vertical scroll region below the header', async () => {
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

    const summary = await screen.findByTestId('survey-results-summary');
    expect(summary).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(screen.getByTestId('survey-result-header')).toHaveClass('h-toolbar');
  });

  it('keeps the original inset around the denied results state', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: false, gateState: 'error' });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const deniedHeading = await screen.findByText('Survey Result');
    expect(deniedHeading.closest('.p-6')).toBeInTheDocument();
  });

  it('shows a retryable results read error and refetches results instead of the survey', async () => {
    const surveyRefetch = vi.fn();
    const resultsRefetch = vi.fn();
    useSurvey.mockReturnValue({
      data: survey,
      isLoading: false,
      isError: false,
      refetch: surveyRefetch,
    });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      refetch: resultsRefetch,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const title = await screen.findByText('결과를 불러오지 못했습니다.');
    const liveRegion = title.closest('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(screen.queryByText('설문 결과를 찾을 수 없습니다.')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(liveRegion).toContainElement(retry);
    fireEvent.click(retry);
    expect(resultsRefetch).toHaveBeenCalledTimes(1);
    expect(surveyRefetch).not.toHaveBeenCalled();
  });

  it('keeps not-found copy for a real missing results response', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      refetch: vi.fn(),
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByText('설문 결과를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('keeps permission denied distinct from a failed results read', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      refetch: vi.fn(),
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const deniedHeading = await screen.findByText('Survey Result');
    expect(deniedHeading.closest('[aria-live="polite"]')).toBeInTheDocument();
    expect(screen.queryByText('설문 결과를 찾을 수 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('shows a retryable Korean read error instead of not-found when survey loading fails', async () => {
    const refetch = vi.fn();
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('temporary failure'),
      refetch,
    });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: false, gateState: 'error' });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const error = await screen.findByText('설문을 불러오지 못했습니다.');
    expect(error.closest('[aria-live="polite"]')).toBeInTheDocument();
    expect(screen.queryByText('설문을 찾을 수 없습니다.')).not.toBeInTheDocument();
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    retry.click();
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the not-found copy for a real missing survey', async () => {
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      refetch: vi.fn(),
    });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByText('설문을 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('keeps permission denied distinct from a failed survey read', async () => {
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      refetch: vi.fn(),
    });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: false, gateState: 'error' });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByText('설문을 찾을 수 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
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
