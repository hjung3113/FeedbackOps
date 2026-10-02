import {
  type AnswerableSurveysResponse,
  type MySurveyResponsesResponse,
  type SurveyRespondentFormDto,
  answerableSurveysResponseSchema,
  mySurveyResponsesResponseSchema,
  surveyRespondentFormDtoSchema,
  surveyResponseSubmissionSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const surveyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const parentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const childId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const openedAt = '2026-07-20T00:00:00.000Z';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      className,
    }: {
      to: string;
      params?: { surveyId?: string };
      children: ReactNode;
      className?: string;
    }) => (
      <a className={className} href={to.replace('$surveyId', params?.surveyId ?? '')}>
        {children}
      </a>
    ),
  };
});

import { AnswerableSurveysPanel } from '@/features/home/AnswerableSurveysPanel';
import {
  RespondSurveyPage,
  SurveyParticipationPage,
} from '@/features/surveys/routes/SurveyParticipationPage';

const answerableSurveysFixture = answerableSurveysResponseSchema.parse({
  items: [
    {
      survey_id: surveyId,
      display_id: 'SRV-21',
      title: 'Q3 사용성 진단',
      type: 'discovery',
      question_count: 2,
      opened_at: openedAt,
    },
  ],
  page: { has_more: false },
});
const answerableSurvey = answerableSurveysFixture.items[0];
if (answerableSurvey === undefined) throw new Error('answerable Survey fixture is missing');

const formDto = surveyRespondentFormDtoSchema.parse({
  survey: {
    id: surveyId,
    title: 'Q3 사용성 진단',
    type: 'discovery',
    identity_protected: true,
  },
  questions: [
    {
      id: parentId,
      kind: 'single_choice',
      prompt: '사용하기 쉬웠나요?',
      is_required: true,
      sort_order: 0,
      options: [
        { key: 'yes', label: '예' },
        { key: 'no', label: '아니오' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: childId,
      kind: 'text',
      prompt: '어떤 점이 좋았나요?',
      is_required: true,
      sort_order: 1,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: parentId,
      branch_trigger_option_key: 'yes',
    },
  ],
});
const firstQuestion = formDto.questions.find((question) => question.id === parentId);
if (firstQuestion === undefined) throw new Error('respondent question fixture is missing');

const completedHistory = mySurveyResponsesResponseSchema.parse({
  items: [
    {
      survey_id: surveyId,
      survey_title: 'Q3 사용성 진단',
      submitted_at: '2026-07-21T00:00:00.000Z',
      identity_protected: true,
    },
  ],
  page: { has_more: false },
});

const emptyHistory = mySurveyResponsesResponseSchema.parse({
  items: [],
  page: { has_more: false },
});

function textForm(isRequired: boolean): SurveyRespondentFormDto {
  return surveyRespondentFormDtoSchema.parse({
    survey: formDto.survey,
    questions: [
      {
        ...firstQuestion,
        kind: 'text',
        prompt: '사용 경험을 적어주세요.',
        is_required: isRequired,
        options: null,
        branch_parent_question_id: null,
        branch_trigger_option_key: null,
      },
    ],
  });
}

interface RequestRecord {
  method: string;
  pathname: string;
  body: unknown;
  idempotencyKey: string | null;
}

function installFetch(
  options: {
    answerable?: AnswerableSurveysResponse;
    answerableErrorOnce?: boolean;
    pendingAnswerable?: boolean;
    history?: MySurveyResponsesResponse;
    historyErrorOnce?: boolean;
    pendingHistory?: boolean;
    form?: SurveyRespondentFormDto;
    formStatus?: number;
    postStatuses?: Array<{ status: number; code?: string }>;
  } = {},
) {
  const requests: RequestRecord[] = [];
  let answerableRequests = 0;
  let historyRequests = 0;
  let successfulSubmission = false;
  let postIndex = 0;
  const answerable = options.answerable ?? {
    items: [answerableSurvey],
    page: { has_more: false },
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const request: RequestRecord = {
      method,
      pathname: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
    };
    requests.push(request);

    if (url.pathname === '/me/answerable-surveys') {
      answerableRequests += 1;
      if (options.pendingAnswerable) return new Promise<Response>(() => {});
      if (options.answerableErrorOnce && answerableRequests === 1) {
        return jsonResponse({ code: 'internal.unexpected', message: 'temporary failure' }, 500);
      }
      return jsonResponse(
        successfulSubmission ? { items: [], page: { has_more: false } } : answerable,
      );
    }
    if (url.pathname === '/me/survey-responses') {
      historyRequests += 1;
      if (options.pendingHistory) return new Promise<Response>(() => {});
      if (options.historyErrorOnce && historyRequests === 1) {
        return jsonResponse({ code: 'internal.unexpected', message: 'temporary failure' }, 500);
      }
      return jsonResponse(
        successfulSubmission ? completedHistory : (options.history ?? emptyHistory),
      );
    }
    if (url.pathname === `/surveys/${surveyId}/form`) {
      if (options.formStatus !== undefined) {
        const error =
          options.formStatus === 409
            ? { code: 'conflict.survey_not_open', message: 'survey is not open' }
            : { code: 'not_found.record', message: 'survey not found' };
        return jsonResponse(error, options.formStatus);
      }
      return jsonResponse(options.form ?? formDto);
    }
    if (url.pathname === `/surveys/${surveyId}/responses` && method === 'POST') {
      const result = options.postStatuses?.[postIndex] ?? { status: 201 };
      postIndex += 1;
      if (result.status === 201) successfulSubmission = true;
      if (result.status >= 400) {
        return jsonResponse(
          { code: result.code ?? 'internal.unexpected', message: 'submission failed' },
          result.status,
        );
      }
      return jsonResponse(
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          survey_id: surveyId,
          submitted_at: '2026-07-21T00:00:00.000Z',
          identity_protected: true,
        },
        201,
      );
    }
    return jsonResponse({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWithQuery(
  node: ReactNode,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return {
    client,
    ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Survey participation page', () => {
  it('shows answerable Surveys and the signed-in Actor response history', async () => {
    installFetch({ history: completedHistory });
    renderWithQuery(<SurveyParticipationPage />);

    expect(await screen.findByRole('link', { name: /Q3 사용성 진단/ })).toHaveAttribute(
      'href',
      `/surveys/${surveyId}/respond`,
    );
    expect(screen.getByText('내 응답 이력')).toBeInTheDocument();
    expect(screen.getByText('2026. 7. 21.')).toBeInTheDocument();
  });

  it('shows loading states for both participation regions', async () => {
    const { fetchMock } = installFetch({ pendingAnswerable: true, pendingHistory: true });
    renderWithQuery(<SurveyParticipationPage />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

    expect(screen.getByTestId('participation-answerable-loading')).toBeInTheDocument();
    expect(screen.getByTestId('participation-history-loading')).toBeInTheDocument();
  });

  it('shows both empty regions when there is no answerable or submitted Survey', async () => {
    installFetch({ answerable: { items: [], page: { has_more: false } } });
    renderWithQuery(<SurveyParticipationPage />);

    expect(await screen.findByText('응답할 Survey가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('응답한 Survey가 없습니다.')).toBeInTheDocument();
  });

  it('shows a retry action for a failed list region', async () => {
    const { fetchMock } = installFetch({ answerableErrorOnce: true });
    renderWithQuery(<SurveyParticipationPage />);

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await userEvent.setup().click(retry);

    expect(await screen.findByRole('link', { name: /Q3 사용성 진단/ })).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it('retries a failed response history region', async () => {
    installFetch({
      answerable: answerableSurveysResponseSchema.parse({ items: [], page: { has_more: false } }),
      history: completedHistory,
      historyErrorOnce: true,
    });
    renderWithQuery(<SurveyParticipationPage />);

    const section = screen.getByRole('heading', { name: '내 응답 이력' }).closest('section');
    if (section === null) throw new Error('response history section is missing');
    const historyRegion = within(section);
    expect(await historyRegion.findByText('응답 이력을 불러오지 못했습니다.')).toBeInTheDocument();
    await userEvent.setup().click(historyRegion.getByRole('button', { name: '다시 시도' }));

    expect(await historyRegion.findByText('Q3 사용성 진단')).toBeInTheDocument();
  });
});

describe('respondent form', () => {
  it('keeps a branch hidden until its single-choice trigger is selected', async () => {
    installFetch();
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);

    expect(await screen.findByText('사용하기 쉬웠나요?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '어떤 점이 좋았나요?' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('radio', { name: '예' }));
    expect(await screen.findByRole('textbox', { name: '어떤 점이 좋았나요?' })).toBeInTheDocument();
  });

  it('blocks missing required answers inline without sending a request', async () => {
    const { requests } = installFetch();
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);

    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('한 개 이상 응답해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('응답을 입력해 주세요.')).toBeInTheDocument();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('blocks text over 4000 code points without sending a request', async () => {
    const { requests } = installFetch({ form: textForm(true) });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);

    const textArea = await screen.findByRole('textbox', { name: '사용 경험을 적어주세요.' });
    fireEvent.change(textArea, { target: { value: '🙂'.repeat(4001) } });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답은 4000자 이내로 입력해 주세요.')).toBeInTheDocument();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('omits an empty optional answer and requires at least one answer', async () => {
    const { requests } = installFetch({ form: textForm(false) });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);

    await screen.findByRole('textbox', { name: '사용 경험을 적어주세요.' });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('한 개 이상 응답해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('응답을 입력해 주세요.')).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('submits only visible answers with the shared body schema and an idempotency key', async () => {
    const { requests } = installFetch();
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '예' }));
    fireEvent.change(screen.getByRole('textbox', { name: '어떤 점이 좋았나요?' }), {
      target: { value: '숨겨질 응답' },
    });
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Survey 참여로 돌아가기' })).toHaveAttribute(
      'href',
      '/surveys/participate',
    );
    const request = requests.find((item) => item.method === 'POST');
    expect(request?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(surveyResponseSubmissionSchema.parse(request?.body)).toEqual({
      answers: [{ question_id: parentId, value: 'no' }],
    });
  });

  it('trims text answers before submission', async () => {
    const { requests } = installFetch();
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '예' }));
    fireEvent.change(screen.getByRole('textbox', { name: '어떤 점이 좋았나요?' }), {
      target: { value: '  좋았어요.  ' },
    });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    const request = requests.find((item) => item.method === 'POST');
    expect(surveyResponseSubmissionSchema.parse(request?.body)).toEqual({
      answers: [
        { question_id: parentId, value: 'yes' },
        { question_id: childId, value: '좋았어요.' },
      ],
    });
  });

  it('shows a 422 validation summary without leaving the form', async () => {
    installFetch({ postStatuses: [{ status: 422, code: 'validation.failed' }] });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('입력값이 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it.each([
    ['conflict.survey_not_open', '이 Survey는 현재 응답을 받을 수 없습니다.'],
    ['conflict.survey_response_already_submitted', '이 Survey에는 이미 응답을 제출했습니다.'],
  ])('shows the page-level %s response state', async (code, message) => {
    installFetch({ postStatuses: [{ status: 409, code }] });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Survey 참여로 돌아가기' })).toBeInTheDocument();
  });

  it('reuses the idempotency key when retrying an unchanged payload', async () => {
    const { requests } = installFetch({ postStatuses: [{ status: 500 }, { status: 201 }] });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));
    await screen.findByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    const keys = requests
      .filter((request) => request.method === 'POST')
      .map((request) => request.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('mints a new idempotency key when the payload changes after a failure', async () => {
    const { requests } = installFetch({ postStatuses: [{ status: 500 }, { status: 201 }] });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);
    await screen.findByText('사용하기 쉬웠나요?');
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));
    await screen.findByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');

    await userEvent.setup().click(screen.getByRole('radio', { name: '예' }));
    fireEvent.change(screen.getByRole('textbox', { name: '어떤 점이 좋았나요?' }), {
      target: { value: '좋았어요.' },
    });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    const keys = requests
      .filter((request) => request.method === 'POST')
      .map((request) => request.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('renders the existing not-found state for a missing Survey', async () => {
    installFetch({ formStatus: 404 });
    renderWithQuery(<RespondSurveyPage surveyId={surveyId} />);

    expect(await screen.findByText('Survey를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('invalidates answerable Surveys and response history after submission', async () => {
    installFetch();
    renderWithQuery(
      <>
        <SurveyParticipationPage />
        <AnswerableSurveysPanel />
        <RespondSurveyPage surveyId={surveyId} />
      </>,
    );
    await screen.findAllByRole('link', { name: /Q3 사용성 진단/ });
    await userEvent.setup().click(screen.getByRole('radio', { name: '아니오' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByText('응답이 제출되었습니다')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryAllByRole('link', { name: /Q3 사용성 진단/ })).toHaveLength(0);
    });
    expect(await screen.findByText('Q3 사용성 진단')).toBeInTheDocument();
  });
});

describe('Home answerable Survey panel', () => {
  it('limits the populated list to five respondent links', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      ...answerableSurvey,
      survey_id: `${String(index + 1).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      display_id: `SRV-${index + 1}`,
      title: `Survey ${index + 1}`,
    }));
    installFetch({ answerable: { items, page: { has_more: true, cursor: 'next' } } });
    renderWithQuery(<AnswerableSurveysPanel />);

    const list = await screen.findByTestId('home-answerable-surveys-list');
    expect(within(list).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Survey 참여에서 모두 보기' })).toHaveAttribute(
      'href',
      '/surveys/participate',
    );
  });

  it('shows an empty state when the actor has no answerable Survey', async () => {
    installFetch({ answerable: { items: [], page: { has_more: false } } });
    renderWithQuery(<AnswerableSurveysPanel />);

    expect(await screen.findByText('응답할 Survey가 없습니다.')).toBeInTheDocument();
  });

  it('shows a loading state while the answerable list is pending', async () => {
    const { fetchMock } = installFetch({ pendingAnswerable: true });
    renderWithQuery(<AnswerableSurveysPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByTestId('home-answerable-surveys-loading')).toBeInTheDocument();
  });

  it('retries an error state and then renders the Survey row', async () => {
    installFetch({ answerableErrorOnce: true });
    renderWithQuery(<AnswerableSurveysPanel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('link', { name: /Q3 사용성 진단/ })).toBeInTheDocument();
  });
});
