import { routeTree } from '@/routeTree.gen';
import { outcomeFollowUpMarkedResultSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
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
  apiClient,
  apiRequest,
  markConsumed,
  toastSuccess,
  idempotencyKeyState,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveys: vi.fn(),
  useOutcomeFollowUp: vi.fn(),
  apiClient: vi.fn(),
  apiRequest: vi.fn(),
  markConsumed: vi.fn(),
  toastSuccess: vi.fn(),
  idempotencyKeyState: {
    index: 0,
    values: [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ],
  },
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
  apiClient,
  fetchMe: vi.fn().mockResolvedValue({}),
  apiRequest,
  useIdempotencyKey: () => ({
    key:
      idempotencyKeyState.values[idempotencyKeyState.index] ?? idempotencyKeyState.values[0] ?? '',
    markConsumed: () => {
      markConsumed();
      idempotencyKeyState.index += 1;
    },
  }),
}));
vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: ({ capability }: { capability: string }) => (
    <button data-testid={`request-access-${capability}`} type="button">
      권한 요청
    </button>
  ),
}));
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  return { ...actual, toast: Object.assign(actual.toast, { success: toastSuccess }) };
});

const surveyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const responseOpen = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const responseOpenSecond = 'abababab-abab-4bab-8bab-abababababab';
const responseFinding = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const responseNoFollowUp = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const systemId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const questionId = '11111111-1111-4111-8111-111111111111';
const secondExcerptId = '44444444-4444-4444-8444-444444444444';

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

function renderSurveyRoute(read: unknown = holderRead, resultData: unknown = results) {
  useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
  useSurveys.mockReturnValue({ data: [survey], isLoading: false, error: null });
  useSurveyManageGate.mockReturnValue({ canManage: false, gateState: 'absent' });
  useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
  // A tiny external store so a changed read actually re-renders the mounted route.
  let current = read;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  useOutcomeFollowUp.mockImplementation(() => ({
    data: useSyncExternalStore(subscribe, () => current),
    isLoading: false,
    isError: false,
  }));
  useSurveyResults.mockReturnValue({ data: resultData, isLoading: false, isError: false });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/surveys/${surveyId}/follow-up`] }),
  });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const tree = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  render(tree);
  return {
    invalidateQueries,
    router,
    rerenderRead(nextRead: unknown) {
      act(() => {
        current = nextRead;
        for (const listener of listeners) listener();
      });
    },
  };
}

describe('/surveys/:surveyId/follow-up route', () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    apiRequest.mockReset();
    apiClient.mockReset();
    idempotencyKeyState.index = 0;
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

  it('keeps response B and its in-progress reason when response A settles after a switch', async () => {
    renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpen, 4, 'open'), item(responseOpenSecond, 5, 'open')],
    });
    const user = userEvent.setup();
    await screen.findByTestId('follow-up-row-4');
    await user.click(screen.getByRole('button', { name: '후속 조치 없음…' }));
    const dialogA = await screen.findByRole('dialog');
    await user.type(within(dialogA).getByTestId('follow-up-decision-reason'), 'A reason');

    let resolveMark: ((value: unknown) => void) | undefined;
    apiRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMark = resolve;
        }),
    );
    await user.click(within(dialogA).getByRole('button', { name: '후속 조치 없음' }));
    expect(resolveMark).toBeDefined();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('follow-up-row-5'));
    await user.click(screen.getByRole('button', { name: '후속 조치 없음…' }));
    const reasonB = await screen.findByTestId('follow-up-decision-reason');
    await user.type(reasonB, 'B draft must stay');

    await act(async () => {
      resolveMark?.({
        data: {
          response_id: responseOpen,
          resolution: 'no_follow_up',
          updated_at: '2026-09-22T00:00:00.000Z',
        },
      });
    });

    expect(screen.getByTestId('follow-up-row-5')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('follow-up-decision-reason')).toHaveValue('B draft must stay');
  });

  it('clears the selected detail when refreshed data moves it outside the active filter', async () => {
    const { rerenderRead } = renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpen, 4, 'open'), item(responseOpenSecond, 5, 'open')],
    });
    await screen.findByTestId('follow-up-detail-panel');

    rerenderRead({
      ...holderRead,
      items: [item(responseOpen, 4, 'finding'), item(responseOpenSecond, 5, 'open')],
    });

    await waitFor(() =>
      expect(screen.queryByTestId('follow-up-detail-panel')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('follow-up-row-5')).toBeInTheDocument();
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
    const { invalidateQueries, rerenderRead } = renderSurveyRoute({
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

    expect(await screen.findByTestId('follow-up-decision-notice')).toHaveTextContent(message);
    expect(markConsumed).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['surveys', surveyId, 'outcome-follow-up'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['surveys', surveyId, 'results'] });

    rerenderRead({
      ...holderRead,
      classifiable: false,
      follow_up_needed: false,
      items: [],
    });
    await waitFor(() =>
      expect(screen.getByTestId('follow-up-decision-notice')).toHaveTextContent(message),
    );
    expect(screen.getByText('후속 검토를 사용할 수 없습니다.')).toBeInTheDocument();
  });

  it('shows retry guidance and rotates the idempotency key after key reuse conflict', async () => {
    renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpen, 4, 'open')],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '후속 조치 없음…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByTestId('follow-up-decision-reason'), '재시도 사유');
    apiRequest.mockRejectedValueOnce(
      new (await import('@/lib/api')).ApiError(409, {
        code: 'conflict.idempotency_key_reuse',
        message: 'Key reused',
        detail: {},
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: '후속 조치 없음' }));

    expect(await screen.findByTestId('follow-up-decision-notice')).toHaveTextContent(
      '요청 키가 만료되었습니다. 다시 시도해 주세요.',
    );
    expect(markConsumed).toHaveBeenCalledOnce();

    await user.clear(within(dialog).getByTestId('follow-up-decision-reason'));
    await user.type(within(dialog).getByTestId('follow-up-decision-reason'), '수정된 재시도 사유');
    apiRequest.mockResolvedValueOnce({
      data: {
        response_id: responseOpen,
        resolution: 'no_follow_up',
        updated_at: '2026-09-22T00:00:00.000Z',
      },
    });
    await user.click(within(dialog).getByRole('button', { name: '후속 조치 없음' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const requestKeys = apiRequest.mock.calls.map((call) => call[3]?.idempotencyKey);
    expect(requestKeys).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    expect(markConsumed).toHaveBeenCalledTimes(2);
  });

  it('creates a Finding with only the selected response approved excerpt ids', async () => {
    const [textQuestion] = results.questions;
    if (!textQuestion) throw new Error('fixture needs a text question');
    const secondResults = {
      ...results,
      questions: [
        {
          ...textQuestion,
          excerpts: [
            ...textQuestion.excerpts,
            {
              id: secondExcerptId,
              text: '두 번째 응답의 승인된 발췌입니다.',
              response_id: responseOpenSecond,
            },
          ],
        },
      ],
    };
    renderSurveyRoute(
      {
        ...holderRead,
        items: [item(responseOpen, 4, 'open'), item(responseOpenSecond, 5, 'open')],
      },
      secondResults,
    );
    const user = userEvent.setup();
    await screen.findByTestId('follow-up-row-4');
    await user.click(screen.getByTestId('follow-up-row-5'));
    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));

    expect(screen.queryByText('응답 선택')).not.toBeInTheDocument();
    await user.click(screen.getByTestId(`survey-finding-excerpt-${secondExcerptId}`));
    apiClient.mockResolvedValue({
      data: { id: '99999999-9999-4999-8999-999999999999', display_id: 'FND-424' },
    });
    await user.click(screen.getByRole('button', { name: '선택한 응답으로 Finding 생성' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/survey-responses/${responseOpenSecond}/create-finding`,
        {
          body: { severity: 'medium', approved_excerpt_ids: [secondExcerptId] },
        },
      ),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Finding FND-424 created.'));
    await waitFor(() =>
      expect(screen.queryByTestId('follow-up-detail-panel')).not.toBeInTheDocument(),
    );
  });

  it('disables Create Finding and explains when the selected response has no approved excerpts', async () => {
    renderSurveyRoute({
      ...holderRead,
      items: [item(responseOpenSecond, 5, 'open')],
    });

    const createFinding = await screen.findByRole('button', { name: 'Finding 생성' });
    expect(createFinding).toBeDisabled();
    expect(
      screen.getByText('No approved excerpts are available for a response you can access.'),
    ).toBeInTheDocument();
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
