import { fetchCapabilityScope } from '@/lib/api';
import { CreateSurveyDialog } from '@/routes/_authed/surveys/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  surveyCopySourceVisualFixture,
  surveyCopySourcesVisualFixture,
  surveyTemplateVisualFixture,
  surveyVisualFixture,
} from '../../../../../tests/visual/fixtures/surveys';
import { SurveyBuilder } from '../../components/builder/SurveyBuilder';
import { SurveyList } from '../../components/list/SurveyList';
import { useSurvey } from '../../hooks/useSurveys';

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  fetchManagedSystems: async () => ({
    items: [
      {
        id: surveyVisualFixture.primary_managed_system_id,
        name: 'Revenue Analytics',
        archived_at: null,
      },
      { id: '99999999-9999-4999-8999-999999999999', name: 'Another System', archived_at: null },
    ],
  }),
  fetchCapabilityScope: vi.fn(async () => ({ scope: { kind: 'all' } })),
  fetchAnalyticsAreas: async () => ({ items: [] }),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(fetchCapabilityScope).mockImplementation(async () => ({ scope: { kind: 'all' } }));
});

it('starts from a built-in with visible questions and explicit privacy, using the server ID', async () => {
  const user = userEvent.setup();
  const created = vi.fn();
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      if (String(url).includes('/templates?'))
        return new Response(JSON.stringify(surveyTemplateVisualFixture));
      bodies.push(JSON.parse(init?.body as string));
      return new Response(JSON.stringify(surveyVisualFixture), { status: 201 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreateSurveyDialog open onClose={vi.fn()} onCreated={created} />
    </QueryClientProvider>,
  );
  screen.getByRole('combobox', { name: '시작 방법' }).focus();
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('option', { name: '기본 템플릿' }));
  screen.getByRole('combobox', { name: 'Managed System' }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: 'Revenue Analytics' }));
  await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
  expect(await screen.findByText(/이 Managed System을 얼마나 자주 사용하나요/)).toBeVisible();
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  screen.getByRole('combobox', { name: '응답 익명 보호' }).focus();
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('option', { name: '보호하지 않음' }));
  await user.click(screen.getByTestId('survey-create-submit'));
  await waitFor(() => expect(created).toHaveBeenCalledWith(surveyVisualFixture.id));
  expect(bodies).toEqual([
    expect.objectContaining({
      starting_point: { kind: 'builtin', template_id: 'discovery-basic', version: 1 },
      responses_identity_protected: false,
    }),
  ]);
});

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: option }));
}
function mountDialog(props: Partial<React.ComponentProps<typeof CreateSurveyDialog>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreateSurveyDialog open onClose={vi.fn()} onCreated={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}
async function existing(user: ReturnType<typeof userEvent.setup>) {
  await choose(user, '시작 방법', '기존 Survey 문항 사용');
  await choose(user, 'Managed System', 'Revenue Analytics');
}

it('searches and loads another page, previews saved branches/rating, and loads persisted builder questions', async () => {
  const user = userEvent.setup();
  const requests: string[] = [];
  let submitted: unknown;
  let persistedQuestions = surveyCopySourceVisualFixture.questions.map((question) => ({
    ...question,
    survey_id: surveyVisualFixture.id,
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);
      requests.push(path);
      if (init?.method === 'PATCH' && path.includes('/questions/')) {
        const questionId = path.split('/').at(-1);
        persistedQuestions = persistedQuestions.map((question) =>
          question.id === questionId
            ? { ...question, ...JSON.parse(init.body as string) }
            : question,
        );
        return new Response(JSON.stringify({ id: questionId }));
      }
      if (init?.method === 'POST') {
        submitted = JSON.parse(init.body as string);
        return new Response(JSON.stringify(surveyVisualFixture), { status: 201 });
      }
      if (path.includes('/copy-source') && !path.includes('/copy-sources?'))
        return new Response(JSON.stringify(surveyCopySourceVisualFixture));
      if (path.includes('/copy-sources?')) {
        const next = path.includes('cursor=next');
        return new Response(
          JSON.stringify(
            next
              ? surveyCopySourcesVisualFixture
              : { items: [], page: { has_more: true, cursor: 'next' } },
          ),
        );
      }
      return new Response(
        JSON.stringify({
          ...surveyVisualFixture,
          questions: persistedQuestions,
        }),
      );
    }),
  );
  function Flow() {
    const [id, setId] = React.useState('');
    return id ? (
      <PersistedBuilder id={id} />
    ) : (
      <CreateSurveyDialog open onClose={vi.fn()} onCreated={setId} />
    );
  }
  const rendered = render(
    <QueryClientProvider client={new QueryClient()}>
      <Flow />
    </QueryClientProvider>,
  );
  await existing(user);
  await user.type(screen.getByLabelText('기존 Survey 검색'), '지난');
  await waitFor(() =>
    expect(requests.some((path) => path.includes('q=%EC%A7%80%EB%82%9C'))).toBe(true),
  );
  await user.click(await screen.findByRole('button', { name: '더 보기' }));
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기: 리포트를 얼마나 자주 사용하시나요/)).toBeVisible();
  expect(screen.getByText(/1–5/)).toBeVisible();
  await user.clear(screen.getByLabelText('제목'));
  await user.type(screen.getByLabelText('제목'), '새 라운드');
  await choose(user, '응답 익명 보호', '보호함');
  await user.click(screen.getByTestId('survey-create-submit'));
  expect(await screen.findByTestId('survey-builder')).toBeVisible();
  expect(
    screen.getByTestId('survey-question-row-ffffffff-ffff-4fff-8fff-ffffffffffff'),
  ).toHaveTextContent('업무에 얼마나 도움이 되나요?');
  expect(requests).toContain(`/surveys/${surveyVisualFixture.id}`);
  expect(
    requests.some((path) => path.includes('q=%EC%A7%80%EB%82%9C') && path.includes('cursor=next')),
  ).toBe(true);
  expect(submitted).toEqual(
    expect.objectContaining({
      title: '새 라운드',
      starting_point: {
        kind: 'existing_survey',
        survey_id: surveyVisualFixture.id,
        definition_token: 'saved-definition-v1',
      },
    }),
  );
  await user.clear(screen.getByLabelText('질문 제목'));
  await user.type(screen.getByLabelText('질문 제목'), '새 라운드의 질문');
  await user.click(screen.getByRole('button', { name: '초안 저장' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled());
  await user.click(screen.getByRole('button', { name: '미리보기' }));
  expect(within(screen.getByRole('dialog')).getAllByText('새 라운드의 질문')[0]).toBeVisible();
  await user.keyboard('{Escape}');
  rendered.unmount();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersistedBuilder id={surveyVisualFixture.id} />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText('질문 제목')).toHaveValue('새 라운드의 질문');
});

it.each([
  ['list failure', 500, null, '시작 문항을 불러오지 못했습니다.'],
  [
    'no sources',
    200,
    { items: [], page: { has_more: false } },
    '사용할 수 있는 Survey가 없습니다.',
  ],
  [
    'preview failure',
    200,
    surveyCopySourcesVisualFixture,
    '문항이 변경되었거나 접근 권한이 없습니다. 새로고침 후 다시 선택하세요.',
  ],
])('distinguishes %s and leaves blank creation available', async (_name, status, list, message) => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?')
              ? (list ?? { code: 'internal.unexpected', message: 'failed' })
              : { code: 'not_found.record', message: 'gone' },
          ),
          { status: String(url).includes('/copy-sources?') ? status : 404 },
        ),
    ),
  );
  mountDialog();
  await existing(user);
  if (_name === 'preview failure')
    await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  await choose(user, '시작 방법', '빈 Survey');
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

it.each([403, 404, 409])(
  'blocks failed source create (%i) until reselected and never creates blank',
  async (status) => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const created = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        if (init?.method === 'POST') {
          bodies.push(JSON.parse(init.body as string));
          return new Response(
            JSON.stringify({
              code:
                status === 409
                  ? 'conflict.stale_write'
                  : status === 403
                    ? 'permission.denied'
                    : 'not_found.record',
              message: 'changed',
            }),
            { status },
          );
        }
        return new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?')
              ? surveyCopySourcesVisualFixture
              : surveyCopySourceVisualFixture,
          ),
        );
      }),
    );
    mountDialog({ onCreated: created });
    await existing(user);
    await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
    await waitFor(() => expect(screen.getByLabelText('제목')).toHaveValue('지난 라운드 문항'));
    await choose(user, '응답 익명 보호', '보호함');
    await user.click(screen.getByTestId('survey-create-submit'));
    expect(
      await screen.findByText(
        '문항이 변경되었거나 접근 권한이 없습니다. 새로고침 후 다시 선택하세요.',
      ),
    ).toBeVisible();
    // Only the reselect message: the create-failure alert must not blame the
    // form input for a changed/forbidden source.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(
      screen.queryByText('Survey를 만들지 못했습니다. 입력을 확인하고 다시 시도하세요.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('제목')).toHaveValue('지난 라운드 문항');
    expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
    expect(screen.queryByText(/분기:/)).not.toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    expect(created).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '새로고침' }));
    await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
    await waitFor(() => expect(screen.getByTestId('survey-create-submit')).toBeEnabled());
    // Reselecting must also have cleared the failed attempt's error state.
    expect(
      screen.queryByText('Survey를 만들지 못했습니다. 입력을 확인하고 다시 시도하세요.'),
    ).not.toBeInTheDocument();
  },
);

it('opens with initial focus on 제목 as blank creation does on develop', async () => {
  mountDialog();
  await waitFor(() => expect(screen.getByLabelText('제목')).toHaveFocus());
});

it('states near the source list that the source sets the Survey type', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?')
              ? surveyCopySourcesVisualFixture
              : surveyCopySourceVisualFixture,
          ),
        ),
    ),
  );
  mountDialog();
  await existing(user);
  expect(screen.getByText('Survey 유형은 선택한 Survey를 따릅니다.')).toBeVisible();
});

it('shows a search-specific empty line when no source matches the search', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const query = new URLSearchParams(String(url).split('?')[1] ?? '');
      return new Response(
        JSON.stringify(
          String(url).includes('/copy-sources?') && query.get('q')
            ? { items: [], page: { has_more: false } }
            : String(url).includes('/copy-sources?')
              ? surveyCopySourcesVisualFixture
              : surveyCopySourceVisualFixture,
        ),
      );
    }),
  );
  mountDialog();
  await existing(user);
  await user.type(screen.getByLabelText('기존 Survey 검색'), '없는검색어');
  expect(await screen.findByText('검색 결과가 없습니다.')).toBeVisible();
  expect(screen.queryByText('사용할 수 있는 Survey가 없습니다.')).not.toBeInTheDocument();
});

it.each([
  ['keeps the labels when present', false, '· 도움이 되지 않음 / 매우 도움이 됨'],
  ['drops the label line when absent', true, null],
])('rating preview %s', async (_name, stripLabels, expected) => {
  const user = userEvent.setup();
  const source = {
    ...surveyCopySourceVisualFixture,
    questions: surveyCopySourceVisualFixture.questions.map((question) =>
      question.kind === 'rating' && stripLabels
        ? { ...question, rating_low_label: null, rating_high_label: null }
        : question,
    ),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?') ? surveyCopySourcesVisualFixture : source,
          ),
        ),
    ),
  );
  mountDialog();
  await existing(user);
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  const range = await screen.findByText(/1–5/);
  expect(range).toBeVisible();
  if (expected) expect(range).toHaveTextContent(expected);
  else expect(range).not.toHaveTextContent('·');
});

function PersistedBuilder({ id }: { id: string }) {
  const survey = useSurvey(id);
  return survey.data ? <SurveyBuilder survey={survey.data} canManage onBack={vi.fn()} /> : null;
}

it.each(['cancel', 'X', 'Escape', 'outside', 'external close', 'permission loss'])(
  'keeps a pending creation through %s and handles the returned ID',
  async (dismissal) => {
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    const created = vi.fn();
    const closed = vi.fn();
    let resolve!: (response: Response) => void;
    let posts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        if (init?.method === 'POST') {
          posts++;
          return new Promise<Response>((done) => {
            resolve = done;
          });
        }
        return new Response(JSON.stringify(surveyTemplateVisualFixture));
      }),
    );
    const client = new QueryClient();
    const view = (open: boolean, canManage = true) => (
      <QueryClientProvider client={client}>
        <CreateSurveyDialog
          open={open}
          canManage={canManage}
          onClose={closed}
          onCreated={created}
        />
      </QueryClientProvider>
    );
    const rendered = render(view(true));
    await choose(user, '시작 방법', '기본 템플릿');
    await choose(user, 'Managed System', 'Revenue Analytics');
    await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
    await choose(user, '응답 익명 보호', '보호함');
    await act(async () => {
      screen.getByTestId('survey-create-submit').click();
      screen.getByTestId('survey-create-submit').click();
    });
    await waitFor(() => expect(posts).toBe(1));
    if (dismissal === 'cancel') await user.click(screen.getByTestId('survey-create-cancel'));
    if (dismissal === 'X') await user.click(screen.getByRole('button', { name: '닫기' }));
    if (dismissal === 'Escape') await user.keyboard('{Escape}');
    if (dismissal === 'outside')
      await user.click(document.querySelector('.fixed.inset-0') as HTMLElement);
    if (dismissal === 'external close') rendered.rerender(view(false));
    if (dismissal === 'permission loss') {
      rendered.rerender(view(true, false));
      expect(screen.queryByText(/이 Managed System을 얼마나 자주/)).not.toBeInTheDocument();
    }
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(closed).not.toHaveBeenCalled();
    await act(async () =>
      resolve(new Response(JSON.stringify(surveyVisualFixture), { status: 201 })),
    );
    await waitFor(() => expect(created).toHaveBeenCalledWith(surveyVisualFixture.id));
  },
);

it('finishes a request even if the observer is unmounted', async () => {
  const user = userEvent.setup();
  const created = vi.fn();
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) =>
      init?.method === 'POST'
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : new Response(JSON.stringify(surveyTemplateVisualFixture)),
    ),
  );
  const rendered = mountDialog({ onCreated: created });
  await choose(user, '시작 방법', '기본 템플릿');
  await choose(user, 'Managed System', 'Revenue Analytics');
  await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
  await choose(user, '응답 익명 보호', '보호함');
  await user.click(screen.getByTestId('survey-create-submit'));
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  rendered.unmount();
  resolve(new Response(JSON.stringify(surveyVisualFixture), { status: 201 }));
  await waitFor(() => expect(created).toHaveBeenCalledWith(surveyVisualFixture.id));
});

it.each(['empty', 'toolbar'])(
  'uses keyboard selection/preview/create and returns focus to the %s opener on cancel',
  async (entry) => {
    const user = userEvent.setup();
    const created = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url, init) =>
          new Response(
            JSON.stringify(
              init?.method === 'POST' ? surveyVisualFixture : surveyTemplateVisualFixture,
            ),
          ),
      ),
    );
    function Entry() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <SurveyList
            surveys={entry === 'empty' ? [] : [surveyVisualFixture]}
            isLoading={false}
            error={null}
            onSelect={vi.fn()}
            canCreate
            onCreate={() => setOpen(true)}
          />
          <CreateSurveyDialog open={open} onClose={() => setOpen(false)} onCreated={created} />
        </>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Entry />
      </QueryClientProvider>,
    );
    const opener = screen.getByTestId(
      entry === 'empty' ? 'survey-empty-create-button' : 'survey-create-button',
    );
    opener.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
    await user.keyboard('{Enter}');
    screen.getByRole('combobox', { name: '시작 방법' }).focus();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    screen.getByRole('combobox', { name: 'Managed System' }).focus();
    await user.keyboard('{Enter}{Enter}');
    const radio = await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ });
    radio.focus();
    await user.keyboard(' ');
    expect(await screen.findByText(/이 Managed System을 얼마나 자주/)).toBeVisible();
    screen.getByRole('combobox', { name: '응답 익명 보호' }).focus();
    await user.keyboard('{Enter}{Enter}');
    screen.getByTestId('survey-create-submit').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(created).toHaveBeenCalledWith(surveyVisualFixture.id));
  },
);

it('keeps a selected starting point when the type cannot change, and clears it with the Managed System', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(surveyTemplateVisualFixture))),
  );
  function Entry() {
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          다시 열기
        </button>
        <CreateSurveyDialog open={open} onClose={() => setOpen(false)} onCreated={vi.fn()} />
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Entry />
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText('제목'), '작성한 제목');
  await user.type(screen.getByLabelText('설명 (선택)'), '작성한 설명');
  await choose(user, '시작 방법', '기본 템플릿');
  await choose(user, 'Managed System', 'Revenue Analytics');
  await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
  expect(await screen.findByText(/이 Managed System을 얼마나 자주/)).toBeVisible();
  const typeSelect = screen.getByRole('combobox', { name: 'Survey 유형' });
  expect(typeSelect).toBeDisabled();
  expect(typeSelect).toHaveTextContent('탐색');
  expect(screen.getByText('Survey 유형은 선택한 Survey를 따릅니다.')).toBeVisible();
  await choose(user, 'Managed System', 'Another System');
  expect(screen.queryByText(/이 Managed System을 얼마나 자주/)).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Survey 유형' })).toBeEnabled();
  expect(screen.getByLabelText('제목')).toHaveValue('작성한 제목');
  expect(screen.getByLabelText('설명 (선택)')).toHaveValue('작성한 설명');
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  await user.click(screen.getByTestId('survey-create-cancel'));
  await user.click(screen.getByRole('button', { name: '다시 열기' }));
  expect(screen.getByLabelText('제목')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: '시작 방법' })).toHaveTextContent('빈 Survey');
  expect(screen.getByRole('combobox', { name: '응답 익명 보호' })).toHaveTextContent(
    '보호 여부 선택',
  );
});

it('disables the type select for a copy source and re-enables it when the mode is cleared', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?')
              ? surveyCopySourcesVisualFixture
              : surveyCopySourceVisualFixture,
          ),
        ),
    ),
  );
  mountDialog();
  await existing(user);
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  const typeSelect = screen.getByRole('combobox', { name: 'Survey 유형' });
  await waitFor(() => expect(typeSelect).toHaveTextContent('탐색'));
  expect(typeSelect).toBeDisabled();
  expect(screen.getByText('Survey 유형은 선택한 Survey를 따릅니다.')).toBeVisible();
  await choose(user, '시작 방법', '빈 Survey');
  expect(screen.getByRole('combobox', { name: 'Survey 유형' })).toBeEnabled();
});

it('sends one copy-source request after the search settles', async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const path = String(url);
      requests.push(path);
      return new Response(
        JSON.stringify(
          path.includes('/copy-sources?')
            ? { items: [], page: { has_more: false } }
            : surveyCopySourceVisualFixture,
        ),
      );
    }),
  );
  const user = userEvent.setup();
  mountDialog();
  await existing(user);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const input = screen.getByLabelText('기존 Survey 검색');
  fireEvent.change(input, { target: { value: 'a' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  fireEvent.change(input, { target: { value: 'ab' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  fireEvent.change(input, { target: { value: 'abc' } });
  expect(input).toHaveValue('abc');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(299);
  });
  expect(requests.some((path) => /[?&]q=(a|ab|abc)(?:&|$)/.test(path))).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(requests.filter((path) => path.includes('q=abc'))).toHaveLength(1);
});

it('preserves an uncertain attempt body/key through a rendered retry and uses a new key after editing', async () => {
  const user = userEvent.setup();
  const requests: RequestInit[] = [];
  const created = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify(surveyTemplateVisualFixture));
      requests.push(init);
      throw new TypeError('response lost');
    }),
  );
  mountDialog({ onCreated: created });
  await choose(user, '시작 방법', '기본 템플릿');
  await choose(user, 'Managed System', 'Revenue Analytics');
  await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
  await choose(user, '응답 익명 보호', '보호함');
  await user.click(screen.getByTestId('survey-create-submit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Survey를 만들지 못했습니다.');
  await user.click(screen.getByTestId('survey-create-submit'));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]?.body).toBe(requests[0]?.body);
  const key = (request: RequestInit | undefined) =>
    new Headers(request?.headers).get('Idempotency-Key');
  expect(key(requests[1])).toBe(key(requests[0]));
  await user.type(screen.getByLabelText('제목'), ' 수정');
  await user.click(screen.getByTestId('survey-create-submit'));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(key(requests[2])).not.toBe(key(requests[0]));
  expect(created).not.toHaveBeenCalled();
});

it('fails closed when the selected system leaves the manageable scope, keeping input until it recovers', async () => {
  const user = userEvent.setup();
  const scope = vi.mocked(fetchCapabilityScope);
  scope.mockResolvedValueOnce({ scope: { kind: 'all' } });
  scope.mockResolvedValue({ scope: { kind: 'scoped', managed_system_ids: [] } });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/copy-sources?')
              ? surveyCopySourcesVisualFixture
              : surveyCopySourceVisualFixture,
          ),
        ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <CreateSurveyDialog open onClose={vi.fn()} onCreated={vi.fn()} />
    </QueryClientProvider>,
  );
  await existing(user);
  await user.type(screen.getByLabelText('제목'), '직접 작성');
  await user.type(screen.getByLabelText('설명 (선택)'), '직접 작성한 설명');
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  await choose(user, '응답 익명 보호', '보호함');
  await act(async () => {
    await client.refetchQueries({ queryKey: ['permission-scope'] });
  });
  expect(
    await screen.findByText(
      '문항이 변경되었거나 접근 권한이 없습니다. 새로고침 후 다시 선택하세요.',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/분기:/)).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /지난 라운드 문항/ })).not.toBeInTheDocument();
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  expect(screen.getByLabelText('제목')).toHaveValue('직접 작성');
  expect(screen.getByLabelText('설명 (선택)')).toHaveValue('직접 작성한 설명');
  expect(screen.getByRole('combobox', { name: '응답 익명 보호' })).toHaveTextContent('보호함');
  scope.mockResolvedValue({ scope: { kind: 'all' } });
  await act(async () => {
    await client.refetchQueries({ queryKey: ['permission-scope'] });
  });
  // Automatic scope recovery must not restore the preview or source submission;
  // only explicit 새로고침 and reselection do (ADR-0070).
  await waitFor(() => expect(screen.queryByText(/분기:/)).not.toBeInTheDocument());
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '새로고침' }));
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  expect(screen.getByTestId('survey-create-submit')).toBeEnabled();
  expect(screen.getByLabelText('제목')).toHaveValue('직접 작성');
  expect(screen.getByLabelText('설명 (선택)')).toHaveValue('직접 작성한 설명');
});

it('latches a 403 from 더 보기 while a snapshot is shown until refresh and reselection', async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify(surveyVisualFixture), { status: 201 });
      }
      if (path.includes('/copy-source') && !path.includes('/copy-sources?'))
        return new Response(JSON.stringify(surveyCopySourceVisualFixture));
      if (path.includes('cursor=next'))
        return new Response(JSON.stringify({ code: 'permission.denied', message: 'revoked' }), {
          status: 403,
        });
      return new Response(
        JSON.stringify({
          items: surveyCopySourcesVisualFixture.items,
          page: { has_more: true, cursor: 'next' },
        }),
      );
    }),
  );
  mountDialog();
  await existing(user);
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: '더 보기' }));
  expect(
    await screen.findByText(
      '문항이 변경되었거나 접근 권한이 없습니다. 새로고침 후 다시 선택하세요.',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/분기:/)).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /지난 라운드 문항/ })).not.toBeInTheDocument();
  expect(screen.getByTestId('survey-create-submit')).toBeDisabled();
  expect(screen.getByLabelText('제목')).toHaveValue('지난 라운드 문항');
  expect(screen.getByRole('combobox', { name: '응답 익명 보호' })).toHaveTextContent(
    '보호 여부 선택',
  );
  expect(bodies).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: '새로고침' }));
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  await choose(user, '응답 익명 보호', '보호함');
  expect(screen.getByTestId('survey-create-submit')).toBeEnabled();
});

it('replays the pinned token and key when a background snapshot refetch changes it after a lost response', async () => {
  const user = userEvent.setup();
  const posts: RequestInit[] = [];
  let token = 'saved-definition-v1';
  let refetched = false;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);
      if (init?.method === 'POST') {
        posts.push(init);
        throw new TypeError('response lost');
      }
      if (path.includes('/copy-source') && !path.includes('/copy-sources?'))
        return new Response(
          JSON.stringify({
            ...surveyCopySourceVisualFixture,
            definition_token: token,
            ...(refetched ? { title: '출처 제목이 변경된 문항' } : {}),
          }),
        );
      return new Response(JSON.stringify(surveyCopySourcesVisualFixture));
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <CreateSurveyDialog open onClose={vi.fn()} onCreated={vi.fn()} />
    </QueryClientProvider>,
  );
  await existing(user);
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  await choose(user, '응답 익명 보호', '보호함');
  await user.click(screen.getByTestId('survey-create-submit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Survey를 만들지 못했습니다.');
  token = 'refetched-definition-v2';
  refetched = true;
  await act(async () => {
    await client.refetchQueries({ queryKey: ['survey-copy-source'] });
  });
  // Automatic suggestions freeze while an attempt is pinned; an unchanged retry
  // replays the exact submitted body and key (ADR-0070).
  expect(screen.getByLabelText('제목')).toHaveValue('지난 라운드 문항');
  await user.click(screen.getByTestId('survey-create-submit'));
  await waitFor(() => expect(posts).toHaveLength(2));
  const key = (request: RequestInit | undefined) =>
    new Headers(request?.headers).get('Idempotency-Key');
  expect(JSON.parse(posts[1]?.body as string).starting_point).toEqual({
    kind: 'existing_survey',
    survey_id: surveyVisualFixture.id,
    definition_token: 'saved-definition-v1',
  });
  expect(posts[1]?.body).toBe(posts[0]?.body);
  expect(key(posts[1])).toBe(key(posts[0]));
  expect(new Set(posts.map(key)).size).toBe(1);
});

it('clears source titles and preview immediately on system change, without inheriting privacy', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (String(url).includes('99999999'))
        return new Response(JSON.stringify({ items: [], page: { has_more: false } }));
      return new Response(
        JSON.stringify(
          String(url).includes('/copy-sources?')
            ? surveyCopySourcesVisualFixture
            : surveyCopySourceVisualFixture,
        ),
      );
    }),
  );
  mountDialog();
  await existing(user);
  await user.type(screen.getByLabelText('제목'), '직접 작성');
  await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
  expect(await screen.findByText(/분기:/)).toBeVisible();
  expect(screen.getByRole('combobox', { name: '응답 익명 보호' })).toHaveTextContent(
    '보호 여부 선택',
  );
  await choose(user, 'Managed System', 'Another System');
  expect(screen.queryByRole('radio', { name: /지난 라운드 문항/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/분기:/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('제목')).toHaveValue('직접 작성');
  expect(await screen.findByText('사용할 수 있는 Survey가 없습니다.')).toBeVisible();
});

it.each(['catalog', 'snapshot', 'create'])(
  'renders malformed %s responses as an error without navigation',
  async (stage) => {
    const user = userEvent.setup();
    const created = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const data =
          init?.method === 'POST'
            ? { ...surveyVisualFixture, id: 'invalid' }
            : String(url).includes('/templates?')
              ? stage === 'catalog'
                ? { items: [{ template_id: 'invalid' }] }
                : surveyTemplateVisualFixture
              : String(url).includes('/copy-sources?')
                ? surveyCopySourcesVisualFixture
                : { ...surveyCopySourceVisualFixture, questions: [] };
        return new Response(JSON.stringify(data));
      }),
    );
    mountDialog({ onCreated: created });
    await choose(user, '시작 방법', stage === 'snapshot' ? '기존 Survey 문항 사용' : '기본 템플릿');
    await choose(user, 'Managed System', 'Revenue Analytics');
    if (stage === 'snapshot')
      await user.click(await screen.findByRole('radio', { name: /지난 라운드 문항/ }));
    if (stage === 'create') {
      await user.click(await screen.findByRole('radio', { name: /Discovery 기본 템플릿/ }));
      await choose(user, '응답 익명 보호', '보호함');
      await user.click(screen.getByTestId('survey-create-submit'));
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      stage === 'catalog'
        ? '시작 문항을 불러오지 못했습니다.'
        : stage === 'snapshot'
          ? '미리보기를 불러오지 못했습니다.'
          : 'Survey를 만들지 못했습니다.',
    );
    expect(created).not.toHaveBeenCalled();
  },
);
