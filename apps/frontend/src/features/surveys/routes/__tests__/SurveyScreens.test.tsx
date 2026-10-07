import { SURVEY_QUESTION_KIND_LABELS } from '@/lib/copy/enum-labels';
import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { SurveyDetailRoute } from '@/routes/_authed/surveys/$surveyId';
import { CreateSurveyDialog, SurveysIndexRoute } from '@/routes/_authed/surveys/index';
import { surveyQuestionKindSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type RouterHistory,
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SurveyStatusBadge } from '../../components/SurveyStatusBadge';
import { SurveyBuilder } from '../../components/builder/SurveyBuilder';
import { SurveyDetail } from '../../components/detail/SurveyDetail';
import { SurveyList } from '../../components/list/SurveyList';
import { useSurveys } from '../../hooks/useSurveys';
import type { Survey, SurveyQuestion } from '../../types';

const {
  apiClient,
  apiRequest,
  fetchAnalyticsAreas,
  fetchCapabilityScope,
  fetchManagedSystems,
  routeQueryStubs,
} = vi.hoisted(() => ({
  apiClient: vi.fn(),
  apiRequest: vi.fn(),
  fetchAnalyticsAreas: vi.fn(),
  fetchCapabilityScope: vi.fn(),
  fetchManagedSystems: vi.fn(),
  // Query-hook stubs for the real route components in the #706 describe.
  // Undefined = fall through to the real hook, so the existing suites that
  // wire useSurveys to the real hook keep their behaviour unchanged.
  routeQueryStubs: {
    surveys: undefined as (() => unknown) | undefined,
    survey: undefined as (() => unknown) | undefined,
    search: {} as { builder?: boolean },
    manageGate: undefined as (() => unknown) | undefined,
    navigate: undefined as ((...args: unknown[]) => Promise<unknown>) | undefined,
  },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
  apiRequest,
  fetchAnalyticsAreas,
  fetchCapabilityScope,
  fetchManagedSystems,
}));
vi.mock('@/features/surveys/hooks/useSurveys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/surveys/hooks/useSurveys')>();
  return {
    ...actual,
    useSurveys: (managedSystemId?: string) =>
      routeQueryStubs.surveys ? routeQueryStubs.surveys() : actual.useSurveys(managedSystemId),
    useSurvey: (surveyId: string) =>
      routeQueryStubs.survey ? routeQueryStubs.survey() : actual.useSurvey(surveyId),
  };
});
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate: () =>
    routeQueryStubs.manageGate?.() ?? { canManage: false, gateState: 'absent' as const },
}));
vi.mock('@/lib/cross-system/useManagedSystemNames', () => ({
  useManagedSystemNamesResult: () => ({ namesById: new Map<string, string>(), isSuccess: true }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true }),
}));
// The route components read search/params/match through the router; the #706
// describe mounts them without a full app router, so pin those reads. The real
// createRouter/RouterProvider/createRoute stay intact for renderDetailWithRouter.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => () => ({
    useParams: () => ({ surveyId: 'survey-1' }),
    useSearch: () => routeQueryStubs.search,
  }),
  useSearch: () => routeQueryStubs.search,
  useMatchRoute: () => () => false,
  useNavigate: () => routeQueryStubs.navigate ?? (() => Promise.resolve()),
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

// Test oracle copied from surveys/routes.ts question parsing and
// surveys/authoring.ts validateQuestions. Keep this independent of frontend schemas.
const backendQuestionInputOracle = z
  .object({
    kind: surveyQuestionKindSchema,
    prompt: z.string().min(1),
    is_required: z.boolean().optional(),
    options: z
      .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).strict())
      .min(2)
      .max(50)
      .optional(),
    rating_min: z.number().int().optional(),
    rating_max: z.number().int().optional(),
    rating_low_label: z.string().nullable().optional(),
    rating_high_label: z.string().nullable().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    branch_parent_question_id: z.string().uuid().nullable().optional(),
    branch_trigger_option_key: z.string().min(1).nullable().optional(),
  })
  .strict();
const SERVER_CREATED_QUESTION_ID = '33333333-3333-4333-8333-333333333333';

function parseBackendQuestionInput(input: unknown) {
  const parsed = backendQuestionInputOracle.parse(input);
  const isChoice = parsed.kind === 'single_choice' || parsed.kind === 'multiple_choice';
  if (
    isChoice &&
    (!parsed.options ||
      new Set(parsed.options.map((option) => option.key)).size !== parsed.options.length ||
      parsed.options.some((option) => !option.key || !option.label))
  )
    throw new Error('422: choice questions require 2-50 unique options');
  if (
    parsed.kind === 'rating' &&
    (parsed.rating_min === undefined ||
      parsed.rating_max === undefined ||
      parsed.rating_min >= parsed.rating_max ||
      parsed.rating_min < 0 ||
      parsed.rating_max > 10)
  )
    throw new Error('422: rating range invalid');
  return parsed;
}

function installQuestionServerOracle(
  initialQuestions: SurveyQuestion[],
  options: { rejectFirstPatchFor?: string } = {},
) {
  const saved = new Map(initialQuestions.map((question) => [question.id, { ...question }]));
  const surveyId = initialQuestions[0]?.survey_id ?? 'survey-1';
  let rejectedFirstPatch = false;

  const validateBranches = (questions: SurveyQuestion[]) => {
    for (const child of questions) {
      if (child.branch_depth !== 1) continue;
      const parent = questions.find(
        (candidate) => candidate.id === child.branch_parent_question_id,
      );
      if (
        !parent ||
        parent.kind !== 'single_choice' ||
        parent.branch_depth !== 0 ||
        !parent.options?.some((option) => option.key === child.branch_trigger_option_key)
      )
        throw new Error('422: invalid question branch');
    }
  };

  const fromInput = (id: string, input: ReturnType<typeof parseBackendQuestionInput>) =>
    ({
      id,
      survey_id: surveyId,
      kind: input.kind,
      prompt: input.prompt,
      is_required: input.is_required ?? false,
      options: input.options ?? null,
      rating_min: input.rating_min ?? null,
      rating_max: input.rating_max ?? null,
      rating_low_label: input.rating_low_label ?? null,
      rating_high_label: input.rating_high_label ?? null,
      sort_order: input.sort_order ?? 0,
      branch_depth: input.branch_parent_question_id ? 1 : 0,
      branch_parent_question_id: input.branch_parent_question_id ?? null,
      branch_trigger_option_key: input.branch_trigger_option_key ?? null,
    }) satisfies SurveyQuestion;

  apiClient.mockImplementation(
    async (method: string, path: string, request?: { body?: unknown }) => {
      if (method === 'POST' && path === `/surveys/${surveyId}/questions`) {
        const input = parseBackendQuestionInput(request?.body);
        const created = fromInput(SERVER_CREATED_QUESTION_ID, input);
        validateBranches([...saved.values(), created]);
        saved.set(SERVER_CREATED_QUESTION_ID, created);
        return { data: { id: SERVER_CREATED_QUESTION_ID } };
      }

      const questionId = path.match(/^\/surveys\/[^/]+\/questions\/([^/]+)$/)?.[1];
      if (method === 'PATCH' && questionId && questionId !== 'reorder') {
        if (questionId === options.rejectFirstPatchFor && !rejectedFirstPatch) {
          rejectedFirstPatch = true;
          throw new Error('422: rejected once');
        }
        const existing = saved.get(questionId);
        if (!existing) throw new Error('404: question not found');
        const input = parseBackendQuestionInput(request?.body);
        let updated: SurveyQuestion = {
          ...existing,
          kind: input.kind,
          prompt: input.prompt,
          is_required: input.is_required ?? existing.is_required,
          options: input.options ?? existing.options,
          rating_min: input.rating_min ?? existing.rating_min,
          rating_max: input.rating_max ?? existing.rating_max,
          rating_low_label: input.rating_low_label ?? existing.rating_low_label,
          rating_high_label: input.rating_high_label ?? existing.rating_high_label,
          sort_order: input.sort_order ?? existing.sort_order,
        };
        if (input.kind !== 'single_choice' && input.kind !== 'multiple_choice')
          updated = { ...updated, options: null };
        if (input.branch_parent_question_id === null) {
          updated = {
            ...updated,
            branch_depth: 0,
            branch_parent_question_id: null,
            branch_trigger_option_key: null,
          };
        } else if (input.branch_parent_question_id) {
          updated = {
            ...updated,
            branch_depth: 1,
            branch_parent_question_id: input.branch_parent_question_id,
            branch_trigger_option_key:
              input.branch_trigger_option_key ?? existing.branch_trigger_option_key,
          };
        }
        validateBranches(
          [...saved.values()].map((question) => (question.id === questionId ? updated : question)),
        );
        saved.set(questionId, updated);
        return { data: { id: questionId } };
      }

      if (method === 'DELETE' && questionId) {
        if (
          [...saved.values()].some((question) => question.branch_parent_question_id === questionId)
        )
          throw new Error('422: question has branches');
        if (!saved.has(questionId)) throw new Error('404: question not found');
        saved.delete(questionId);
        return { data: { id: questionId } };
      }

      return { data: { id: 'question-1' } };
    },
  );
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

function renderBuilderRouteWithRouter(
  history: RouterHistory = createMemoryHistory({ initialEntries: ['/builder'] }),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  routeQueryStubs.search = { builder: true };
  routeQueryStubs.manageGate = () => ({ canManage: true });
  routeQueryStubs.surveys = () => ({ data: [], isPending: false });
  routeQueryStubs.survey = () => ({
    data: survey,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
  });
  const root = createRootRoute();
  const builder = createRoute({
    getParentRoute: () => root,
    path: '/builder',
    component: SurveyDetailRoute,
  });
  const away = createRoute({
    getParentRoute: () => root,
    path: '/away',
    component: () => <div data-testid="survey-builder-away">away</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([builder, away]),
    history,
  });
  routeQueryStubs.navigate = async (..._args: unknown[]) =>
    router.navigate({ to: '/away' as never });
  return {
    router,
    view: render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('Survey screens', () => {
  afterEach(() => {
    routeQueryStubs.surveys = undefined;
    routeQueryStubs.survey = undefined;
    routeQueryStubs.search = {};
    routeQueryStubs.manageGate = undefined;
    routeQueryStubs.navigate = undefined;
  });

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
    expect(screen.getByText('생성된 Survey가 없습니다.')).toBeInTheDocument();
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

  it('uses localized status tabs, survey creation action, and builder labels', () => {
    const onCreate = vi.fn();
    render(
      <SurveyList
        surveys={[survey]}
        isLoading={false}
        error={null}
        canCreate
        onCreate={onCreate}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /진행 중/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /초안/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /종료됨/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Survey 생성' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('uses localized builder actions, option label, title field, and sync label', () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Survey 시작' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Survey 제목' })).toBeInTheDocument();
    expect(screen.getByText('선택지')).toBeInTheDocument();
    expect(screen.getByText('동기화됨')).toBeInTheDocument();
    expect(screen.getByText('질문 1')).toBeInTheDocument();
  });

  it('renders the builder toolbar in the WorkbenchShell toolbar region', () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    const shell = screen.getByTestId('survey-builder').closest('[data-shell="workbench"]');
    const toolbar = screen.getByTestId('survey-builder-toolbar');
    expect(shell).toBeInTheDocument();
    expect(toolbar).toHaveAttribute('data-shell-header', 'toolbar');
  });

  it('keeps the builder question list scrollable inside the WorkbenchShell body', () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    const questionList = screen.getByTestId('survey-question-row-question-1').closest('section');
    expect(questionList).toHaveClass('min-h-0', 'overflow-y-auto');
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
    ['draft', '초안'],
    ['open', '진행 중'],
    ['closed', '종료됨'],
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
      () => expect(screen.getByText('Survey 목록을 불러오지 못했습니다')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('생성된 Survey가 없습니다.')).toBeInTheDocument();
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
      const label = status === 'open' ? '진행 중' : '종료됨';
      expect(screen.getByText(`${label} 상태 — 질문 변경은 잠겨 있습니다.`)).toBeInTheDocument();
      expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '초안 저장' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Survey 제목')).not.toBeInTheDocument();
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
    expect(screen.getByText('종료됨')).toBeInTheDocument();
    expect(screen.queryByText('closed · discovery')).not.toBeInTheDocument();
    expect(screen.getByText('종료됨 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('closed', { exact: true })).not.toBeInTheDocument();
    builderView.unmount();
    renderDetailWithRouter(closedSurvey, true);
    expect(await screen.findByText('종료됨 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('종료됨')).toBeInTheDocument();
    expect(screen.queryByText('closed', { exact: true })).not.toBeInTheDocument();
  });

  it('starts an editable empty builder with question kind cards and adds the selected kind', () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );

    expect(screen.queryByText('질문 0')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId('survey-question-kind-rating'));

    expect(screen.getByText('질문 1')).toBeInTheDocument();
    expect(screen.getByLabelText('최소 점수')).toBeInTheDocument();
    expect(screen.queryByText('첫 질문을 추가하세요')).not.toBeInTheDocument();
  });

  it.each(surveyQuestionKindSchema.options)(
    'shows the canonical kind label on the first-question card for %s',
    (kind) => {
      renderWithQuery(
        <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
      );

      const card = screen.getByTestId(`survey-question-kind-${kind}`);
      expect(
        within(card).getByText(SURVEY_QUESTION_KIND_LABELS[kind], { exact: true }),
      ).toBeInTheDocument();
    },
  );

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

  it('associates visible labels with the rating bounds', () => {
    const rating = {
      ...question('rating-question', '평가해 주세요', 0),
      kind: 'rating' as const,
      options: null,
      rating_min: 1,
      rating_max: 5,
    };
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [rating] }} canManage onBack={vi.fn()} />,
    );

    const minimum = screen.getByLabelText('최소 점수');
    const maximum = screen.getByLabelText('최대 점수');
    const minimumLabel = screen.getByText('최소 점수', { exact: true });
    const maximumLabel = screen.getByText('최대 점수', { exact: true });

    expect(minimumLabel).toHaveAttribute('for', minimum.id);
    expect(maximumLabel).toHaveAttribute('for', maximum.id);
    expect(minimum).not.toHaveAttribute('aria-label');
    expect(maximum).not.toHaveAttribute('aria-label');
  });

  it('starts new questions and options empty with positional placeholders', () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('survey-question-kind-single_choice'));

    const prompt = screen.getByLabelText('질문 제목');
    expect(prompt).toHaveValue('');
    expect(prompt).toHaveAttribute('placeholder', '질문을 입력하세요');
    expect(screen.getByText('제목 없는 질문')).toBeInTheDocument();
    expect(screen.queryByText(SURVEY_BUILDER_COPY.emptyPrompt)).not.toBeInTheDocument();
    expect(screen.queryByText(SURVEY_BUILDER_COPY.emptyOptionLabel)).not.toBeInTheDocument();

    const firstOption = screen.getByLabelText('옵션 1');
    const secondOption = screen.getByLabelText('옵션 2');
    expect(firstOption).toHaveValue('');
    expect(firstOption).toHaveAttribute('placeholder', '옵션 1');
    expect(secondOption).toHaveValue('');
    expect(secondOption).toHaveAttribute('placeholder', '옵션 2');

    fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
    const thirdOption = screen.getByLabelText('옵션 3');
    expect(thirdOption).toHaveValue('');
    expect(thirdOption).toHaveAttribute('placeholder', '옵션 3');
  });

  it('seeds empty choice options when changing a text question to a choice kind', async () => {
    const textQuestion = {
      ...question('text-question', '자유롭게 적어 주세요', 0),
      kind: 'text' as const,
      options: null,
    };
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [textQuestion] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '질문 유형' }));
    fireEvent.click(
      await screen.findByRole('option', {
        name: SURVEY_QUESTION_KIND_LABELS.single_choice,
      }),
    );

    expect(screen.getByLabelText('옵션 1')).toHaveValue('');
    expect(screen.getByLabelText('옵션 1')).toHaveAttribute('placeholder', '옵션 1');
    expect(screen.getByLabelText('옵션 2')).toHaveValue('');
    expect(screen.getByLabelText('옵션 2')).toHaveAttribute('placeholder', '옵션 2');
    expect(screen.queryByText(SURVEY_BUILDER_COPY.emptyOptionLabel)).not.toBeInTheDocument();
  });

  it('shows existing inline validation and sends no request when saving a fresh question', async () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('survey-question-kind-single_choice'));

    expect(screen.queryByText(SURVEY_BUILDER_COPY.emptyPrompt)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    expect(await screen.findByText(SURVEY_BUILDER_COPY.emptyPrompt)).toBeInTheDocument();
    expect(screen.getAllByText(SURVEY_BUILDER_COPY.emptyOptionLabel)).toHaveLength(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('creates a rating question with its default bounds from an empty builder', async () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('survey-question-kind-rating'));
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '평가해 주세요' } });
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

    expect(screen.queryByText('질문 0')).not.toBeInTheDocument();
    expect(screen.getByText('질문이 없습니다.')).toHaveClass('text-text-muted');
    expect(screen.queryByTestId('survey-question-kind-single_choice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-question-kind-multiple_choice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-question-kind-rating')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-question-kind-text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
  });

  it('renders a survey detail title, type, status, and questions', async () => {
    renderDetailWithRouter(survey, false);

    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.getByText('SRV-1')).toBeInTheDocument();
    expect(screen.getByText('탐색')).toBeInTheDocument();
    expect(screen.getByText('초안')).toBeInTheDocument();
    expect(screen.getByText('담당자 · 담당자 미지정')).toBeInTheDocument();
    expect(screen.getByText('Q1. 도움이 되었나요?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '질문' })).toBeInTheDocument();
  });

  it('puts the Builder action in the header and adds a Builder action to an empty question state', async () => {
    renderDetailWithRouter({ ...survey, questions: [] }, true);

    const header = await screen.findByTestId('detail-panel-header-content');
    expect(within(header).getByRole('link', { name: '질문 편집' })).toHaveAttribute(
      'href',
      '/surveys/survey-1?builder=true',
    );
    expect(screen.getAllByRole('link', { name: '질문 편집' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '새 질문 추가' })).toHaveAttribute(
      'href',
      '/surveys/survey-1?builder=true',
    );
  });

  it.each([
    ['no manage permission', { ...survey, status: 'draft' as const }, false],
    ['non-draft Survey', { ...survey, status: 'open' as const }, true],
  ])('keeps the muted Builder status for %s', async (_label, item, canManage) => {
    renderDetailWithRouter(item, canManage);

    expect(
      await screen.findByText(/질문 변경은 잠겨 있습니다\.|Survey 관리 권한이 없습니다\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '질문 편집' })).not.toBeInTheDocument();
  });

  it('launches a manageable draft survey and returns to detail after success', async () => {
    const onBack = vi.fn();
    apiClient.mockResolvedValue({ data: { ...survey, status: 'open' } });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    expect(await screen.findByTestId('survey-open-confirmation')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('survey-open-confirmation')).getByTestId('survey-status-confirm'),
    );

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('POST', '/surveys/survey-1/open'));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('saves a newly added question before starting the Survey', async () => {
    const serverQuestionIds: string[] = [];
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'POST' && path === '/surveys/survey-1/questions') {
        const id = `server-question-${serverQuestionIds.length + 1}`;
        serverQuestionIds.push(id);
        return { data: { id } };
      }
      if (method === 'POST' && path === '/surveys/survey-1/open') {
        if (serverQuestionIds.length === 0)
          throw {
            status: 422,
            envelope: {
              code: 'validation.failed',
              message: 'survey requires a question',
              detail: { fields: [{ path: ['questions'], code: 'required' }] },
            },
          };
        return { data: { ...survey, status: 'open' } };
      }
      return { data: {} };
    });
    const onBack = vi.fn();
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={onBack} />,
    );

    fireEvent.click(screen.getByTestId('survey-question-kind-single_choice'));
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '추가 질문' } });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(serverQuestionIds).toEqual(['server-question-1']);
    expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(1);
    expect(
      screen.queryByText('Survey 시작 전에 질문을 하나 이상 추가해야 합니다.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the start confirmation open when saving the draft fails', async () => {
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'POST' && path === '/surveys/survey-1/questions')
        throw new Error('question save failed');
      return { data: {} };
    });
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('survey-question-kind-single_choice'));
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '추가 질문' } });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    expect(await screen.findByText('저장하지 못해 시작하지 않았습니다.')).toBeInTheDocument();
    expect(screen.getByTestId('survey-open-confirmation')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(0);
  });

  it('hides Launch when the builder survey is open', async () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, status: 'open' }} canManage onBack={vi.fn()} />,
    );

    await screen.findByTestId('survey-builder');
    expect(screen.queryByRole('button', { name: 'Survey 시작' })).not.toBeInTheDocument();
  });

  it('hides Launch without survey.manage even for a draft survey', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage={false} onBack={vi.fn()} />);

    await screen.findByTestId('survey-builder');
    expect(screen.queryByRole('button', { name: 'Survey 시작' })).not.toBeInTheDocument();
  });

  it('disables Survey start and explains how to proceed when there are no questions', () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );

    const startButton = screen.getByRole('button', { name: 'Survey 시작' });
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAccessibleDescription('시작하려면 질문을 하나 이상 추가하세요.');
  });

  it('keeps an untouched empty draft clean', () => {
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
    );

    expect(screen.queryByText('저장되지 않은 변경 사항')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled();
  });

  it.each(['back button', 'router navigation'] as const)(
    'asks before leaving a dirty Survey builder through %s',
    async (departure) => {
      const { router } = renderBuilderRouteWithRouter();
      await screen.findByTestId('survey-builder');
      fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
        target: { value: '수정한 제목' },
      });

      const navigateAway = async () => {
        if (departure === 'back button') {
          fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
        } else {
          await act(async () => {
            void router.navigate({ to: '/away' as never });
            await Promise.resolve();
          });
        }
      };
      await navigateAway();

      expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
      await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).toBeNull());
      expect(screen.getByTestId('survey-builder')).toBeInTheDocument();

      await navigateAway();
      expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '이동' }));
      expect(await screen.findByTestId('survey-builder-away')).toBeInTheDocument();
    },
  );

  it.each([
    ['clean', false],
    ['dirty', true],
  ] as const)('blocks browser unload only when the builder is %s', async (_state, isDirty) => {
    const initialUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(null, '', '/builder');
    const browserHistory = createBrowserHistory();
    const { router, view } = renderBuilderRouteWithRouter(browserHistory);

    try {
      await screen.findByTestId('survey-builder');
      if (isDirty) {
        fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
          target: { value: '수정한 제목' },
        });
      }

      const beforeUnload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(beforeUnload);

      expect(beforeUnload.defaultPrevented).toBe(isDirty);
    } finally {
      view.unmount();
      router.history.destroy();
      window.history.replaceState(null, '', initialUrl);
    }
  });

  it.each(['saved draft', 'started Survey'] as const)(
    'leaves without a dirty warning after a successful %s',
    async (action) => {
      const { router } = renderBuilderRouteWithRouter();
      await screen.findByTestId('survey-builder');
      fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
        target: { value: '저장할 제목' },
      });

      if (action === 'saved draft') {
        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled(),
        );
        await act(async () => {
          void router.navigate({ to: '/away' as never });
          await Promise.resolve();
        });
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
        fireEvent.click(
          within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
            'survey-status-confirm',
          ),
        );
      }

      expect(await screen.findByTestId('survey-builder-away')).toBeInTheDocument();
      expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument();
      expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(1);
      if (action === 'started Survey')
        expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(1);
    },
  );

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

    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );

    expect(
      await screen.findByText('이 Survey는 더 이상 시작할 수 없는 상태입니다.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Survey 시작 전에 질문을 하나 이상 추가해야 합니다.'),
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

    fireEvent.click(await screen.findByRole('button', { name: 'Survey 종료' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-close-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );
    expect(
      await screen.findByText('이 Survey는 더 이상 종료할 수 없는 상태입니다.'),
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
    expect(screen.queryByRole('button', { name: 'Survey 종료' })).not.toBeInTheDocument();
  });

  it('hides Close survey for a manageable closed survey', async () => {
    renderDetailWithRouter({ ...survey, status: 'closed' }, true);
    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('button', { name: 'Survey 종료' })).not.toBeInTheDocument();
  });

  it('hides Close survey for an open survey without management permission', async () => {
    renderDetailWithRouter({ ...survey, status: 'open' }, false);
    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('button', { name: 'Survey 종료' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
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
    expect(screen.getByTestId('survey-row-survey-1')).toHaveTextContent('진행 중');
  });

  it.each(['open', 'closed'] as const)(
    'links %s surveys to their result summary',
    async (status) => {
      renderDetailWithRouter({ ...survey, status }, true);

      const link = await screen.findByRole('link', { name: '결과 요약 보기' });
      expect(link).toHaveAttribute('href', '/surveys/survey-1/results');
    },
  );

  it('does not link a draft survey to unavailable results', async () => {
    renderDetailWithRouter(survey, true);

    await screen.findByTestId('survey-detail');
    expect(screen.queryByRole('link', { name: '결과 요약 보기' })).not.toBeInTheDocument();
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

  it('keeps real builder title and question edits after opening and closing preview', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
      target: { value: '저장 전 제목' },
    });
    fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
      target: { value: '저장 전 질문' },
    });

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('dialog', { name: '응답자 미리보기' });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Survey 제목' })).toHaveValue('저장 전 제목');
    expect(screen.getByDisplayValue('저장 전 질문')).toBeInTheDocument();
    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled();
  });

  it('keeps a title edit made during save dirty and sends it on the next save', async () => {
    let resolveFirstPatch!: (value: { data: Survey }) => void;
    const firstPatch = new Promise<{ data: Survey }>((resolve) => {
      resolveFirstPatch = resolve;
    });
    let surveyPatchCount = 0;
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'PATCH' && path === '/surveys/survey-1') {
        surveyPatchCount += 1;
        if (surveyPatchCount === 1) return firstPatch;
      }
      return { data: survey };
    });
    const { router } = renderBuilderRouteWithRouter();
    await screen.findByTestId('survey-builder');

    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
      target: { value: '첫 번째 저장 제목' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(1));
    expect(calls('PATCH', '/surveys/survey-1')[0]?.[2].body).toEqual({
      title: '첫 번째 저장 제목',
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
      target: { value: '저장 중 바꾼 제목' },
    });
    await act(async () => resolveFirstPatch({ data: survey }));

    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    await act(async () => {
      void router.navigate({ to: '/away' as never });
      await Promise.resolve();
    });
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(2));
    expect(calls('PATCH', '/surveys/survey-1')[1]?.[2].body).toEqual({
      title: '저장 중 바꾼 제목',
    });
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());

    await act(async () => {
      void router.navigate({ to: '/away' as never });
      await Promise.resolve();
    });
    expect(await screen.findByTestId('survey-builder-away')).toBeInTheDocument();
  });

  it('re-saves a title edit left dirty by an earlier save before launching', async () => {
    let resolveFirstPatch!: (value: { data: Survey }) => void;
    const firstPatch = new Promise<{ data: Survey }>((resolve) => {
      resolveFirstPatch = resolve;
    });
    let resolveSecondPatch!: (value: { data: Survey }) => void;
    const secondPatch = new Promise<{ data: Survey }>((resolve) => {
      resolveSecondPatch = resolve;
    });
    let surveyPatchCount = 0;
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'PATCH' && path === '/surveys/survey-1') {
        surveyPatchCount += 1;
        if (surveyPatchCount === 1) return firstPatch;
        if (surveyPatchCount === 2) return secondPatch;
      }
      if (method === 'POST' && path === '/surveys/survey-1/open')
        return { data: { ...survey, status: 'open' } };
      return { data: survey };
    });
    const onBack = vi.fn();
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={onBack} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
      target: { value: '시작 전 저장 제목' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(1));

    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
      target: { value: '저장 중 수정한 제목' },
    });
    await act(async () => resolveFirstPatch({ data: survey }));
    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );
    await waitFor(() => expect(calls('PATCH', '/surveys/survey-1')).toHaveLength(2));
    expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(0);
    expect(calls('PATCH', '/surveys/survey-1')[1]?.[2].body).toEqual({
      title: '저장 중 수정한 제목',
    });
    await act(async () => resolveSecondPatch({ data: survey }));
    await waitFor(() => expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(1));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps an edit made after its question loop finishes dirty until the next save', async () => {
    let resolveSecondQuestionPatch!: (value: { data: { id: string } }) => void;
    const secondQuestionPatch = new Promise<{ data: { id: string } }>((resolve) => {
      resolveSecondQuestionPatch = resolve;
    });
    const secondQuestion = question('question-2', '다음 질문', 1);
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (method === 'PATCH' && path === '/surveys/survey-1/questions/question-2')
        return secondQuestionPatch;
      return { data: { id: path.endsWith('question-1') ? 'question-1' : 'question-2' } };
    });
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [...(survey.questions ?? []), secondQuestion] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('도움이 되었나요?'), {
      target: { value: '첫 질문 저장 값' },
    });
    fireEvent.click(screen.getByText('Q2'));
    fireEvent.change(screen.getByDisplayValue('다음 질문'), {
      target: { value: '두 번째 질문 저장 값' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-2')).toHaveLength(1),
    );

    fireEvent.click(screen.getByText('Q1'));
    fireEvent.change(screen.getByDisplayValue('첫 질문 저장 값'), {
      target: { value: '첫 질문 저장 중 수정 값' },
    });
    await act(async () => resolveSecondQuestionPatch({ data: { id: 'question-2' } }));

    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(2),
    );
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')[1]?.[2].body).toMatchObject({
      prompt: '첫 질문 저장 중 수정 값',
    });
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());
  });

  it('adds a choice option with a unique key and saves a valid question input', async () => {
    const initialOptions = survey.questions?.[0]?.options ?? [];
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
    expect(screen.getByLabelText('옵션 3')).toHaveValue('');
    expect(screen.getByLabelText('옵션 3')).toHaveAttribute('placeholder', '옵션 3');
    fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '기타' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(1),
    );
    const sentBody = calls('PATCH', '/surveys/survey-1/questions/question-1')[0]?.[2].body;
    const parsed = parseBackendQuestionInput(sentBody);
    const options = parsed.options ?? [];

    expect(options).toHaveLength(3);
    expect(options.slice(0, 2).map((option) => option.key)).toEqual(
      initialOptions.map((option) => option.key),
    );
    expect(options[2]?.label).toBe('기타');
    expect(new Set(options.map((option) => option.key)).size).toBe(3);
  });

  it.each([
    [
      'getRandomValues only',
      {
        getRandomValues: (values: Uint32Array) => {
          values.set([1, 2, 3, 4]);
          return values;
        },
      },
    ],
    ['crypto unavailable', undefined],
  ] as const)('adds an option when %s', async (_label, cryptoValue) => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    let unmount: (() => void) | undefined;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: cryptoValue,
      });
      unmount = renderWithQuery(
        <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />,
      ).unmount;
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '기타' } });
      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

      await waitFor(() =>
        expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(1),
      );
      const sentBody = calls('PATCH', '/surveys/survey-1/questions/question-1')[0]?.[2].body;
      const parsed = parseBackendQuestionInput(sentBody);
      expect(parsed.options).toHaveLength(3);
    } finally {
      unmount?.();
      if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it.each([
    [
      'getRandomValues only',
      {
        getRandomValues: (values: Uint32Array) => {
          values.set([1, 2, 3, 4]);
          return values;
        },
      },
    ],
    ['crypto unavailable', undefined],
  ] as const)('W-823 adds questions with unique ids when %s', (_label, cryptoValue) => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    let unmount: (() => void) | undefined;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: cryptoValue,
      });
      unmount = renderWithQuery(
        <SurveyBuilder survey={{ ...survey, questions: [] }} canManage onBack={vi.fn()} />,
      ).unmount;

      fireEvent.click(screen.getByTestId('survey-question-kind-single_choice'));
      fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));

      const ids = screen
        .getAllByTestId(/^survey-question-row-/)
        .map((row) => row.getAttribute('data-testid')?.replace('survey-question-row-', ''));
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    } finally {
      unmount?.();
      if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('removes options down to two while preserving the remaining keys', async () => {
    const parent = survey.questions?.[0] as SurveyQuestion;
    const initialOptions = [...(parent.options ?? []), { key: 'maybe', label: '잘 모르겠어요' }];
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [{ ...parent, options: initialOptions }] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '옵션 3 삭제' }));
    expect(screen.getByLabelText('옵션 1')).toHaveValue('예');
    expect(screen.getByLabelText('옵션 2')).toHaveValue('아니오');
    expect(screen.getByRole('button', { name: '옵션 1 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '옵션 2 삭제' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(1),
    );
    const sentBody = calls('PATCH', '/surveys/survey-1/questions/question-1')[0]?.[2].body;
    const parsed = parseBackendQuestionInput(sentBody);
    expect(parsed.options?.map((option) => option.key)).toEqual(
      initialOptions.slice(0, 2).map((option) => option.key),
    );
  });

  it('shows empty option errors and blocks saving or launching invalid questions', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '   ' } });
    expect(screen.queryByText('옵션을 입력하세요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(await screen.findByText('옵션을 입력하세요.')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(0);
    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
    fireEvent.click(
      within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
        'survey-status-confirm',
      ),
    );
    expect(await screen.findByText('빈 옵션을 채운 후 다시 시작하세요.')).toBeInTheDocument();
    expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(0);
    expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(0);
  });

  it('resets question validation errors after a successful draft save', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('질문 제목'), {
      target: { value: '업데이트된 질문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() =>
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
    expect(screen.queryByText('질문을 입력하세요.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('질문 제목')).toHaveAttribute('aria-invalid', 'false');

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(await screen.findByText('질문을 입력하세요.')).toBeInTheDocument();
    expect(calls('POST', '/surveys/survey-1/questions')).toHaveLength(0);
  });

  it.each(['draft-save', 'launch'] as const)(
    'selects the first question with a blank option on %s',
    async (action) => {
      const parent = survey.questions?.[0] as SurveyQuestion;
      const second: SurveyQuestion = {
        ...parent,
        id: 'question-2',
        prompt: '다음 질문',
        sort_order: 1,
      };
      renderWithQuery(
        <SurveyBuilder
          survey={{ ...survey, questions: [parent, second] }}
          canManage
          onBack={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Q2'));
      if (action === 'draft-save') {
        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
        fireEvent.click(
          within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
            'survey-status-confirm',
          ),
        );
      }

      await waitFor(() => expect(screen.getByLabelText('질문 제목')).toHaveValue(parent.prompt));
      expect(await screen.findByText('옵션을 입력하세요.')).toBeInTheDocument();
    },
  );

  it.each(['draft-save', 'launch'] as const)(
    'W-823 rejects whitespace-only prompts before %s and selects the first invalid question',
    async (action) => {
      const first = survey.questions?.[0] as SurveyQuestion;
      const second = { ...question('question-2', '다음 질문', 1) };
      renderWithQuery(
        <SurveyBuilder
          survey={{ ...survey, questions: [first, second] }}
          canManage
          onBack={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Q2'));
      if (action === 'draft-save') {
        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
        await act(async () => {
          await Promise.resolve();
        });
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
        fireEvent.click(
          within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
            'survey-status-confirm',
          ),
        );
      }

      const firstRow = screen.getByTestId('survey-question-row-question-1');
      const secondRow = screen.getByTestId('survey-question-row-question-2');
      expect(firstRow).toHaveClass('bg-surface-card');
      expect(secondRow).not.toHaveClass('bg-surface-card');
      expect(screen.getByLabelText('질문 제목')).toHaveValue('   ');
      expect(screen.getByLabelText('질문 제목')).toHaveAttribute('aria-invalid', 'true');
      expect(await screen.findByText('질문을 입력하세요.')).toBeInTheDocument();
      expect(calls('PATCH', '/surveys/survey-1/questions/question-1')).toHaveLength(0);
      expect(calls('PATCH', '/surveys/survey-1/questions/question-2')).toHaveLength(0);
      expect(calls('POST', '/surveys/survey-1/open')).toHaveLength(0);
      expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
      if (action === 'launch') {
        expect(screen.queryByTestId('survey-open-confirmation')).not.toBeInTheDocument();
        expect(screen.queryByText('빈 옵션을 채운 후 다시 시작하세요.')).not.toBeInTheDocument();
      }
    },
  );

  it('W-823 blocks changing a branch parent to multiple choice and saves only backend-valid bodies', async () => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const childId = '22222222-2222-4222-8222-222222222222';
    const parent = { ...(survey.questions?.[0] as SurveyQuestion), id: parentId };
    const child: SurveyQuestion = {
      ...parent,
      id: childId,
      prompt: '추가 질문',
      branch_depth: 1,
      branch_parent_question_id: parentId,
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    const initialQuestions = [parent, child];
    installQuestionServerOracle(initialQuestions);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: initialQuestions }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '질문 유형' }));
    fireEvent.click(
      await screen.findByRole('option', { name: SURVEY_QUESTION_KIND_LABELS.multiple_choice }),
    );

    expect(
      await screen.findByText('분기 질문이 있으면 복수 선택으로 바꿀 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '질문 유형' })).toHaveTextContent(
      SURVEY_QUESTION_KIND_LABELS.single_choice,
    );

    fireEvent.click(screen.getByText('Q2'));
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: '분기 없음' }));
    fireEvent.click(screen.getByText('Q1'));

    expect(
      screen.queryByText('분기 질문이 있으면 복수 선택으로 바꿀 수 없습니다.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '질문 유형' })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );

    fireEvent.click(screen.getByText('Q2'));
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '수정한 추가 질문' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled());
    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    const childPatch = calls('PATCH', `/surveys/${survey.id}/questions/${childId}`)[0]?.[2].body;
    expect(parseBackendQuestionInput(childPatch).prompt).toBe('수정한 추가 질문');
    expect(calls('PATCH', `/surveys/${survey.id}/questions/${parentId}`)).toHaveLength(0);
  });

  it('W-827 excludes in-session children from parent choices while allowing multiple children', async () => {
    const parent = survey.questions?.[0] as SurveyQuestion;
    const parentLabel = `Q${parent.sort_order + 1} · ${parent.prompt}`;
    const child: SurveyQuestion = {
      ...parent,
      id: 'question-2',
      prompt: '첫 번째 조건부 질문',
      sort_order: 1,
    };
    const candidate = question('question-3', '추가 질문', 2);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [parent, child, candidate] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Q2'));
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: parentLabel }));

    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    const currentParent = await screen.findByRole('option', { name: parentLabel });
    expect(currentParent).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('option', { name: parentLabel })).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByText('Q3'));
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));

    expect(screen.getByRole('option', { name: parentLabel })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: child.prompt })).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByText('Q1'));
    expect(screen.queryByRole('combobox', { name: '분기 부모 질문' })).not.toBeInTheDocument();
  });

  it.each([
    ['changes its parent to text', 'change-kind'],
    ['removes its trigger option', 'remove-trigger'],
  ] as const)('W-827 deletes a removed branch child before it %s', async (_label, change) => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const childId = '22222222-2222-4222-8222-222222222222';
    const parent = { ...(survey.questions?.[0] as SurveyQuestion), id: parentId };
    const child: SurveyQuestion = {
      ...parent,
      id: childId,
      prompt: '조건부 질문',
      branch_depth: 1,
      branch_parent_question_id: parentId,
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    installQuestionServerOracle([parent, child]);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [parent, child] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId(`survey-question-row-${childId}`)).getByLabelText('Q2 질문 삭제'),
    );
    if (change === 'change-kind') {
      fireEvent.click(screen.getByRole('combobox', { name: '질문 유형' }));
      fireEvent.click(
        await screen.findByRole('option', { name: SURVEY_QUESTION_KIND_LABELS.text }),
      );
    } else {
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '기타' } });
      fireEvent.click(screen.getByRole('button', { name: '옵션 2 삭제' }));
    }
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() => {
      const saveComplete =
        screen.queryByText(/^저장 시각 /) !== null ||
        screen.queryByText('저장하지 못했습니다.') !== null;
      expect(saveComplete).toBe(true);
    });
    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    const deleteIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'DELETE' && call[1] === `/surveys/${survey.id}/questions/${childId}`,
    );
    const parentPatchIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'PATCH' && call[1] === `/surveys/${survey.id}/questions/${parentId}`,
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(parentPatchIndex).toBeGreaterThan(deleteIndex);
  });

  it('W-827 deletes a newly saved child before deleting its parent', async () => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const parent = { ...(survey.questions?.[0] as SurveyQuestion), id: parentId };
    installQuestionServerOracle([parent]);
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [parent] }} canManage onBack={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '조건부 질문' } });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: `Q1 · ${parent.prompt}` }));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());

    const childPath = `/surveys/${survey.id}/questions/${SERVER_CREATED_QUESTION_ID}`;
    fireEvent.click(
      within(
        screen.getByTestId(`survey-question-row-${SERVER_CREATED_QUESTION_ID}`),
      ).getByLabelText('Q2 질문 삭제'),
    );
    fireEvent.click(
      within(screen.getByTestId(`survey-question-row-${parentId}`)).getByLabelText('Q1 질문 삭제'),
    );
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() => {
      const saveComplete =
        calls('PATCH', `/surveys/${survey.id}/questions/reorder`).length === 2 ||
        screen.queryByText('저장하지 못했습니다.') !== null;
      expect(saveComplete).toBe(true);
    });
    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    const childDeleteIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'DELETE' && call[1] === childPath,
    );
    const parentDeleteIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'DELETE' && call[1] === `/surveys/${survey.id}/questions/${parentId}`,
    );
    expect(childDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(parentDeleteIndex).toBeGreaterThan(childDeleteIndex);
  });

  it('W-827 confirms and detaches children before deleting their parent', async () => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const childId = '22222222-2222-4222-8222-222222222222';
    const parent = { ...(survey.questions?.[0] as SurveyQuestion), id: parentId };
    const child: SurveyQuestion = {
      ...parent,
      id: childId,
      prompt: '조건부 질문',
      branch_depth: 1,
      branch_parent_question_id: parentId,
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    installQuestionServerOracle([parent, child]);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [parent, child] }}
        canManage
        onBack={vi.fn()}
      />,
    );

    const parentRow = screen.getByTestId(`survey-question-row-${parentId}`);
    fireEvent.click(within(parentRow).getByLabelText('Q1 질문 삭제'));
    const confirmation = await screen.findByRole('dialog');
    expect(confirmation).toHaveTextContent('1개 질문의 분기 조건이 해제됩니다.');
    fireEvent.click(within(confirmation).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls('PATCH', `/surveys/${survey.id}/questions/${childId}`)).toHaveLength(0);
    expect(calls('DELETE', `/surveys/${survey.id}/questions/${parentId}`)).toHaveLength(0);
    fireEvent.click(screen.getByText('Q2'));
    expect(screen.getByRole('combobox', { name: '분기 부모 질문' })).toHaveTextContent(
      parent.prompt,
    );

    fireEvent.click(within(parentRow).getByLabelText('Q1 질문 삭제'));
    const secondConfirmation = await screen.findByRole('dialog');
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: '삭제' }));
    expect(screen.queryByTestId(`survey-question-row-${parentId}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`survey-question-row-${childId}`)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '분기 부모 질문' })).toHaveTextContent('분기 없음');

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());

    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    const childPatches = calls('PATCH', `/surveys/${survey.id}/questions/${childId}`);
    expect(childPatches).toHaveLength(1);
    expect(childPatches[0]?.[2].body).toMatchObject({ branch_parent_question_id: null });
    const childPatchIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'PATCH' && call[1] === `/surveys/${survey.id}/questions/${childId}`,
    );
    const parentDeleteIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === 'DELETE' && call[1] === `/surveys/${survey.id}/questions/${parentId}`,
    );
    expect(childPatchIndex).toBeGreaterThanOrEqual(0);
    expect(parentDeleteIndex).toBeGreaterThan(childPatchIndex);
  });

  it.each(['draft-save', 'launch'] as const)(
    'W-827 blocks a whitespace-only Survey title before %s',
    async (action) => {
      renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
      const titleInput = screen.getByRole('textbox', { name: 'Survey 제목' });
      fireEvent.change(titleInput, { target: { value: '   ' } });

      expect(titleInput).toHaveAttribute('aria-invalid', 'true');
      expect(titleInput).toHaveAccessibleDescription('Survey 제목을 입력하세요.');

      if (action === 'draft-save') {
        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
        fireEvent.click(
          within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
            'survey-status-confirm',
          ),
        );
        await waitFor(() => expect(screen.queryByTestId('survey-open-confirmation')).toBeNull());
      }

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('Survey 제목을 입력하세요.')).toBeInTheDocument();
      expect(calls('PATCH', `/surveys/${survey.id}`)).toHaveLength(0);
      expect(calls('PATCH', `/surveys/${survey.id}/questions/question-1`)).toHaveLength(0);
      expect(calls('POST', `/surveys/${survey.id}/open`)).toHaveLength(0);
      expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['empty minimum', '최소 점수', '', 'draft-save'],
    ['decimal minimum', '최소 점수', '1.5', 'draft-save'],
    ['minimum not below maximum', '최소 점수', '6', 'draft-save'],
    ['minimum below zero', '최소 점수', '-1', 'draft-save'],
    ['maximum above ten', '최대 점수', '11', 'draft-save'],
    ['empty minimum', '최소 점수', '', 'launch'],
    ['decimal minimum', '최소 점수', '1.5', 'launch'],
    ['minimum not below maximum', '최소 점수', '6', 'launch'],
    ['minimum below zero', '최소 점수', '-1', 'launch'],
    ['maximum above ten', '최대 점수', '11', 'launch'],
  ] as const)(
    'W-827 blocks an invalid rating range (%s) and selects that question',
    async (_label, fieldLabel, value, action) => {
      const first = survey.questions?.[0] as SurveyQuestion;
      const rating: SurveyQuestion = {
        ...first,
        id: 'question-2',
        prompt: '만족도',
        kind: 'rating',
        options: null,
        rating_min: 1,
        rating_max: 5,
        sort_order: 1,
      };
      const third = question('question-3', '추가 질문', 2);
      renderWithQuery(
        <SurveyBuilder
          survey={{ ...survey, questions: [first, rating, third] }}
          canManage
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText('Q2'));
      fireEvent.change(screen.getByLabelText(fieldLabel), { target: { value } });
      fireEvent.click(screen.getByText('Q3'));
      if (action === 'draft-save') {
        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Survey 시작' }));
        fireEvent.click(
          within(await screen.findByTestId('survey-open-confirmation')).getByTestId(
            'survey-status-confirm',
          ),
        );
        await waitFor(() => expect(screen.queryByTestId('survey-open-confirmation')).toBeNull());
      }

      expect(await screen.findByText(SURVEY_BUILDER_COPY.ratingRange)).toBeInTheDocument();
      expect(screen.getByTestId('survey-question-row-question-2')).toHaveClass('bg-surface-card');
      expect(screen.getByLabelText('최소 점수')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('최대 점수')).toHaveAttribute('aria-invalid', 'true');
      await act(async () => {
        await Promise.resolve();
      });
      expect(apiClient).not.toHaveBeenCalled();
      expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    },
  );

  it('W-827 saves a valid rating range and marks the builder clean', async () => {
    const ratingId = '11111111-1111-4111-8111-111111111111';
    const rating: SurveyQuestion = {
      ...(survey.questions?.[0] as SurveyQuestion),
      id: ratingId,
      prompt: '만족도',
      kind: 'rating',
      options: null,
      rating_min: 1,
      rating_max: 5,
    };
    installQuestionServerOracle([rating]);
    renderWithQuery(
      <SurveyBuilder survey={{ ...survey, questions: [rating] }} canManage onBack={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('최소 점수'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('최대 점수'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());
    expect(calls('PATCH', `/surveys/${survey.id}/questions/${ratingId}`)).toHaveLength(1);
    expect(
      parseBackendQuestionInput(
        calls('PATCH', `/surveys/${survey.id}/questions/${ratingId}`)[0]?.[2].body,
      ),
    ).toMatchObject({ rating_min: 0, rating_max: 10 });
  });

  it.each([
    ['creates a new child branching on a newly added option', 'new-child'],
    ['moves a saved child to a newly added option', 'saved-child'],
    ['re-points a saved child after removing its trigger option', 'saved-trigger'],
    ['clears every child branch before changing its parent to text', 'clear-branch'],
  ] as const)('saves valid branch states when it %s', async (_label, flow) => {
    const parentId = '11111111-1111-4111-8111-111111111111';
    const childId = '22222222-2222-4222-8222-222222222222';
    const baseParent = {
      ...(survey.questions?.[0] as SurveyQuestion),
      id: parentId,
    };
    const child: SurveyQuestion = {
      ...baseParent,
      id: childId,
      prompt: '추가 질문',
      branch_depth: 1,
      branch_parent_question_id: parentId,
      branch_trigger_option_key: 'no',
      sort_order: 1,
    };
    const initialQuestions = flow === 'new-child' ? [baseParent] : [baseParent, child];
    installQuestionServerOracle(initialQuestions);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: initialQuestions }}
        canManage
        onBack={vi.fn()}
      />,
    );

    if (flow === 'new-child') {
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '옵션 3' } });
      fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
      fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '새 분기 질문' } });
      fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '조건 충족' } });
      fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '조건 미충족' } });
      fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
      fireEvent.click(await screen.findByRole('option', { name: `Q1 · ${baseParent.prompt}` }));
      fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));
      fireEvent.click(await screen.findByRole('option', { name: '옵션 3' }));
    } else if (flow === 'saved-child') {
      const branchNotice = screen.getByText(
        '분기 조건으로 사용 중인 옵션을 삭제하면 첫 번째 남은 옵션으로 변경됩니다.',
      );
      expect(branchNotice).toHaveAttribute('id');
      expect(screen.getByRole('button', { name: '옵션 2 삭제' })).toHaveAttribute(
        'aria-describedby',
        branchNotice.getAttribute('id'),
      );
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '옵션 3' } });
      fireEvent.click(screen.getByRole('button', { name: '옵션 2 삭제' }));
      fireEvent.click(screen.getByText('Q2'));
      fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));
      fireEvent.click(await screen.findByRole('option', { name: '옵션 3' }));
    } else if (flow === 'saved-trigger') {
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '옵션 3' } });
      fireEvent.click(screen.getByRole('button', { name: '옵션 2 삭제' }));
    } else {
      fireEvent.click(screen.getByRole('combobox', { name: '질문 유형' }));
      fireEvent.click(
        await screen.findByRole('option', { name: SURVEY_QUESTION_KIND_LABELS.text }),
      );
      expect(
        screen.queryByText(
          '분기 조건으로 사용 중인 옵션을 삭제하면 첫 번째 남은 옵션으로 변경됩니다.',
        ),
      ).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    const childPath = `/surveys/${survey.id}/questions/${flow === 'new-child' ? SERVER_CREATED_QUESTION_ID : childId}`;
    await waitFor(() => {
      const saveComplete =
        screen.getByRole('button', { name: '초안 저장' }).hasAttribute('disabled') ||
        screen.queryByText('저장하지 못했습니다.') !== null;
      expect(saveComplete).toBe(true);
    });

    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
    const childPatches = calls('PATCH', childPath);
    expect(childPatches.length).toBeGreaterThan(0);
    const finalChildBody = childPatches.at(-1)?.[2].body;

    if (flow === 'new-child') {
      const createBody = calls('POST', `/surveys/${survey.id}/questions`)[0]?.[2].body;
      expect(createBody).not.toHaveProperty('branch_parent_question_id');
      expect(createBody).not.toHaveProperty('branch_trigger_option_key');
    }

    if (flow === 'clear-branch') {
      expect(childPatches).toHaveLength(1);
      expect(finalChildBody).toMatchObject({ branch_parent_question_id: null });
    } else if (flow === 'saved-trigger') {
      expect(childPatches).toHaveLength(1);
      expect(finalChildBody).toMatchObject({ branch_trigger_option_key: 'yes' });
    } else {
      const parentBody = calls('PATCH', `/surveys/${survey.id}/questions/${parentId}`).at(-1)?.[2]
        .body;
      const addedKey = (parentBody as { options: Array<{ key: string }> }).options.at(-1)?.key;
      expect(finalChildBody).toMatchObject({
        branch_parent_question_id: parentId,
        branch_trigger_option_key: addedKey,
      });
    }

    const callIndex = (method: string, path: string, last = false) => {
      const matches = apiClient.mock.calls
        .map((call, index) => ({ call, index }))
        .filter(({ call }) => call[0] === method && call[1] === path);
      return matches[last ? matches.length - 1 : 0]?.index ?? -1;
    };
    const firstChildPatchIndex = callIndex('PATCH', childPath);
    const finalChildPatchIndex = callIndex('PATCH', childPath, true);
    const parentPatchIndex = callIndex('PATCH', `/surveys/${survey.id}/questions/${parentId}`);
    if (flow === 'saved-child') {
      expect(childPatches[0]?.[2].body).toMatchObject({ branch_parent_question_id: null });
      expect(firstChildPatchIndex).toBeLessThan(parentPatchIndex);
      expect(finalChildPatchIndex).toBeGreaterThan(parentPatchIndex);
    } else if (flow === 'clear-branch') {
      expect(firstChildPatchIndex).toBeLessThan(parentPatchIndex);
    } else if (flow === 'saved-trigger') {
      expect(firstChildPatchIndex).toBeLessThan(parentPatchIndex);
    } else {
      expect(firstChildPatchIndex).toBeGreaterThanOrEqual(0);
      expect(firstChildPatchIndex).toBeGreaterThan(parentPatchIndex);
    }
  });

  it.each([
    ['new D selects cleared C', 'new', false],
    ['saved D sorts before cleared C', 'saved', false],
    ['retry after C PATCH fails once', 'saved', true],
  ] as const)(
    'W-829 saves when %s becomes a branch parent in the same session',
    async (_label, downstreamKind, rejectFirstParentPatch) => {
      const rootParentId = '11111111-1111-4111-8111-111111111111';
      const clearedParentId = '22222222-2222-4222-8222-222222222222';
      const savedDownstreamId = '44444444-4444-4444-8444-444444444444';
      const rootParent: SurveyQuestion = {
        ...(survey.questions?.[0] as SurveyQuestion),
        id: rootParentId,
        prompt: '기준 질문',
        sort_order: downstreamKind === 'saved' ? 1 : 0,
      };
      const clearedParent: SurveyQuestion = {
        ...rootParent,
        id: clearedParentId,
        prompt: '기존 분기 질문',
        branch_depth: 1,
        branch_parent_question_id: rootParentId,
        branch_trigger_option_key: 'no',
        sort_order: downstreamKind === 'saved' ? 2 : 1,
      };
      const savedDownstream: SurveyQuestion = {
        ...rootParent,
        id: savedDownstreamId,
        prompt: '후속 질문',
        sort_order: 0,
      };
      const initialQuestions =
        downstreamKind === 'saved'
          ? [savedDownstream, rootParent, clearedParent]
          : [rootParent, clearedParent];
      installQuestionServerOracle(initialQuestions, {
        ...(rejectFirstParentPatch ? { rejectFirstPatchFor: clearedParentId } : {}),
      });
      renderWithQuery(
        <SurveyBuilder
          survey={{ ...survey, questions: initialQuestions }}
          canManage
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText(clearedParent.prompt));
      fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
      fireEvent.click(await screen.findByRole('option', { name: '분기 없음' }));

      if (downstreamKind === 'new') {
        fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
        // #831: new questions start blank; fill them so the draft is valid.
        fireEvent.change(screen.getByLabelText('질문 제목'), {
          target: { value: '새 하위 질문 D' },
        });
        fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
        fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
      } else {
        fireEvent.click(screen.getByText(savedDownstream.prompt));
      }
      fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
      fireEvent.click(
        await screen.findByRole('option', {
          name: (name) => name.endsWith(` · ${clearedParent.prompt}`),
        }),
      );

      const downstreamId =
        downstreamKind === 'new' ? SERVER_CREATED_QUESTION_ID : savedDownstreamId;
      const downstreamPath = `/surveys/${survey.id}/questions/${downstreamId}`;
      const clearedParentPath = `/surveys/${survey.id}/questions/${clearedParentId}`;

      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      if (rejectFirstParentPatch) {
        expect(await screen.findByText('저장하지 못했습니다.')).toBeInTheDocument();
        const rejectedParentPatch = calls('PATCH', clearedParentPath);
        expect(rejectedParentPatch).toHaveLength(1);
        expect(rejectedParentPatch[0]?.[2].body).toMatchObject({
          branch_parent_question_id: null,
        });

        fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      }
      await screen.findByText(/^저장 시각 /);

      expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
      const downstreamPatches = calls('PATCH', downstreamPath);
      expect(downstreamPatches.length).toBeGreaterThan(0);
      const finalDownstreamBody = downstreamPatches.at(-1)?.[2].body;
      expect(parseBackendQuestionInput(finalDownstreamBody)).toMatchObject({
        branch_parent_question_id: clearedParentId,
        branch_trigger_option_key: 'yes',
      });

      const indexedCalls = apiClient.mock.calls.map((call, index) => ({ call, index }));
      const clearedParentPatchIndex =
        indexedCalls
          .filter(
            ({ call }) =>
              call[0] === 'PATCH' &&
              call[1] === clearedParentPath &&
              (call[2].body as { branch_parent_question_id?: string | null })
                .branch_parent_question_id === null,
          )
          .at(-1)?.index ?? -1;
      const downstreamAttachIndex =
        indexedCalls
          .filter(
            ({ call }) =>
              call[0] === 'PATCH' &&
              call[1] === downstreamPath &&
              (call[2].body as { branch_parent_question_id?: string | null })
                .branch_parent_question_id === clearedParentId,
          )
          .at(-1)?.index ?? -1;
      expect(clearedParentPatchIndex).toBeGreaterThanOrEqual(0);
      expect(downstreamAttachIndex).toBeGreaterThan(clearedParentPatchIndex);
    },
  );

  it.each([
    ['clears Y', 'clear'],
    ['moves Y to W', 'move'],
  ] as const)('W-832 saves when X becomes a child after it %s', async (_label, childChange) => {
    const parentXId = '11111111-1111-4111-8111-111111111111';
    const childYId = '22222222-2222-4222-8222-222222222222';
    const parentWId = '44444444-4444-4444-8444-444444444444';
    const parentZId = '55555555-5555-4555-8555-555555555555';
    const questionX: SurveyQuestion = {
      ...(survey.questions?.[0] as SurveyQuestion),
      id: parentXId,
      prompt: '기존 부모 질문 X',
      sort_order: 0,
    };
    const questionY: SurveyQuestion = {
      ...questionX,
      id: childYId,
      prompt: '기존 하위 질문 Y',
      branch_depth: 1,
      branch_parent_question_id: parentXId,
      branch_trigger_option_key: 'yes',
      sort_order: 1,
    };
    const questionW: SurveyQuestion = {
      ...questionX,
      id: parentWId,
      prompt: '다른 부모 질문 W',
      sort_order: 2,
    };
    const questionZ: SurveyQuestion = {
      ...questionX,
      id: parentZId,
      prompt: '새 부모 질문 Z',
      sort_order: 3,
    };
    const initialQuestions = [questionX, questionY, questionW, questionZ];
    installQuestionServerOracle(initialQuestions);
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: initialQuestions }}
        canManage
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(questionY.prompt));
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(
      await screen.findByRole('option', {
        name: (name) =>
          childChange === 'clear' ? name === '분기 없음' : name.endsWith(` · ${questionW.prompt}`),
      }),
    );

    fireEvent.click(screen.getByText(questionX.prompt));
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(
      await screen.findByRole('option', {
        name: (name) => name.endsWith(` · ${questionZ.prompt}`),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => {
      expect(
        screen.queryByText(/^저장 시각 /) || screen.queryByText('저장하지 못했습니다.'),
      ).toBeTruthy();
    });
    await screen.findByText(/^저장 시각 /);
    expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();

    const childYPath = `/surveys/${survey.id}/questions/${childYId}`;
    const parentXPath = `/surveys/${survey.id}/questions/${parentXId}`;
    const childYPatches = calls('PATCH', childYPath);
    expect(childYPatches.length).toBeGreaterThan(0);
    expect(parseBackendQuestionInput(childYPatches.at(-1)?.[2].body)).toMatchObject({
      branch_parent_question_id: childChange === 'clear' ? null : parentWId,
    });

    const indexedCalls = apiClient.mock.calls.map((call, index) => ({ call, index }));
    const childYUpdateIndex = indexedCalls.find(
      ({ call }) => call[0] === 'PATCH' && call[1] === childYPath,
    )?.index;
    const parentXAttachIndex = indexedCalls.find(
      ({ call }) =>
        call[0] === 'PATCH' &&
        call[1] === parentXPath &&
        (call[2].body as { branch_parent_question_id?: string | null })
          .branch_parent_question_id === parentZId,
    )?.index;
    if (childYUpdateIndex === undefined || parentXAttachIndex === undefined)
      throw new Error('Expected the child update and parent attach to be sent');
    expect(childYUpdateIndex).toBeLessThan(parentXAttachIndex);
    expect(parseBackendQuestionInput(calls('PATCH', parentXPath).at(-1)?.[2].body)).toMatchObject({
      branch_parent_question_id: parentZId,
      branch_trigger_option_key: 'yes',
    });
  });

  it.each(['one rejected parent PATCH'] as const)(
    'keeps a newly created child branch through a retry after %s',
    async () => {
      const parentId = '11111111-1111-4111-8111-111111111111';
      const parent = { ...(survey.questions?.[0] as SurveyQuestion), id: parentId };
      installQuestionServerOracle([parent], { rejectFirstPatchFor: parentId });
      renderWithQuery(
        <SurveyBuilder survey={{ ...survey, questions: [parent] }} canManage onBack={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
      fireEvent.change(screen.getByLabelText('옵션 3'), { target: { value: '옵션 3' } });
      fireEvent.click(screen.getByRole('button', { name: '새 질문 추가' }));
      fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '새 분기 질문' } });
      fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '조건 충족' } });
      fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '조건 미충족' } });
      fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
      fireEvent.click(await screen.findByRole('option', { name: `Q1 · ${parent.prompt}` }));
      fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));
      fireEvent.click(await screen.findByRole('option', { name: '옵션 3' }));

      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      expect(await screen.findByText('저장하지 못했습니다.')).toBeInTheDocument();
      expect(calls('POST', `/surveys/${survey.id}/questions`)).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());

      expect(screen.queryByText('저장하지 못했습니다.')).not.toBeInTheDocument();
      const childPatches = calls(
        'PATCH',
        `/surveys/${survey.id}/questions/${SERVER_CREATED_QUESTION_ID}`,
      );
      expect(childPatches).toHaveLength(1);
      const parentPatches = calls('PATCH', `/surveys/${survey.id}/questions/${parentId}`);
      const addedKey = (
        parentPatches.at(-1)?.[2].body as { options: Array<{ key: string }> }
      ).options.at(-1)?.key;
      expect(childPatches.at(-1)?.[2].body).toMatchObject({
        branch_parent_question_id: parentId,
        branch_trigger_option_key: addedKey,
      });
    },
  );

  it('enforces the 50 option limit', () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);

    for (let index = 0; index < 48; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
    }

    expect(screen.getAllByLabelText(/^옵션 \d+$/)).toHaveLength(50);
    expect(screen.getByRole('button', { name: '옵션 추가' })).toBeDisabled();
  });

  it('AC-3 saves the distinct survey title with one scalar PATCH', async () => {
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Survey 제목' }), {
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
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());
  });

  it('names question delete actions by dense question position', () => {
    const questions = [
      question('question-1', '첫 번째 질문', 0),
      question('question-2', '두 번째 질문', 1),
    ];
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions }} canManage onBack={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Q1 질문 삭제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q2 질문 삭제' })).toBeInTheDocument();
  });

  it('does not repeat a successful question delete when reorder fails and save is retried', async () => {
    const questions = [
      question('question-1', '첫 질문', 0),
      question('question-2', '둘째 질문', 1),
      question('question-3', '셋째 질문', 2),
    ];
    let rejectFirstReorder = true;
    apiClient.mockImplementation(async (method: string, path: string) => {
      if (
        method === 'PATCH' &&
        path === '/surveys/survey-1/questions/reorder' &&
        rejectFirstReorder
      ) {
        rejectFirstReorder = false;
        throw new Error('reorder failed');
      }
      return { data: { id: 'question-1' } };
    });
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions }} canManage onBack={vi.fn()} />);

    fireEvent.click(
      within(screen.getByTestId('survey-question-row-question-2')).getByLabelText('Q2 질문 삭제'),
    );
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(screen.getByText('저장하지 못했습니다.')).toBeInTheDocument());
    expect(calls('PATCH', '/surveys/survey-1/questions/reorder')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());

    expect(calls('DELETE', '/surveys/survey-1/questions/question-2')).toHaveLength(1);
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
    fireEvent.click(screen.getByRole('combobox', { name: 'Survey 유형' }));
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
    fireEvent.change(screen.getByLabelText('질문 제목'), {
      target: { value: '수정된 질문' },
    });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
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
    const deleteButtons = screen.getAllByRole('button', { name: /^Q\d+ 질문 삭제$/ });
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
    await waitFor(() => expect(screen.getByText(/^저장 시각 /)).toBeInTheDocument());
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
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '임시 질문' } });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(resolveCreate).toBeDefined());
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: 'POST 중 수정' } });
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
    fireEvent.change(screen.getByLabelText('질문 제목'), { target: { value: '새 질문' } });
    fireEvent.change(screen.getByLabelText('옵션 1'), { target: { value: '예' } });
    fireEvent.change(screen.getByLabelText('옵션 2'), { target: { value: '아니오' } });
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
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: '분기 없음' }));
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
    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: '분기 없음' }));
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
    fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));
    fireEvent.click(await screen.findByRole('option', { name: '예' }));
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    const preview = screen.getByRole('dialog');
    expect(within(preview).queryByText('추가 질문')).not.toBeInTheDocument();
    fireEvent.click(within(preview).getByLabelText('예'));
    expect(within(preview).getByRole('group', { name: '추가 질문' })).toBeInTheDocument();
    expect(
      within(preview).getByText('추가 질문', { selector: 'span' }).closest('p'),
    ).toHaveTextContent('Q2. 추가 질문');
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
      expect(screen.queryByText('Survey 생성')).not.toBeInTheDocument();
    },
  );

  // #706 — Survey tab counts are unknown until the list read succeeds. These
  // cases mount the REAL index and detail routes (the hook mocks above fall
  // through to the real hooks unless a stub is installed below). The routes
  // pass the list query's `isPending`, so the whole no-data window — including
  // a paused read, where isPending=true while isLoading=false — renders the
  // skeleton or the error state instead of tabs rendering 0.
  describe('Survey routes tab counts (#706)', () => {
    afterEach(() => {
      routeQueryStubs.surveys = undefined;
      routeQueryStubs.survey = undefined;
    });

    function stubListQuery(state: 'paused' | 'failed' | 'loaded-empty' | 'loaded-populated') {
      const refetch = vi.fn();
      switch (state) {
        case 'paused':
          // No data and not fetching (e.g. an offline/paused read):
          // isPending=true while isLoading=false — the one query state the old
          // `isLoading` mapping rendered as a false empty result.
          return {
            data: undefined,
            error: null,
            status: 'pending',
            fetchStatus: 'paused',
            isPending: true,
            isLoading: false,
            isFetching: false,
            isError: false,
            isSuccess: false,
            refetch,
          };
        case 'failed':
          return {
            data: undefined,
            error: new Error('read failed'),
            status: 'error',
            fetchStatus: 'idle',
            isPending: false,
            isLoading: false,
            isFetching: false,
            isError: true,
            isSuccess: false,
            refetch,
          };
        case 'loaded-empty':
          return {
            data: [],
            error: null,
            status: 'success',
            fetchStatus: 'idle',
            isPending: false,
            isLoading: false,
            isFetching: false,
            isError: false,
            isSuccess: true,
            refetch,
          };
        case 'loaded-populated':
          return {
            data: [survey],
            error: null,
            status: 'success',
            fetchStatus: 'idle',
            isPending: false,
            isLoading: false,
            isFetching: false,
            isError: false,
            isSuccess: true,
            refetch,
          };
      }
    }

    it.each([
      ['index', 'paused'],
      ['index', 'failed'],
      ['index', 'loaded-empty'],
      ['index', 'loaded-populated'],
      ['detail', 'paused'],
      ['detail', 'failed'],
      ['detail', 'loaded-empty'],
      ['detail', 'loaded-populated'],
    ] as const)(
      'real %s route shows Survey tab counts only after the list read succeeds (%s)',
      async (route, state) => {
        routeQueryStubs.surveys = () => stubListQuery(state);
        if (route === 'detail') {
          routeQueryStubs.survey = () => ({
            data: survey,
            error: null,
            status: 'success',
            fetchStatus: 'idle',
            isPending: false,
            isLoading: false,
            isFetching: false,
            isError: false,
            isSuccess: true,
            refetch: vi.fn(),
          });
        }

        renderWithQuery(route === 'index' ? <SurveysIndexRoute /> : <SurveyDetailRoute />);

        if (state === 'paused') {
          expect(screen.getByTestId('survey-list-skeleton')).toBeInTheDocument();
          expect(screen.queryByRole('tab')).not.toBeInTheDocument();
          expect(screen.queryByText('생성된 Survey가 없습니다.')).not.toBeInTheDocument();
          return;
        }
        if (state === 'failed') {
          expect(await screen.findByText('Survey 목록을 불러오지 못했습니다')).toBeInTheDocument();
          expect(screen.queryByRole('tab')).not.toBeInTheDocument();
          return;
        }
        if (state === 'loaded-empty') {
          expect(await screen.findByText('생성된 Survey가 없습니다.')).toBeInTheDocument();
          expect(screen.getByRole('tab', { name: '전체 0' })).toBeInTheDocument();
          expect(screen.getByRole('tab', { name: '초안 0' })).toBeInTheDocument();
          expect(screen.getByRole('tab', { name: '진행 중 0' })).toBeInTheDocument();
          return;
        }
        expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '전체 1' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '초안 1' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '진행 중 0' })).toBeInTheDocument();
      },
    );

    it('real index route recovers from a failed read through a no-data refetch to real zero counts', async () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      routeQueryStubs.surveys = () => stubListQuery('failed');
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <SurveysIndexRoute />
        </QueryClientProvider>,
      );
      expect(screen.getByText('Survey 목록을 불러오지 못했습니다')).toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();

      // Post-error refetch resets to pending with no data (paused/non-fetching
      // pending): counts must stay absent while the refetch is unresolved.
      routeQueryStubs.surveys = () => stubListQuery('paused');
      rerender(
        <QueryClientProvider client={client}>
          <SurveysIndexRoute />
        </QueryClientProvider>,
      );
      expect(screen.getByTestId('survey-list-skeleton')).toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();

      routeQueryStubs.surveys = () => stubListQuery('loaded-empty');
      rerender(
        <QueryClientProvider client={client}>
          <SurveysIndexRoute />
        </QueryClientProvider>,
      );
      expect(await screen.findByText('생성된 Survey가 없습니다.')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '전체 0' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '초안 0' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '진행 중 0' })).toBeInTheDocument();
    });
  });
});
