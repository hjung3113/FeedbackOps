import { registerSurveyQueryDefaults, surveyKeys } from '@/features/surveys/hooks/useSurveys';
import { ApiError } from '@/lib/api/types';
import { routeTree } from '@/routeTree.gen';
import type { PermissionBlockedPanelProps } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  permissionPanelProbe,
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveyReadGate,
  useSurveyManageGate,
  useSurveys,
  useOutcomeFollowUp,
} = vi.hoisted(() => ({
  // True from the route body (the useOutcomeFollowUp mock runs before the
  // route's persistence code) until the deepest mocked panel effect resets
  // it — that is, exactly during route render passes but not the route's own
  // effects, which React runs after its children's effects.
  permissionPanelProbe: { routeRenderActive: false },
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useSurveys: vi.fn(),
  useOutcomeFollowUp: vi.fn(
    (): {
      data: unknown;
      isLoading: boolean;
      isError: boolean;
      isSuccess?: boolean;
      error?: unknown;
      dataUpdatedAt?: number;
      errorUpdatedAt?: number;
    } => ({
      data: undefined,
      isLoading: false,
      isError: false,
    }),
  ),
}));

vi.mock('@/features/surveys/hooks/useSurveys', async (importOriginal) => ({
  ...(await importOriginal()),
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
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    PermissionBlockedPanel: (props: PermissionBlockedPanelProps) => ReactNode;
  };
  const OriginalPermissionBlockedPanel = actual.PermissionBlockedPanel;
  return {
    ...actual,
    // Child effects flush before the parent route's effects: once this runs,
    // a marker write is attributable to the route's effect, not its render.
    PermissionBlockedPanel: (props: PermissionBlockedPanelProps) => {
      useEffect(() => {
        permissionPanelProbe.routeRenderActive = false;
      });
      return OriginalPermissionBlockedPanel(props);
    },
  };
});

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
  registerSurveyQueryDefaults(queryClient);
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

  function retainedResults() {
    return {
      survey_id: surveyId,
      status: 'closed',
      identity_protected: true,
      response_state: 'visible',
      anonymity_threshold: 5,
      questions: [
        {
          question_id: 'question-choice',
          visibility: 'visible',
          kind: 'choice',
          answer_count: 12,
          option_buckets: [{ key: 'slow', label: 'Retained distribution', count: 8 }],
        },
        {
          question_id: 'question-text',
          visibility: 'visible',
          kind: 'text',
          answer_count: 6,
          distribution: null,
          excerpts: [{ id: 'excerpt-1', text: 'Retained approved excerpt' }],
        },
      ],
      next_actions: [
        { id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' },
      ],
    };
  }

  function holderFollowUpData() {
    return {
      survey_id: surveyId,
      classifiable: true,
      follow_up_needed: true,
      personal_access: true,
      items: [{ resolution: 'open' }],
    };
  }

  // Transition tests replace the mocked hook results between renders. The
  // memoized router match re-renders only on a real navigation, so each
  // transition walks through the parent route and back; the sticky denial
  // record must live in the shared query client, not in component state.
  function mountResultsRouteForTransition(passedQueryClient?: QueryClient) {
    const queryClient =
      passedQueryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
    registerSurveyQueryDefaults(queryClient);
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
    return {
      queryClient,
      navigateToResults: () =>
        router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } }),
      remountResultsRoute: async () => {
        await router.navigate({ to: '/surveys/$surveyId', params: { surveyId } });
        await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });
      },
    };
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

  it('keeps the result header above the loading results body', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: true,
        items: [{ resolution: 'open' }],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const loading = await screen.findByText('결과를 불러오는 중…');
    const liveRegion = loading.closest('[aria-live="polite"]');
    const header = screen.getByTestId('survey-result-header');
    expect(liveRegion?.firstElementChild).toBe(header);
    expect(within(header).getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(within(header).getByText('SRV-21')).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Surveys /' })).toHaveAttribute(
      'href',
      '/surveys',
    );
    expect(within(header).getByRole('link', { name: 'Follow-up · 1' })).toBeInTheDocument();
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
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: true,
        items: [{ resolution: 'open' }],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    const title = await screen.findByText('결과를 불러오지 못했습니다.');
    const liveRegion = title.closest('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(liveRegion?.firstElementChild).toBe(header);
    expect(within(header).getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(within(header).getByText('SRV-21')).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Surveys /' })).toHaveAttribute(
      'href',
      '/surveys',
    );
    expect(within(header).getByRole('link', { name: 'Follow-up · 1' })).toBeInTheDocument();
    expect(screen.queryByText('설문 결과를 찾을 수 없습니다.')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(liveRegion).toContainElement(retry);
    fireEvent.click(retry);
    expect(resultsRefetch).toHaveBeenCalledTimes(1);
    expect(surveyRefetch).not.toHaveBeenCalled();
  });

  it('shows not-found after Follow-up denial during a retryable results error', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      refetch: vi.fn(),
    });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: true,
        items: [{ resolution: 'open' }],
      },
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(404, { code: 'not_found.record', message: 'not found' }),
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByText('설문 결과를 찾을 수 없습니다.')).toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(within(header).getByText('SRV-21')).toBeInTheDocument();
    expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
    expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
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

  it.each([
    [
      '403 with denied Follow-up read',
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
    ],
    [
      '403 with successful Follow-up read',
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      undefined,
    ],
    [
      'denial-shaped 404 with denied Follow-up read',
      new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      new ApiError(404, { code: 'not_found.record', message: 'not found' }),
    ],
  ] as const)(
    'keeps only the survey identity after a %s results denial with holder data',
    async (_denialType, resultsError, followUpError) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      mockParentRoute();
      useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
      useSurveyResults.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: resultsError,
        refetch: vi.fn(),
      });
      useOutcomeFollowUp.mockReturnValue({
        data: {
          survey_id: surveyId,
          classifiable: true,
          follow_up_needed: true,
          personal_access: true,
          items: [{ resolution: 'open' }],
        },
        isLoading: false,
        isError: followUpError !== undefined,
        isSuccess: followUpError === undefined,
        ...(followUpError === undefined ? {} : { error: followUpError }),
      });

      const router = renderSurveyRoute();
      await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

      if (resultsError.status === 403) {
        expect(await screen.findByText('Survey Result')).toBeInTheDocument();
      } else {
        expect(await screen.findByText('설문 결과를 찾을 수 없습니다.')).toBeInTheDocument();
      }
      const header = screen.getByTestId('survey-result-header');
      expect(within(header).getByRole('heading', { name: 'Results' })).toBeInTheDocument();
      expect(within(header).getByText('SRV-21')).toBeInTheDocument();
      expect(within(header).getByText('결과')).toBeInTheDocument();
      expect(within(header).getByText('종료됨')).toBeInTheDocument();
      expect(within(header).getByRole('link', { name: 'Surveys /' })).toHaveAttribute(
        'href',
        '/surveys',
      );
      expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
      expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
    },
  );

  it.each([
    [
      '403 permission denial',
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      'Survey Result',
    ],
    [
      '404 denial-shaped not-found',
      new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      '설문 결과를 찾을 수 없습니다.',
    ],
  ] as const)(
    'hides retained result and Follow-up data after a Follow-up %s',
    async (_denialType, followUpError, bodyText) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      mockParentRoute();
      useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
      useSurveyResults.mockReturnValue({
        data: retainedResults(),
        isLoading: false,
        isError: false,
        isSuccess: true,
      });
      useOutcomeFollowUp.mockReturnValue({
        data: {
          survey_id: surveyId,
          classifiable: true,
          follow_up_needed: true,
          personal_access: true,
          items: [{ resolution: 'open' }],
        },
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: followUpError,
      });

      const router = renderSurveyRoute();
      await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

      expect(await screen.findByText(bodyText)).toBeInTheDocument();
      const header = screen.getByTestId('survey-result-header');
      expect(within(header).getByRole('heading', { name: 'Results' })).toBeInTheDocument();
      expect(within(header).getByText('SRV-21')).toBeInTheDocument();
      expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
      expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
      expect(screen.queryByText('12 responses')).not.toBeInTheDocument();
      expect(screen.queryByText('Retained distribution')).not.toBeInTheDocument();
      expect(screen.queryByText('Retained approved excerpt')).not.toBeInTheDocument();
      expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Follow-up 검토' })).not.toBeInTheDocument();
    },
  );

  it('keeps successful results visible after a Follow-up 500 without Follow-up UI', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: {
        survey_id: surveyId,
        classifiable: true,
        follow_up_needed: true,
        personal_access: true,
        items: [{ resolution: 'open' }],
      },
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    });

    const router = renderSurveyRoute();
    await router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByTestId('survey-results-summary')).toBeInTheDocument();
    expect(screen.getByText('12 responses')).toBeInTheDocument();
    expect(screen.getByText('Retained distribution')).toBeInTheDocument();
    expect(screen.getByText('Retained approved excerpt')).toBeInTheDocument();
    expect(screen.getByTestId('survey-result-next-actions')).toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
    expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-follow-up-callout')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Follow-up 검토' })).not.toBeInTheDocument();
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
      isSuccess: true,
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
      isSuccess: true,
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
      isSuccess: true,
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

  it.each([
    [
      '403 permission denial',
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      'Survey Result',
    ],
    [
      '404 denial-shaped not-found',
      new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      '설문 결과를 찾을 수 없습니다.',
    ],
  ] as const)(
    'keeps the %s body when a later Follow-up refetch fails with 500 while results hold pre-denial data',
    async (_denialType, denialError, bodyText) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      mockParentRoute();
      useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
      useSurveyResults.mockReturnValue({
        data: retainedResults(),
        isLoading: false,
        isError: false,
        isSuccess: true,
        dataUpdatedAt: 1000,
      });
      useOutcomeFollowUp.mockReturnValue({
        data: holderFollowUpData(),
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: denialError,
        errorUpdatedAt: 2000,
      });

      const { navigateToResults, remountResultsRoute } = mountResultsRouteForTransition();
      await navigateToResults();

      expect(await screen.findByText(bodyText)).toBeInTheDocument();
      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();

      useOutcomeFollowUp.mockReturnValue({
        data: holderFollowUpData(),
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
        errorUpdatedAt: 3000,
      });
      await remountResultsRoute();

      expect(await screen.findByText(bodyText)).toBeInTheDocument();
      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
      expect(screen.queryByText('12 responses')).not.toBeInTheDocument();
      expect(screen.queryByText('Retained distribution')).not.toBeInTheDocument();
      expect(screen.queryByText('Retained approved excerpt')).not.toBeInTheDocument();
      expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
      const header = screen.getByTestId('survey-result-header');
      expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
      expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
    },
  );

  it.each([
    [
      '403 permission denial',
      new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      'Survey Result',
    ],
    [
      '404 denial-shaped not-found',
      new ApiError(404, { code: 'not_found.record', message: 'not found' }),
      '설문 결과를 찾을 수 없습니다.',
    ],
  ] as const)(
    'keeps the %s body when a later results refetch fails with 500 while Follow-up holds pre-denial data',
    async (_denialType, denialError, bodyText) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      mockParentRoute();
      useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
      useSurveyResults.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: denialError,
        errorUpdatedAt: 2000,
      });
      useOutcomeFollowUp.mockReturnValue({
        data: holderFollowUpData(),
        isLoading: false,
        isError: false,
        isSuccess: true,
        dataUpdatedAt: 1000,
      });

      const { navigateToResults, remountResultsRoute } = mountResultsRouteForTransition();
      await navigateToResults();

      expect(await screen.findByText(bodyText)).toBeInTheDocument();

      useSurveyResults.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
        errorUpdatedAt: 3000,
      });
      await remountResultsRoute();

      expect(await screen.findByText(bodyText)).toBeInTheDocument();
      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
      const header = screen.getByTestId('survey-result-header');
      expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
      expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
    },
  );

  it('renders the summary again only after results and Follow-up successes settle after a Follow-up denial', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    });

    const { navigateToResults, remountResultsRoute } = mountResultsRouteForTransition();
    await navigateToResults();

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();

    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 3000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      errorUpdatedAt: 3000,
    });
    await remountResultsRoute();

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();

    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 3000,
    });
    await remountResultsRoute();

    expect(await screen.findByTestId('survey-results-summary')).toBeInTheDocument();
    expect(screen.getByText('12 responses')).toBeInTheDocument();
  });

  it('keeps a Follow-up denial sticky across a route remount on the same query client', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function mountRoute() {
      const router = createRouter({
        routeTree,
        context: { queryClient },
        history: createMemoryHistory({ initialEntries: [`/surveys/${surveyId}`] }),
      });
      const view = render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      return { router, unmount: view.unmount };
    }

    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    });

    const first = mountRoute();
    await first.router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });
    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    first.unmount();

    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 3000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      errorUpdatedAt: 3000,
    });

    const second = mountRoute();
    await second.router.navigate({ to: '/surveys/$surveyId/results', params: { surveyId } });

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
    second.unmount();
  });

  it('records a Follow-up denial observed while survey metadata is in an ordinary error', async () => {
    useSurvey.mockReturnValue({
      data: survey,
      isLoading: false,
      isError: true,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'metadata failed' }),
      refetch: vi.fn(),
    });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: false,
      isSuccess: true,
    });

    const { queryClient, navigateToResults, remountResultsRoute } =
      mountResultsRouteForTransition();
    await navigateToResults();

    // The metadata ordinary error owns the body and nothing is recorded yet.
    expect(await screen.findByText('설문을 불러오지 못했습니다.')).toBeInTheDocument();
    const denialKey = surveyKeys.resultsReadDenial(surveyId);
    expect(queryClient.getQueryData(denialKey)).toBeUndefined();

    // The Follow-up denial arrives while the metadata is still in error.
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    });
    await remountResultsRoute();
    expect(await screen.findByText('설문을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(queryClient.getQueryData(denialKey)).toMatchObject({ at: 2000, blocked: true });

    // An ordinary error replaces the denial error while metadata stays broken.
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      errorUpdatedAt: 3000,
    });
    await remountResultsRoute();
    expect(await screen.findByText('설문을 불러오지 못했습니다.')).toBeInTheDocument();

    // Metadata recovers: the recorded denial still blocks, with no R/H/C.
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false, refetch: vi.fn() });
    await remountResultsRoute();

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('12 responses')).not.toBeInTheDocument();
    expect(screen.queryByText('Retained distribution')).not.toBeInTheDocument();
    expect(screen.queryByText('Retained approved excerpt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-follow-up-callout')).not.toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
    expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
  });

  it('keeps the denial marker past the default garbage-collection window', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    });

    // A shortened default gcTime stands in for the five-minute production
    // default; only the denial family is exempted via the registered defaults.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 50 } },
    });
    registerSurveyQueryDefaults(queryClient);
    const { navigateToResults, remountResultsRoute } = mountResultsRouteForTransition(queryClient);

    await navigateToResults();
    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    const denialKey = surveyKeys.resultsReadDenial(surveyId);
    expect(queryClient.getQueryData(denialKey)).toMatchObject({ at: 2000, blocked: true });

    // `Promise.withResolvers` needs the es2024 lib, which this repo's
    // tsconfig does not enable; the executor form stays until it does.
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    expect(queryClient.getQueryData(denialKey)).toMatchObject({ at: 2000, blocked: true });

    // The denial error is replaced by an ordinary error after the window.
    useOutcomeFollowUp.mockReturnValue({
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      errorUpdatedAt: 3000,
    });
    await remountResultsRoute();

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('12 responses')).not.toBeInTheDocument();
    expect(screen.queryByText('Retained distribution')).not.toBeInTheDocument();
    expect(screen.queryByText('Retained approved excerpt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-follow-up-callout')).not.toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
    expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
  });

  it('hides retained data on the first denial frame before the marker is persisted', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    const followUpDenied = {
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    };
    useOutcomeFollowUp.mockImplementation(() => {
      // The route calls this hook before its persistence code, so the probe
      // covers the rest of this render pass.
      permissionPanelProbe.routeRenderActive = true;
      return followUpDenied;
    });

    const { queryClient, navigateToResults } = mountResultsRouteForTransition();
    const denialKey = surveyKeys.resultsReadDenial(surveyId);
    expect(queryClient.getQueryData(denialKey)).toBeUndefined();

    await navigateToResults();

    // Nothing was stored before this mount, so the blocked frame can only
    // come from the current errors, not from the persisted record.
    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('12 responses')).not.toBeInTheDocument();
    expect(screen.queryByText('Retained approved excerpt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-follow-up-callout')).not.toBeInTheDocument();
    const header = screen.getByTestId('survey-result-header');
    expect(within(header).queryByRole('link', { name: /Follow-up/ })).not.toBeInTheDocument();
    expect(within(header).queryByText('Follow-up · 1')).not.toBeInTheDocument();
    // The record lands only after render, in the persistence effect.
    expect(queryClient.getQueryData(denialKey)).toMatchObject({ at: 2000, blocked: true });
  });

  it('persists the denial marker in an effect, not during render', async () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    mockParentRoute();
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({
      data: retainedResults(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      dataUpdatedAt: 1000,
    });
    const followUpDenied = {
      data: holderFollowUpData(),
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, { code: 'permission.denied', message: 'denied' }),
      errorUpdatedAt: 2000,
    };
    useOutcomeFollowUp.mockImplementation(() => {
      // The route calls this hook before its persistence code, so the probe
      // covers the rest of this render pass; the mocked panel effect clears
      // it before the route's own effects run.
      permissionPanelProbe.routeRenderActive = true;
      return followUpDenied;
    });

    const { queryClient, navigateToResults } = mountResultsRouteForTransition();
    const denialKey = surveyKeys.resultsReadDenial(surveyId);
    const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
    const writesDuringRender: unknown[] = [];
    const denialWrites: unknown[] = [];
    vi.spyOn(queryClient, 'setQueryData').mockImplementation(
      (...args: Parameters<QueryClient['setQueryData']>) => {
        if (permissionPanelProbe.routeRenderActive) writesDuringRender.push(args[0]);
        if (Array.isArray(args[0]) && args[0].includes('results-read-denial')) {
          denialWrites.push(args[0]);
        }
        return originalSetQueryData(...args);
      },
    );

    await navigateToResults();

    expect(await screen.findByText('Survey Result')).toBeInTheDocument();
    expect(writesDuringRender).toEqual([]);
    expect(denialWrites).toHaveLength(1);
    expect(queryClient.getQueryData(denialKey)).toMatchObject({ at: 2000, blocked: true });
  });
});
