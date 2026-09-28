import { routeTree } from '@/routeTree.gen';
import { outcomeFollowUpMarkedResultSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveyManageGate,
  useSurveyReadGate,
  useSurveys,
  useOutcomeFollowUp,
  apiRequest,
  markConsumed,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveys: vi.fn(),
  useOutcomeFollowUp: vi.fn(),
  apiRequest: vi.fn(),
  markConsumed: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useSurveys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/surveys/hooks/useSurveys')>()),
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveyResults,
  useSurveys,
}));
vi.mock('@/features/surveys/hooks/useOutcomeFollowUp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/surveys/hooks/useOutcomeFollowUp')>()),
  useOutcomeFollowUp,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate,
  useSurveyReadGate,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchMe: vi.fn().mockResolvedValue({}),
  apiRequest,
  useIdempotencyKey: () => ({ key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', markConsumed }),
}));
vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: ({ capability }: { capability: string }) => (
    <button data-testid={`request-access-${capability}`} type="button">
      Request access
    </button>
  ),
}));

const surveyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const responseOpen = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const responseFinding = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const responseNoFollowUp = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const systemId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const questionId = '11111111-1111-4111-8111-111111111111';

const survey = {
  id: surveyId,
  display_id: 'SRV-21',
  title: 'Q3 매출 리포트 사용성 진단',
  type: 'outcome' as const,
  status: 'closed' as const,
  description: null,
  primary_managed_system_id: systemId,
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '22222222-2222-4222-8222-222222222222',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function item(
  responseId: string,
  responseNumber: number,
  resolution: 'open' | 'finding' | 'no_follow_up',
) {
  return {
    response_id: responseId,
    response_number: responseNumber,
    submitted_at: '2026-09-21T00:00:00.000Z',
    low_answers: [
      {
        question_id: questionId,
        question_label: '만족도',
        value: 2,
        rating_min: 1,
        rating_max: 5,
      },
    ],
    resolution,
    finding: null,
    decision:
      resolution === 'no_follow_up'
        ? {
            state: 'no_follow_up' as const,
            reason: '범위가 제한적입니다.',
            updated_at: '2026-09-22T00:00:00.000Z',
          }
        : null,
    next_actions:
      resolution === 'open'
        ? [
            { id: 'create_finding' as const, availability: 'allowed' as const },
            { id: 'mark_no_follow_up' as const, availability: 'allowed' as const },
          ]
        : resolution === 'no_follow_up'
          ? [{ id: 'reopen_follow_up' as const, availability: 'allowed' as const }]
          : [],
  };
}

const holderRead = {
  survey_id: surveyId,
  classifiable: true,
  follow_up_needed: true,
  personal_access: true as const,
  items: [
    item(responseOpen, 4, 'open'),
    item(responseFinding, 9, 'finding'),
    item(responseNoFollowUp, 12, 'no_follow_up'),
  ],
};

const results = {
  survey_id: surveyId,
  status: 'closed' as const,
  identity_protected: true,
  response_state: 'visible' as const,
  anonymity_threshold: 5,
  questions: [
    {
      question_id: questionId,
      visibility: 'visible' as const,
      kind: 'text' as const,
      answer_count: 1,
      distribution: null,
      excerpts: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          text: '승인된 발췌입니다.',
          response_id: responseOpen,
        },
      ],
    },
  ],
  next_actions: [],
};

function renderSurveyRoute(read: unknown = holderRead) {
  useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
  useSurveys.mockReturnValue({ data: [survey], isLoading: false, error: null });
  useSurveyManageGate.mockReturnValue({ canManage: false, gateState: 'absent' });
  useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
  useOutcomeFollowUp.mockReturnValue({ data: read, isLoading: false, isError: false });
  useSurveyResults.mockReturnValue({ data: results, isLoading: false, isError: false });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/surveys/${surveyId}/follow-up`] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { invalidateQueries, router };
}

describe('/surveys/:surveyId/follow-up route', () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('defaults to Open, shows only open items, counts filters, and renders the selected response detail', async () => {
    renderSurveyRoute();

    expect(await screen.findByTestId('follow-up-row-4')).toBeInTheDocument();
    expect(screen.queryByTestId('follow-up-row-9')).not.toBeInTheDocument();
    expect(screen.queryByTestId('follow-up-row-12')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '해소됨 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '후속 없음 1' })).toBeInTheDocument();
    expect(screen.getByText('만족도 2 / 5 (하위 구간)')).toBeInTheDocument();
    expect(screen.getByText(/승인된 발췌입니다\./)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: '해소됨 1' }));
    expect(await screen.findByTestId('follow-up-row-9')).toBeInTheDocument();
    expect(screen.getByTestId('follow-up-row-9')).toHaveTextContent('Finding');
    expect(screen.queryByText(/Finding [A-Z]+-\d+/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '후속 없음 1' }));
    expect(await screen.findByTestId('follow-up-row-12')).toBeInTheDocument();
  });

  it('shows personal-access guidance for a non-holder deep link and links back to Results', async () => {
    renderSurveyRoute({
      survey_id: surveyId,
      classifiable: true,
      follow_up_needed: true,
      personal_access: false,
      items: null,
    });

    expect(await screen.findByText('개인 응답 열람 권한이 필요합니다.')).toBeInTheDocument();
    expect(
      screen.getByText('개인 응답 열람 권한이 있어야 응답별로 검토할 수 있습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Results로 돌아가기' })).toHaveAttribute(
      'href',
      `/surveys/${surveyId}/results`,
    );
    expect(screen.queryByText(/응답 #\d/)).not.toBeInTheDocument();
  });

  it('explains when the survey is not classifiable without exposing the anonymity threshold', async () => {
    renderSurveyRoute({
      survey_id: surveyId,
      classifiable: false,
      follow_up_needed: false,
      personal_access: true,
      items: [],
    });

    expect(await screen.findByText('후속 검토를 사용할 수 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText(
        '후속 검토는 마감된 Outcome 설문 중 충분한 응답이 모인 경우에만 제공됩니다.',
      ),
    ).toBeInTheDocument();
  });

  it('renders RequestAccessButton for a blocked requestable action', async () => {
    const read = {
      ...holderRead,
      items: [
        {
          ...item(responseOpen, 4, 'open'),
          next_actions: [
            {
              id: 'mark_no_follow_up',
              availability: 'blocked_requestable',
              requestable_permission: { permission: 'finding.manage', managed_system_id: systemId },
            },
          ],
        },
      ],
    };
    renderSurveyRoute(read);

    expect(await screen.findByTestId('request-access-finding.manage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '후속 조치 없음…' })).not.toBeInTheDocument();
  });

  it('blocks blank reasons and sends a valid mark request with an Idempotency-Key', async () => {
    const { invalidateQueries } = renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpen, 4, 'open')],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '후속 조치 없음…' }));
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByTestId('follow-up-decision-reason');
    const submit = within(dialog).getByRole('button', { name: '후속 조치 없음' });
    await user.type(reason, '   ');
    expect(submit).toBeDisabled();
    expect(apiRequest).not.toHaveBeenCalled();

    await user.clear(reason);
    await user.type(reason, '응답 범위가 제한적입니다.');
    apiRequest.mockResolvedValue({
      data: {
        response_id: responseOpen,
        resolution: 'no_follow_up',
        updated_at: '2026-09-22T00:00:00.000Z',
      },
    });
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const request = apiRequest.mock.calls.find((call) => call[0] === 'POST');
    expect(request).toEqual([
      'POST',
      `/survey-responses/${responseOpen}/mark-no-follow-up`,
      outcomeFollowUpMarkedResultSchema,
      {
        body: { reason: '응답 범위가 제한적입니다.' },
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ]);
    expect(markConsumed).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['surveys', surveyId, 'outcome-follow-up'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['surveys', surveyId, 'results'] });
  });

  it.each([
    ['action_no_longer_available', '이 응답은 더 이상 후속 조치 대상이 아닙니다.'],
    ['recovery_item_resolved', '이미 처리된 응답입니다.'],
  ])('shows the structured 409 message for %s and refetches', async (failureCode, message) => {
    const { invalidateQueries } = renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpen, 4, 'open')],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '후속 조치 없음…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByTestId('follow-up-decision-reason'), '결정 사유');
    const conflict = new (await import('@/lib/api')).ApiError(409, {
      code: 'conflict.stale_write',
      message: 'Stale write',
      detail: { failure_code: failureCode },
    });
    apiRequest.mockRejectedValue(conflict);
    await user.click(within(dialog).getByRole('button', { name: '후속 조치 없음' }));

    expect(await screen.findByTestId('follow-up-decision-error')).toHaveTextContent(message);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['surveys', surveyId, 'outcome-follow-up'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['surveys', surveyId, 'results'] });
  });

  it('reopens a no-follow-up response with a required reason', async () => {
    const { invalidateQueries } = renderSurveyRoute({
      ...holderRead,
      items: [item(responseNoFollowUp, 12, 'no_follow_up')],
    });
    const user = userEvent.setup();
    // Default filter is Open; the no-follow-up response lives under its own chip.
    await user.click(await screen.findByRole('button', { name: '후속 없음 1' }));
    await user.click(await screen.findByRole('button', { name: '다시 열기…' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: '다시 열기' });
    expect(submit).toBeDisabled();
    await user.type(
      within(dialog).getByTestId('follow-up-decision-reason'),
      '새로운 근거가 확인됐습니다.',
    );
    apiRequest.mockResolvedValue({
      data: {
        response_id: responseNoFollowUp,
        resolution: 'open',
        updated_at: '2026-09-22T00:00:00.000Z',
      },
    });
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith(
      'POST',
      `/survey-responses/${responseNoFollowUp}/reopen-follow-up`,
      expect.anything(),
      {
        body: { reason: '새로운 근거가 확인됐습니다.' },
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['surveys', surveyId, 'outcome-follow-up'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['surveys', surveyId, 'results'] });
  });
});
