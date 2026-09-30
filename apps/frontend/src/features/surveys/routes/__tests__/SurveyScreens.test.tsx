import { SURVEY_QUESTION_KIND_LABELS } from '@/lib/copy/enum-labels';
import { CreateSurveyDialog } from '@/routes/_authed/surveys/index';
import { surveyQuestionKindSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SurveyStatusBadge } from '../../components/SurveyStatusBadge';
import { SurveyBuilder } from '../../components/builder/SurveyBuilder';
import { SurveyDetail } from '../../components/detail/SurveyDetail';
import { SurveyList } from '../../components/list/SurveyList';
import { useSurveys } from '../../hooks/useSurveys';
import type { Survey, SurveyQuestion } from '../../types';

const { apiClient, apiRequest, fetchAnalyticsAreas, fetchCapabilityScope, fetchManagedSystems } =
  vi.hoisted(() => ({
    apiClient: vi.fn(),
    apiRequest: vi.fn(),
    fetchAnalyticsAreas: vi.fn(),
    fetchCapabilityScope: vi.fn(),
    fetchManagedSystems: vi.fn(),
  }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
  apiRequest,
  fetchAnalyticsAreas,
  fetchCapabilityScope,
  fetchManagedSystems,
}));

const MANAGED_SYSTEM_ID = '11111111-1111-4111-8111-111111111111';

function question(id: string, prompt: string, sortOrder: number): SurveyQuestion {
  return {
    ...(survey.questions?.[0] as SurveyQuestion),
    id,
    prompt,
    sort_order: sortOrder,
  };
}

function calls(method: string, path: string) {
  return apiClient.mock.calls.filter((call) => call[0] === method && call[1] === path);
}

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '설문 설명',
  primary_managed_system_id: 'system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [
    {
      id: 'question-1',
      survey_id: 'survey-1',
      kind: 'single_choice',
      prompt: '도움이 되었나요?',
      is_required: true,
      options: [
        { key: 'yes', label: '예' },
        { key: 'no', label: '아니오' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
};
function renderWithQuery(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function renderDetailWithRouter(
  detailSurvey: Survey,
  canManage: boolean,
  onClose?: () => void,
  managedSystemNamesById?: ReadonlyMap<string, string>,
  actorNamesById?: ReadonlyMap<string, string>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <SurveyDetail
        survey={detailSurvey}
        canManage={canManage}
        {...(onClose !== undefined ? { onClose } : {})}
        {...(managedSystemNamesById !== undefined ? { managedSystemNamesById } : {})}
        {...(actorNamesById !== undefined ? { actorNamesById } : {})}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Survey screens', () => {
  beforeEach(() => {
    apiClient.mockReset();
    apiRequest.mockReset();
    fetchAnalyticsAreas.mockReset();
    fetchCapabilityScope.mockReset();
    fetchManagedSystems.mockReset();
    apiClient.mockImplementation(async (_method: string, path: string) => ({
      data: path.endsWith('/questions') ? { id: 'question-created' } : { id: 'question-1' },
    }));
    fetchManagedSystems.mockResolvedValue({
      items: [{ id: MANAGED_SYSTEM_ID, name: 'Tableau', archived_at: null }],
      total: 1,
    });
    fetchCapabilityScope.mockResolvedValue({ scope: { kind: 'all' } });
    fetchAnalyticsAreas.mockResolvedValue({ items: [], total: 0 });
  });
  it('renders list rows, empty, loading, and error states without a Create VOC affordance', () => {
    const select = vi.fn();
    const { rerender } = render(
      <SurveyList surveys={[survey]} isLoading={false} error={null} onSelect={select} />,
    );
    expect(screen.getByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create voc/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Q3 사용성 진단'));
    expect(select).toHaveBeenCalledWith('survey-1');
    fireEvent.click(screen.getByRole('button', { name: '카드 보기' }));
    expect(screen.getByTestId('survey-list-cards')).toBeInTheDocument();
    const row = screen.getByTestId('survey-row-survey-1');
    expect(row).not.toHaveTextContent('Responses');
    expect(row).not.toHaveTextContent('— / —');
    rerender(<SurveyList surveys={[]} isLoading={false} error={null} onSelect={select} />);
    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    rerender(<SurveyList surveys={[]} isLoading error={null} onSelect={select} />);
    expect(screen.getByTestId('survey-list-skeleton')).toBeInTheDocument();
    rerender(
      <SurveyList
        surveys={[]}
        isLoading={false}
        error={new Error('failed')}
        onSelect={select}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId('survey-list-error')).toBeInTheDocument();
  });

  it('resolves list row names and removes response placeholders and UUIDs', () => {
    const managedSystemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const operatorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const rowSurvey = {
      ...survey,
      primary_managed_system_id: managedSystemId,
      operator_actor_id: operatorId,
    };
    render(
      <SurveyList
        surveys={[rowSurvey]}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        managedSystemNamesById={new Map([[managedSystemId, 'Revenue Analytics']])}
        actorNamesById={new Map([[operatorId, 'Named Operator']])}
      />,
    );

    const row = screen.getByTestId('survey-row-survey-1');
    expect(row).toHaveTextContent('Revenue Analytics');
    expect(row).toHaveTextContent('Named Operator');
    expect(row).not.toHaveTextContent(managedSystemId);
    expect(row).not.toHaveTextContent(operatorId);
    expect(row).not.toHaveTextContent('Responses');
    expect(row).not.toHaveTextContent('— / —');
  });

  it('uses safe list fallbacks for an unassigned operator and unknown lookup ids', () => {
    const unknownSystemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const unknownActorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const rowSurvey = {
      ...survey,
      primary_managed_system_id: unknownSystemId,
    };
    const unassignedSurvey = { ...survey, operator_actor_id: null };
    const { rerender } = render(
      <SurveyList surveys={[unassignedSurvey]} isLoading={false} error={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('survey-row-survey-1')).toHaveTextContent('담당자 미지정');

    rerender(
      <SurveyList
        surveys={[{ ...rowSurvey, operator_actor_id: unknownActorId }]}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        managedSystemNamesById={new Map()}
        actorNamesById={new Map()}
      />,
    );
    const row = screen.getByTestId('survey-row-survey-1');
    expect(row).toHaveTextContent('알 수 없는 Managed System');
    expect(row).toHaveTextContent('알 수 없는 사용자');
    expect(row).not.toHaveTextContent(unknownSystemId);
    expect(row).not.toHaveTextContent(unknownActorId);
  });

  it('uses neutral labels while Managed System and actor lookups are unresolved', () => {
    const rowSurvey = {
      ...survey,
      operator_actor_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    };
    render(<SurveyList surveys={[rowSurvey]} isLoading={false} error={null} onSelect={vi.fn()} />);

    const row = screen.getByTestId('survey-row-survey-1');
    expect(within(row).getAllByText('—', { exact: true }).length).toBeGreaterThanOrEqual(2);
    expect(row).not.toHaveTextContent('알 수 없는 Managed System');
    expect(row).not.toHaveTextContent('알 수 없는 사용자');
  });

  it.each([
    ['draft', 'Draft'],
    ['open', 'Open'],
    ['closed', 'Closed'],
  ] as const)('presents survey status %s as %s', (status, label) => {
    render(<SurveyStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
  });

  it('renders the shared Survey detail header with its canonical close action', async () => {
    const onClose = vi.fn();
    renderDetailWithRouter(survey, false, onClose);

    const header = await screen.findByTestId('detail-panel-header-content');
    expect(header.parentElement).toHaveAttribute('data-kind', 'survey');
    expect(within(header).getByText('Survey')).toBeInTheDocument();
    expect(within(header).getByText('SRV-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the Survey detail header close action when no callback is provided', async () => {
    renderDetailWithRouter(survey, false);

    expect(await screen.findByTestId('detail-panel-header-content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '패널 닫기' })).not.toBeInTheDocument();
  });

  it('resolves Survey detail and builder Managed System and operator names', async () => {
    const managedSystemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const operatorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const namedSurvey = {
      ...survey,
      primary_managed_system_id: managedSystemId,
      operator_actor_id: operatorId,
    };
    const managedSystemNamesById = new Map([[managedSystemId, 'Revenue Analytics']]);
    const actorNamesById = new Map([[operatorId, 'Named Operator']]);

    const detailView = renderDetailWithRouter(
      namedSurvey,
      false,
      undefined,
      managedSystemNamesById,
      actorNamesById,
    );
    expect(await screen.findByText('Revenue Analytics')).toBeInTheDocument();
    expect(screen.getByText('담당자 · Named Operator')).toBeInTheDocument();
    expect(screen.queryByText(managedSystemId)).not.toBeInTheDocument();
    expect(screen.queryByText(operatorId)).not.toBeInTheDocument();
    detailView.unmount();

    renderWithQuery(
      <SurveyBuilder
        survey={namedSurvey}
        canManage
        managedSystemNamesById={managedSystemNamesById}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Revenue Analytics').length).toBeGreaterThan(0);
    expect(screen.queryByText(managedSystemId)).not.toBeInTheDocument();
  });

  it('refetches the survey list from the error state', async () => {
    apiRequest
      .mockRejectedValueOnce(new Error('server failed'))
      .mockRejectedValueOnce(new Error('server failed'))
      .mockResolvedValueOnce({ data: [] });

    function RetryableSurveyList() {
      const query = useSurveys();
      return (
        <SurveyList
          surveys={query.data ?? []}
          isLoading={query.isLoading}
          error={query.error}
          onSelect={vi.fn()}
          onRetry={() => void query.refetch()}
        />
      );
    }

    renderWithQuery(<RetryableSurveyList />);

    await waitFor(
      () => expect(screen.getByText('설문 목록을 불러오지 못했습니다')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });

  it.each(['open', 'closed'] as const)(
    'AC-8 keeps a %s builder read-only without save, title edit, or drag affordances',
    (status) => {
      renderWithQuery(<SurveyBuilder survey={{ ...survey, status }} canManage onBack={vi.fn()} />);
      // The prompt renders twice — once in the question list row, once in the
      // editor pane. Both must be present before any absence assertion, or the
      // negative assertions below have nothing to beat.
      expect(screen.getByTestId('survey-builder')).toBeInTheDocument();
      expect(screen.getAllByText('도움이 되었나요?')).toHaveLength(2);
      const label = status === 'open' ? 'Open' : 'Closed';
      expect(screen.getByText(`${label} 상태 — 질문 변경은 잠겨 있습니다.`)).toBeInTheDocument();
      expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '초안 저장' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Survey title')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('질문 드래그 핸들')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Q1 위로 이동' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Q1 아래로 이동' })).not.toBeInTheDocument();
    },
  );

  it('renders a canonical closed status in builder and detail lock copy', async () => {
    const closedSurvey = { ...survey, status: 'closed' as const };
    const builderView = renderWithQuery(
      <SurveyBuilder survey={closedSurvey} canManage onBack={vi.fn()} />,
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('closed · discovery')).not.toBeInTheDocument();
    expect(screen.getByText('Closed 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('closed', { exact: true })).not.toBeInTheDocument();
    builderView.unmount();
    renderDetailWithRouter(closedSurvey, true);
    expect(await screen.findByText('Closed 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('closed', { exact: true })).not.toBeInTheDocument();
  });

  it('starts an editable empty builder with question kind cards and adds the selected kind', () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );

    expect(screen.queryByText('Questions 0')).not.toBeInTheDocument();
    expect(screen.getByText('첫 질문을 추가하세요')).toBeInTheDocument();
    expect(
      screen.getByText(
        '질문 유형을 고르면 바로 편집을 시작합니다. 나중에 유형을 바꾸거나 질문을 더 추가할 수 있습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId(/^survey-question-kind-/)
        .map((card) => card.getAttribute('data-question-kind')),
    ).toEqual(['single_choice', 'multiple_choice', 'rating', 'text']);
    fireEvent.click(screen.getByRole('button', { name: /^척도/ }));

    expect(screen.getByText('Questions 1')).toBeInTheDocument();
    expect(screen.getByLabelText('최소 점수')).toBeInTheDocument();
    expect(screen.queryByText('첫 질문을 추가하세요')).not.toBeInTheDocument();
  });

  it.each(surveyQuestionKindSchema.options)(
    'renders a display label for question kind %s',
    (kind) => {
      renderWithQuery(
        <SurveyBuilder
          survey={{
            ...survey,
            questions: [{ ...question('question-1', '도움이 되었나요?', 0), kind }],
          }}
          canManage
          onBack={vi.fn()}
        />,
      );

      const picker = screen.getByRole('combobox', { name: '질문 유형' });
      expect(picker).toHaveTextContent(SURVEY_QUESTION_KIND_LABELS[kind]);
      expect(picker).not.toHaveTextContent(kind);
    },
  );

  it('creates a rating question with its default bounds from an empty builder', async () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^척도/ }));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        '/surveys/survey-1/questions',
        expect.objectContaining({
          body: expect.objectContaining({ kind: 'rating', rating_min: 1, rating_max: 5 }),
        }),
      ),
    );
  });

  it('keeps an empty read-only builder without question cards or add actions', () => {
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, status: 'open', questions: [] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText('Questions 0')).not.toBeInTheDocument();
    expect(screen.getByText('질문이 없습니다.')).toHaveClass('text-text-muted');
    expect(screen.queryByRole('button', { name: /^단일 선택/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^복수 선택/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^척도/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^주관식/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
  });

  it('renders a survey detail title, type, status, and questions', async () => {
    renderDetailWithRouter(survey, false);

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.getByText('SRV-1')).toBeInTheDocument();
    expect(screen.getByText('탐색')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('담당자 · 담당자 미지정')).toBeInTheDocument();
    expect(screen.getByText('Q1. 도움이 되었나요?')).toBeInTheDocument();
  });

  it('launches a manageable draft survey and returns to detail after success', async () => {
    const onBack = vi.fn();
    apiClient.mockResolvedValue({ data: { ...survey, status: 'open' } });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByTestId('survey-open-confirmation')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('survey-open-confirmation')).getByTestId('survey-status-confirm'),
    );

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('POST', '/surveys/survey-1/open'));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('hides Launch when the builder survey is open', async () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, status: 'open' }} canManage onBack={vi.fn()} />,
    );

    await screen.findByTestId('survey-builder');
    expect(screen.queryByRole('button', { name: 'Launch' })).not.toBeInTheDocument();
  });

  it('hides Launch without survey.manage even for a draft survey', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage={false} onBack={vi.fn()} />);

    await screen.findByTestId('survey-builder');
    expect(screen.queryByRole('button', { name: 'Launch' })).not.toBeInTheDocument();
  });

  it('keeps the Launch confirmation open when a survey has no questions', async () => {
    const onBack = vi.fn();
    apiClient.mockRejectedValue({
      status: 422,
      envelope: {
        code: 'validation.failed',
        message: 'survey requires a question',
        detail: { fields: [{ path: ['questions'], code: 'required' }] },
      },
    });
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={onBack} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    expect(
      await screen.findByText('Launch하려면 질문을 하나 이상 추가해야 합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('survey-open-confirmation')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('shows a distinct Launch message for an invalid survey transition', async () => {
    apiClient.mockRejectedValue({
      status: 422,
      envelope: {
        code: 'validation.failed',
        message: 'invalid survey transition',
        detail: { fields: [{ path: ['status'], code: 'invalid_transition' }] },
      },
    });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    expect(
      await screen.findByText('이 설문은 더 이상 Launch할 수 없는 상태입니다.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Launch하려면 질문을 하나 이상 추가해야 합니다.'),
    ).not.toBeInTheDocument();
  });

  it('closes an open survey through its detail confirmation', async () => {
    apiClient
      .mockRejectedValueOnce({
        status: 422,
        envelope: {
          code: 'validation.failed',
          message: 'invalid survey transition',
          detail: { fields: [{ path: ['status'], code: 'invalid_transition' }] },
        },
      })
      .mockResolvedValueOnce({ data: { ...survey, status: 'closed' } });
    renderDetailWithRouter({ ...survey, status: 'open' }, true);

    fireEvent.click(await screen.findByRole('button', { name: 'Close survey' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-close-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );
    expect(
      await screen.findByText('이 설문은 더 이상 Close할 수 없는 상태입니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('survey-close-confirmation')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('survey-close-confirmation')).getByTestId('survey-status-confirm'),
    );

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('POST', '/surveys/survey-1/close'));
  });

  it('hides Close survey for a manageable draft survey', async () => {
    renderDetailWithRouter(survey, true);
    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('button', { name: 'Close survey' })).not.toBeInTheDocument();
  });

  it('hides Close survey for a manageable closed survey', async () => {
    renderDetailWithRouter({ ...survey, status: 'closed' }, true);
    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('button', { name: 'Close survey' })).not.toBeInTheDocument();
  });

  it('hides Close survey for an open survey without management permission', async () => {
    renderDetailWithRouter({ ...survey, status: 'open' }, false);
    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('button', { name: 'Close survey' })).not.toBeInTheDocument();
  });

  it('invalidates and refetches the survey list after Launch', async () => {
    const listAfterLaunch = [{ ...survey, status: 'open' as const }];
    // #398: GET /surveys is parsed at the seam by apiRequest; the Launch
    // mutation still rides apiClient.
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/surveys') return { data: listAfterLaunch };
      return { data: survey };
    });
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'POST' && path === '/surveys/survey-1/open')
        return { data: listAfterLaunch[0] };
      return { data: survey };
    });
    function LaunchWithList() {
      const list = useSurveys();
      return (
        <>
          <SurveyList
            surveys={list.data ?? []}
            isLoading={list.isLoading}
            error={list.error}
            onSelect={vi.fn()}
          />
          <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />
        </>
      );
    }
    renderWithQuery(<LaunchWithList />);

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    await waitFor(() =>
      expect(
        apiRequest.mock.calls.filter((call) => call[0] === 'GET' && call[1] === '/surveys'),
      ).toHaveLength(2),
    );
    expect(screen.getByTestId('survey-row-survey-1')).toHaveTextContent('Open');
  });

  it.each(['open', 'closed'] as const)(
    'links %s surveys to their result summary',
    async (status) => {
      renderDetailWithRouter({ ...survey, status }, true);

      const link = await screen.findByRole('link', { name: 'Open result summary' });
      expect(link).toHaveAttribute('href', '/surveys/survey-1/results');
    },
  );

  it('does not link a draft survey to unavailable results', async () => {
    renderDetailWithRouter(survey, true);

    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('link', { name: 'Open result summary' })).not.toBeInTheDocument();
  });

  it('AC-1 keeps a prompt edit local until Save draft', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
      target: { value: '저장 전 로컬 프롬프트' },
    });
    // react-query's mutate() reaches apiClient on a later microtask. Asserting
    // synchronously would pass even if the edit did fire a request, so drain
    // the queue first — otherwise this oracle has nothing to catch.
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiClient).not.toHaveBeenCalled();
    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeEnabled();
  });

  it('AC-2 saves one changed question once and marks the draft saved', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
      target: { value: '저장된 질문 프롬프트' },
    });

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(1),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')[0]?.[2].body).toMatchObject({
      prompt: '저장된 질문 프롬프트',
    });
    await waitFor(() => expect(screen.getByText(/^Saved at /)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled();
  });

  it('AC-3 saves the distinct survey title with one scalar PATCH', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Survey title' }), {
      target: { value: '제목 전용 픽스처' },
    });

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() => expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(1));
    expect(calls('PATCH', '/surveys/survey-1')[0]?.[2].body).toEqual({
      title: '제목 전용 픽스처',
    });
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(0);
  });

  it('AC-4 saves a dragged [3,1,2] question order exactly once', async () => {
    const questions = [
      question('question-1', '첫 질문', 0),
      question('question-2', '둘째 질문', 1),
      question('question-3', '셋째 질문', 2),
    ];
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions }} canManage onBack={vi.fn()} />);
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      getData: vi.fn(),
      setData: vi.fn(),
    };

    fireEvent.dragStart(screen.getByTestId('survey-question-row-question-3'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('survey-question-row-question-1'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('survey-question-row-question-1'), { dataTransfer });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/reorder')).toHaveLength(1),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/reorder')[0]?.[2].body).toEqual({
      question_ids: ['question-3', 'question-1', 'question-2'],
    });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '2');
  });

  it('AC-5 saves a keyboard-only one-step move', async () => {
    const questions = [
      question('question-1', '첫 질문', 0),
      question('question-2', '둘째 질문', 1),
    ];
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions }} canManage onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Q1 아래로 이동' }));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/reorder')).toHaveLength(1),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/reorder')[0]?.[2].body).toEqual({
      question_ids: ['question-2', 'question-1'],
    });
  });

  it('AC-7 preserves dirty local state and retries the same body after save failure', async () => {
    apiClient
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValue({ data: { id: 'question-1' } });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
      target: { value: '재시도 보존 프롬프트' },
    });

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(screen.getByText('저장하지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByDisplayValue('재시도 보존 프롬프트')).toBeInTheDocument();
    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeEnabled();
    const firstBody = calls('PATCH', '/surveys/survey-1/questions/question-1')[0]?.[2].body;

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(2),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')[1]?.[2].body).toEqual(
      firstBody,
    );
  });

  it('AC-9 creates from the empty state with four required fields and returns the server id', async () => {
    const created = { ...survey, id: 'server-survey-id' };
    apiClient.mockResolvedValue({ data: created });
    const onCreated = vi.fn();
    function EmptyCreateFlow() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <SurveyList
            surveys={[]}
            isLoading={false}
            error={null}
            onSelect={vi.fn()}
            canCreate
            onCreate={() => setOpen(true)}
          />
          <CreateSurveyDialog open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
        </>
      );
    }
    renderWithQuery(<EmptyCreateFlow />);

    fireEvent.click(screen.getByTestId('survey-empty-create-button'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '신규 설문 제목' } });
    fireEvent.click(screen.getByRole('combobox', { name: '설문 유형' }));
    fireEvent.click(screen.getByRole('option', { name: '검증' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Tableau' }));
    fireEvent.click(screen.getByRole('combobox', { name: '응답 익명 보호' }));
    fireEvent.click(screen.getByRole('option', { name: '보호함' }));
    fireEvent.click(screen.getByTestId('survey-create-submit'));

    await waitFor(() => expect(calls('POST', '/surveys')).toHaveLength(1));
    expect(calls('POST', '/surveys')[0]?.[2].body).toEqual({
      type: 'validation',
      title: '신규 설문 제목',
      primary_managed_system_id: MANAGED_SYSTEM_ID,
      responses_identity_protected: true,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('server-survey-id'));
  });

  it('AC-10 hides creation actions when SurveyPermissionGate denies management', async () => {
    render(
      <SurveyList
        surveys={[survey]}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        canCreate={false}
        onCreate={vi.fn()}
      />,
    );

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-create-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-empty-create-button')).not.toBeInTheDocument();
  });

  it.each(['single_choice', 'multiple_choice', 'rating', 'text'] as const)(
    'sends a strict PATCH payload when changing to %s',
    async (kind) => {
      renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox', { name: '질문 유형' }));
      fireEvent.click(screen.getByRole('option', { name: SURVEY_QUESTION_KIND_LABELS[kind] }));
      if (kind === 'single_choice') {
        fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
          target: { value: '수정된 단일 선택' },
        });
      }
      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith(
          'PATCH',
          '/surveys/survey-1/questions/question-1',
          expect.objectContaining({ body: expect.any(Object) }),
        ),
      );
      const body = apiClient.mock.calls.at(-1)?.[2].body;
      expect(body).not.toHaveProperty('rating_min', null);
      expect(body).not.toHaveProperty('rating_max', null);
      expect(body).not.toHaveProperty('options', null);
      expect(body).not.toHaveProperty('branch_parent_question_id', null);
    },
  );

  it('creates, edits, and deletes a question through the survey question endpoints', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
    fireEvent.change(screen.getByDisplayValue('새 질문'), {
      target: { value: '수정된 질문' },
    });
    expect(apiClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        '/surveys/survey-1/questions',
        expect.objectContaining({
          body: expect.objectContaining({ kind: 'single_choice', prompt: '수정된 질문' }),
        }),
      ),
    );
    const createBody = calls('POST', '/surveys/survey-1/questions')[0]?.[2].body;
    expect(createBody).not.toHaveProperty('rating_min');
    expect(createBody).not.toHaveProperty('branch_parent_question_id');
    const deleteButtons = screen.getAllByLabelText('질문 삭제');
    const lastDeleteButton = deleteButtons.at(-1);
    if (!lastDeleteButton) throw new Error('Expected a question delete button');
    fireEvent.click(lastDeleteButton);
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'DELETE',
        '/surveys/survey-1/questions/question-created',
      ),
    );
  });

  it('patches the current question state after an edit during its pending create', async () => {
    let resolveCreate: ((value: { data: { id: string } }) => void) | undefined;
    apiClient.mockImplementation((method: string, path: string) => {
      if (method === 'POST' && path.endsWith('/questions'))
        return new Promise((resolve) => {
          resolveCreate = resolve;
        });
      return Promise.resolve({ data: { id: 'question-created' } });
    });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(resolveCreate).toBeDefined());
    fireEvent.change(screen.getByDisplayValue('새 질문'), { target: { value: 'POST 중 수정' } });
    await act(async () => resolveCreate?.({ data: { id: 'question-created' } }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'PATCH',
        '/surveys/survey-1/questions/question-created',
        expect.objectContaining({ body: expect.objectContaining({ prompt: 'POST 중 수정' }) }),
      ),
    );
  });

  it('creates a single-choice question from the populated builder add button', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        '/surveys/survey-1/questions',
        expect.objectContaining({ body: expect.objectContaining({ kind: 'single_choice' }) }),
      ),
    );
  });

  it('AC-6 clears a persisted branch with one PATCH and keeps the question id', async () => {
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = {
      ...parentQuestion,
      id: 'question-2',
      prompt: '추가 질문',
      branch_depth: 1,
      branch_parent_question_id: 'question-1',
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [...(survey.questions ?? []), child] }}
        canManage
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Q2'));
    fireEvent.change(screen.getByLabelText('분기 부모 질문'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-2')).toHaveLength(1),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/question-2')[0]?.[2].body).toMatchObject({
      branch_parent_question_id: null,
    });
    // The #188 workaround deleted and re-created the row, which minted a new
    // id. A PATCH must not touch either endpoint (#194).
    expect(apiClient).not.toHaveBeenCalledWith('DELETE', '/surveys/survey-1/questions/question-2');
    expect(apiClient).not.toHaveBeenCalledWith(
      'POST',
      '/surveys/survey-1/questions',
      expect.anything(),
    );
    // The backend clears trigger and depth alongside the parent, so sending
    // them would be redundant — and sending a stale trigger would fight it.
    const body = apiClient.mock.calls.find(
      (call) => call[0] === 'PATCH' && call[1] === '/surveys/survey-1/questions/question-2',
    )?.[2].body;
    expect(body).not.toHaveProperty('branch_trigger_option_key');
  });

  it('stays editable through an unbranch, since the id no longer changes', async () => {
    let resolvePatch: (() => void) | undefined;
    apiClient.mockImplementation((method: string, path: string) => {
      if (method === 'PATCH' && path.endsWith('/question-2')) {
        return new Promise((resolve) => {
          resolvePatch = () => resolve({ data: { id: 'question-2' } });
        });
      }
      return Promise.resolve({ data: { id: 'question-2' } });
    });
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = {
      ...parentQuestion,
      id: 'question-2',
      prompt: '추가 질문',
      branch_depth: 1,
      branch_parent_question_id: 'question-1',
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [...(survey.questions ?? []), child] }}
        canManage
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Q2'));
    fireEvent.change(screen.getByLabelText('분기 부모 질문'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(resolvePatch).toBeDefined());
    // The busyQuestionIds lock existed only because the in-flight recreate
    // invalidated the id an edit would target. With a stable id, edits during
    // the request are ordinary follow-up PATCHes to the same row (#194).
    const title = screen.getByDisplayValue('추가 질문');
    expect(title).not.toBeDisabled();
    fireEvent.change(title, { target: { value: '언브랜치 중 수정' } });
    await act(async () => resolvePatch?.());
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'PATCH',
        '/surveys/survey-1/questions/question-2',
        expect.objectContaining({
          body: expect.objectContaining({ prompt: '언브랜치 중 수정' }),
        }),
      ),
    );
  });

  it('uses the selected parent option to reveal a branched preview question', async () => {
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = {
      ...parentQuestion,
      id: 'question-2',
      prompt: '추가 질문',
      branch_depth: 1,
      branch_parent_question_id: 'question-1',
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [...(survey.questions ?? []), child] }}
        canManage
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Q2'));
    fireEvent.change(screen.getByLabelText('분기 조건 옵션'), {
      target: { value: 'yes' },
    });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    const preview = screen.getByRole('dialog');
    expect(within(preview).queryByText(/Q2\. 추가 질문/)).not.toBeInTheDocument();
    fireEvent.click(within(preview).getByLabelText('예'));
    expect(within(preview).getByText(/Q2\. 추가 질문/)).toBeInTheDocument();
  });

  it('does not expose a Create VOC affordance in detail or builder surfaces', () => {
    const { rerender } = renderWithQuery(<SurveyDetail survey={survey} canManage={false} />);
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create voc/i })).not.toBeInTheDocument();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create voc/i })).not.toBeInTheDocument();
  });

  it.each(['loading', 'error', 'absent'] as const)(
    'does not expose builder mutations when survey.manage is %s',
    (state) => {
      renderWithQuery(
        <SurveyBuilder survey={survey} canManage={false} gateState={state} onBack={vi.fn()} />,
      );
      expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
      expect(screen.queryByText('설문 생성')).not.toBeInTheDocument();
    },
  );
});
