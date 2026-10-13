import { SURVEY_EVIDENCE_PICKER_COPY as COPY } from '@/lib/copy/survey-evidence-picker';
import {
  attachSurveyEvidenceRequestSchema,
  listEvidenceHighlightsResponseSchema,
  listSurveysResponseSchema,
  surveyEvidenceCandidatesResponseSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FINDING_DETAIL_IDS as IDS,
  SURVEY_EVIDENCE_IDS as SURVEY,
  SURVEY_EVIDENCE_QUOTE,
  findingSourceVoc,
  surveyEvidenceAttached,
  surveyEvidenceCandidates,
  surveyEvidenceCatalog,
  surveyEvidenceHighlight,
  surveyEvidenceStates,
} from '../../../../../tests/visual/fixtures/finding-detail';
import { useEvidenceHighlights } from '../../hooks/useEvidenceHighlights';
import { AddEvidenceModal } from './AddEvidenceModal';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function setup(
  options: {
    state?: keyof typeof surveyEvidenceStates;
    denied?: boolean;
    catalogDenied?: boolean;
    postStatus?: number;
    paged?: boolean;
    holdPost?: boolean;
    holdCandidate?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const posts: { body: unknown; key: string | null }[] = [];
  let postStatus = options.postStatus ?? 201;
  let attached = false;
  let releasePost = () => {};
  let releaseCandidate = () => {};
  const candidateGate = new Promise<void>((resolve) => {
    releaseCandidate = resolve;
  });
  const postGate = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  let candidateDenied = options.denied ?? false;
  let candidateState = options.state;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'POST') {
      expect(url.pathname).toBe(`/findings/${IDS.finding}/survey-evidence`);
      const body = attachSurveyEvidenceRequestSchema.parse(JSON.parse(String(init.body)));
      posts.push({ body, key: new Headers(init.headers).get('Idempotency-Key') });
      if (options.holdPost) await postGate;
      if (postStatus !== 201)
        return json(
          {
            code: postStatus === 422 ? 'validation.failed' : 'internal.unexpected',
            message: 'failed',
          },
          postStatus,
        );
      attached = true;
      return json(surveyEvidenceAttached, 201);
    }
    if (url.pathname === '/managed-systems')
      return json({ items: [{ id: SURVEY.sourceSystem, name: 'Research Hub' }], total: 1 });
    if (url.pathname === '/surveys') {
      expect(url.search).toBe('');
      return options.catalogDenied
        ? json({ code: 'permission.denied', message: 'denied' }, 403)
        : json(
            listSurveysResponseSchema.parse([
              ...surveyEvidenceCatalog,
              { ...surveyEvidenceCatalog[0], id: SURVEY.otherSurvey, display_id: 'SRV-43' },
            ]),
          );
    }
    if (url.pathname.endsWith('/evidence-candidates')) {
      if (options.holdCandidate && url.pathname.includes(SURVEY.survey)) await candidateGate;
      if (options.holdCandidate && url.pathname.includes(SURVEY.otherSurvey))
        return json(
          surveyEvidenceCandidatesResponseSchema.parse({
            ...surveyEvidenceCandidates,
            items: [
              {
                ...surveyEvidenceCandidates.items[0],
                approved_excerpt_id: SURVEY.otherExcerpt,
                redacted_excerpt: '새 Survey 승인 발췌',
              },
            ],
          }),
        );
      expect(url.searchParams.get('limit')).toBe('50');
      if (candidateDenied) return json({ code: 'not_found.record', message: 'missing' }, 404);
      const page = candidateState
        ? surveyEvidenceStates[candidateState]
        : options.paged
          ? {
              ...surveyEvidenceCandidates,
              items: url.searchParams.has('cursor')
                ? [
                    {
                      ...surveyEvidenceCandidates.items[0],
                      approved_excerpt_id: SURVEY.otherExcerpt,
                      redacted_excerpt: '두 번째 승인 발췌',
                    },
                  ]
                : surveyEvidenceCandidates.items,
              page: url.searchParams.has('cursor')
                ? { has_more: false }
                : { has_more: true, cursor: 'safe-next' },
            }
          : surveyEvidenceCandidates;
      return json(surveyEvidenceCandidatesResponseSchema.parse(page));
    }
    if (url.pathname.endsWith('/evidence-highlights'))
      return json(
        listEvidenceHighlightsResponseSchema.parse({
          items: attached ? [surveyEvidenceHighlight] : [],
        }),
      );
    throw new Error(`Unregistered ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const close = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <AddEvidenceModal
        findingId={IDS.finding}
        managedSystemId={IDS.managedSystem}
        open
        onClose={close}
      />
    </QueryClientProvider>,
  );
  return {
    client,
    posts,
    releasePost,
    releaseCandidate,
    fetchMock,
    close,
    view,
    setPostStatus: (status: number) => {
      postStatus = status;
    },
    revoke: () => {
      candidateState = 'empty';
    },
    allow: () => {
      candidateDenied = false;
    },
  };
}
async function chooseSurvey(displayId = 'SRV-42') {
  fireEvent.click(screen.getByTestId('evidence-source-type-select'));
  fireEvent.click(await screen.findByRole('option', { name: /^Survey$/ }));
  fireEvent.click(await screen.findByRole('combobox', { name: COPY.survey }));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(displayId) }));
}
async function chooseExcerpt() {
  fireEvent.click(await screen.findByRole('radio', { name: /로그인 과정/ }));
}
afterEach(() => vi.unstubAllGlobals());

describe('AddEvidenceModal approved Survey attachment', () => {
  it('labels each excerpt with its question without repeating the chosen Survey ID', async () => {
    setup();
    await chooseSurvey();
    const excerpt = await screen.findByRole('radio', { name: /로그인 과정/ });

    expect(excerpt).toHaveAccessibleName(/로그인 경험/);
    expect(excerpt).not.toHaveAccessibleName(/SRV-42/);
  });

  it('explains access limits when the Survey catalog is empty', async () => {
    const context = setup();
    const originalFetch = context.fetchMock.getMockImplementation();
    context.fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input), 'http://localhost').pathname === '/surveys') return json([]);
      return originalFetch?.(input, init) ?? json({});
    });
    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: /^Survey$/ }));

    expect(await screen.findByText('접근 권한이 있는 Survey만 표시됩니다.')).toBeInTheDocument();
    expect(screen.getByText(COPY.catalogEmpty)).toBeInTheDocument();
  });

  it.each([500, 422])(
    'focuses the submit error after a Survey attachment fails with %s',
    async (status) => {
      setup({ postStatus: status });
      await chooseSurvey();
      await chooseExcerpt();
      const submit = screen.getByTestId('add-evidence-submit');
      submit.focus();
      fireEvent.click(submit);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    },
  );

  it.each(['수동 메모', 'VOC'])(
    'returns focus to 추가 after a failed %s submit',
    async (source) => {
      const context = setup();
      const originalFetch = context.fetchMock.getMockImplementation();
      let rejectPost = () => {};
      const postGate = new Promise<void>((resolve) => {
        rejectPost = resolve;
      });
      context.fetchMock.mockImplementation(async (input, init) => {
        const url = new URL(String(input), 'http://localhost');
        if (init?.method === 'POST') {
          await postGate;
          return json({ code: 'internal.unexpected', message: 'failed' }, 500);
        }
        if (url.pathname === '/vocs')
          return json({
            items: [{ ...findingSourceVoc, review_postponed_at: null }],
            page: { has_more: false },
          });
        return originalFetch?.(input, init) ?? json({});
      });
      if (source === 'VOC') {
        fireEvent.click(screen.getByTestId('evidence-source-type-select'));
        fireEvent.click(await screen.findByRole('option', { name: 'VOC' }));
        fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
        fireEvent.click(await screen.findByRole('option', { name: /VOC-4410/ }));
      }
      fireEvent.change(screen.getByTestId('evidence-quote-input'), {
        target: { value: '관찰 메모' },
      });
      const submit = screen.getByTestId('add-evidence-submit');
      submit.focus();
      fireEvent.click(submit);
      await waitFor(() => expect(submit).toBeDisabled());
      // Model the browser losing focus when its pending submit control is disabled.
      screen.getByTestId('evidence-quote-input').focus();
      rejectPost();
      await waitFor(() => expect(submit).toBeEnabled());
      await waitFor(() => expect(submit).toHaveFocus());
    },
  );

  it('attaches a cross-system returned selection and rereads highlights plus inactive inventory variants', async () => {
    const context = setup();
    const listRead = vi.fn(async () => ({ items: [] }));
    const detailRead = vi.fn(async () => ({ content_state: 'withheld' }));
    await context.client.fetchQuery({
      queryKey: ['evidence-inventory', 'list', 'all'],
      queryFn: listRead,
      staleTime: Number.POSITIVE_INFINITY,
    });
    await context.client.fetchQuery({
      queryKey: ['evidence-inventory', 'detail', 'saved'],
      queryFn: detailRead,
      staleTime: Number.POSITIVE_INFINITY,
    });
    function Highlights() {
      const query = useEvidenceHighlights(IDS.finding);
      return <output>{query.data?.map((item) => item.quote_or_summary).join('')}</output>;
    }
    context.view.rerender(
      <QueryClientProvider client={context.client}>
        <Highlights />
        <AddEvidenceModal
          findingId={IDS.finding}
          managedSystemId={IDS.managedSystem}
          open
          onClose={context.close}
        />
      </QueryClientProvider>,
    );
    await chooseSurvey();
    expect(screen.getByRole('combobox', { name: COPY.survey })).toHaveTextContent(
      'Managed System: Research Hub',
    );
    expect(screen.queryByTestId('evidence-source-id-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('evidence-quote-input')).not.toBeInTheDocument();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce());
    expect(context.posts[0]?.body).toEqual({
      approved_excerpt_id: SURVEY.excerpt,
      sentiment: null,
      importance: null,
    });
    expect(context.posts[0]?.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await screen.findByText(SURVEY_EVIDENCE_QUOTE)).toBeInTheDocument();
    // Both inactive query functions ran again; metadata-only POST was never cached as a quote.
    expect(listRead).toHaveBeenCalledTimes(2);
    expect(detailRead).toHaveBeenCalledTimes(2);
  });

  it('retains the selection/classification and key on retry, rotates the key when classification changes', async () => {
    const context = setup({ postStatus: 500 });
    await chooseSurvey();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('evidence-sentiment-select'));
    fireEvent.click(await screen.findByRole('option', { name: '긍정' }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-evidence-submit'));
      fireEvent.click(screen.getByTestId('add-evidence-submit'));
    });
    expect(await screen.findByText(COPY.attachError)).toBeInTheDocument();
    expect(context.posts).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /로그인 과정/ })).toBeChecked();
    expect(screen.getByTestId('evidence-sentiment-select')).toHaveTextContent('긍정');
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.posts).toHaveLength(2));
    await screen.findByText(COPY.attachError);
    expect(context.posts[1]?.key).toBe(context.posts[0]?.key);
    fireEvent.click(screen.getByTestId('evidence-importance-select'));
    fireEvent.click(await screen.findByRole('option', { name: '높음' }));
    context.setPostStatus(201);
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce());
    expect(context.posts[2]?.key).not.toBe(context.posts[1]?.key);
    expect(context.posts[2]?.body).toEqual({
      approved_excerpt_id: SURVEY.excerpt,
      sentiment: 'positive',
      importance: 'high',
    });
  });

  it.each([
    ['none', COPY.none],
    ['suppressed', COPY.below_threshold],
    ['empty', COPY.empty],
  ] as const)('distinguishes %s and cannot submit', async (state, copy) => {
    const context = setup({ state });
    await chooseSurvey();
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
    expect(context.posts).toHaveLength(0);
  });

  it('does not disclose denied-source candidates and retries the safe read', async () => {
    const context = setup({ denied: true });
    await chooseSurvey();
    expect(await screen.findByText(COPY.denied)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
    context.allow();
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
    expect(await screen.findByRole('radio', { name: /로그인 과정/ })).toBeInTheDocument();
  });

  it.each([
    [403, 'server'],
    [404, 'server'],
    [409, 'server'],
    [422, 'server'],
    [404, 'network'],
  ] as const)(
    'discards loaded excerpts after %s and keeps them hidden through a %s retry until a fresh first page succeeds',
    async (status, retryFailure) => {
      const context = setup({ paged: true });
      const transport = context.fetchMock.getMockImplementation();
      if (!transport) throw new Error('Missing candidate transport');
      let readState: 'visible' | 'denied' | 'failed' | 'recovered' = 'visible';
      const candidateReads: URL[] = [];
      context.fetchMock.mockImplementation(async (input, init) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.endsWith('/evidence-candidates')) {
          candidateReads.push(url);
          if (readState === 'denied')
            return json({ code: 'not_found.record', message: 'denied' }, status);
          if (readState === 'failed') {
            if (retryFailure === 'network') throw new TypeError('Network unavailable');
            return json({ code: 'internal.unexpected', message: 'failed' }, 500);
          }
          if (readState === 'recovered')
            return json(
              surveyEvidenceCandidatesResponseSchema.parse({
                ...surveyEvidenceCandidates,
                items: [
                  {
                    ...surveyEvidenceCandidates.items[0],
                    approved_excerpt_id: SURVEY.otherExcerpt,
                    redacted_excerpt: '현재 승인 발췌',
                  },
                ],
              }),
            );
        }
        return transport(input, init);
      });
      await chooseSurvey();
      await chooseExcerpt();
      expect(screen.getByTestId('add-evidence-submit')).toBeEnabled();
      readState = 'denied';
      fireEvent.click(screen.getByRole('button', { name: COPY.more }));
      await screen.findByRole('alert');
      expect(screen.queryByText(SURVEY_EVIDENCE_QUOTE)).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
      readState = 'failed';
      fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
      await waitFor(() => {
        expect(candidateReads).toHaveLength(3);
        expect(screen.getByRole('button', { name: COPY.retry })).toBeEnabled();
        expect(screen.getByRole('alert')).toHaveTextContent(COPY.error);
      });
      expect(screen.queryByText(SURVEY_EVIDENCE_QUOTE)).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
      expect(candidateReads[2]?.searchParams.has('cursor')).toBe(false);
      readState = 'recovered';
      fireEvent.click(screen.getByRole('button', { name: COPY.retry }));
      expect(await screen.findByRole('radio', { name: /현재 승인 발췌/ })).not.toBeChecked();
      expect(screen.queryByText(SURVEY_EVIDENCE_QUOTE)).not.toBeInTheDocument();
      expect(candidateReads[3]?.searchParams.has('cursor')).toBe(false);
      expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
      fireEvent.click(screen.getByRole('radio', { name: /현재 승인 발췌/ }));
      expect(screen.getByTestId('add-evidence-submit')).toBeEnabled();
    },
  );

  it('keeps a denied catalog separate from an empty catalog', async () => {
    setup({ catalogDenied: true });
    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: /^Survey$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.error);
    expect(screen.getByRole('button', { name: COPY.retry })).toBeEnabled();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
  });

  it('clears revoked selection and refreshes eligibility without replaying a stale preview', async () => {
    const context = setup({ postStatus: 422 });
    await chooseSurvey();
    await chooseExcerpt();
    context.revoke();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    expect(await screen.findByText(COPY.revoked)).toBeInTheDocument();
    expect(await screen.findByText(COPY.empty)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
  });

  it('disables selection, classification and submit while attachment is pending', async () => {
    const context = setup({ holdPost: true });
    await chooseSurvey();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.posts).toHaveLength(1));
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: COPY.survey })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /로그인 과정/ })).toBeDisabled();
    expect(screen.getByTestId('evidence-source-type-select')).toBeDisabled();
    expect(screen.getByTestId('evidence-sentiment-select')).toBeDisabled();
    expect(screen.getByTestId('evidence-importance-select')).toBeDisabled();
    context.releasePost();
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce());
  });

  it.each(['cancel', 'Escape', 'external'] as const)(
    'resets Survey draft on %s close and reopens as a note',
    async (way) => {
      const context = setup({ postStatus: 500 });
      function ControlledHost() {
        const [open, setOpen] = useState(true);
        return (
          <QueryClientProvider client={context.client}>
            <button type="button" onClick={() => setOpen(false)}>
              외부 닫기
            </button>
            <button type="button" onClick={() => setOpen(true)}>
              다시 열기
            </button>
            <AddEvidenceModal
              findingId={IDS.finding}
              managedSystemId={IDS.managedSystem}
              open={open}
              onClose={() => {
                context.close();
                setOpen(false);
              }}
            />
          </QueryClientProvider>
        );
      }
      context.view.rerender(<ControlledHost />);
      await chooseSurvey();
      await chooseExcerpt();
      fireEvent.click(screen.getByTestId('add-evidence-submit'));
      await screen.findByText(COPY.attachError);
      if (way === 'cancel') fireEvent.click(screen.getByRole('button', { name: '취소' }));
      if (way === 'Escape') fireEvent.keyDown(document.body, { key: 'Escape' });
      if (way === 'external')
        fireEvent.click(screen.getByRole('button', { name: '외부 닫기', hidden: true }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      if (way === 'external') expect(context.close).not.toHaveBeenCalled();
      else expect(context.close).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: '다시 열기' }));
      expect(screen.getByTestId('evidence-source-type-select')).toHaveTextContent('수동 메모');
      expect(screen.getByTestId('evidence-quote-input')).toHaveValue('');
      fireEvent.click(screen.getByTestId('evidence-source-type-select'));
      fireEvent.click(await screen.findByRole('option', { name: /^Survey$/ }));
      expect(screen.getByRole('combobox', { name: COPY.survey })).toHaveTextContent(COPY.survey);
      expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
      expect(screen.queryByText(COPY.attachError)).not.toBeInTheDocument();
    },
  );

  it('does not restore a late page from a previously selected Survey', async () => {
    const context = setup({ holdCandidate: true });
    await chooseSurvey();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox', { name: COPY.survey }));
    fireEvent.click(await screen.findByRole('option', { name: /SRV-43/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /새 Survey/ }));
    await act(async () => {
      context.releaseCandidate();
      await Promise.resolve();
    });
    expect(screen.getByRole('radio', { name: /새 Survey/ })).toBeChecked();
    expect(screen.queryByText(SURVEY_EVIDENCE_QUOTE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce());
    expect(context.posts[0]?.body).toEqual({
      approved_excerpt_id: SURVEY.otherExcerpt,
      sentiment: null,
      importance: null,
    });
  });

  it('keeps success cache invalidation after the modal unmounts during attachment', async () => {
    const context = setup({ holdPost: true });
    const inventoryRead = vi.fn(async () => ({ items: [] }));
    await context.client.fetchQuery({
      queryKey: ['evidence-inventory', 'list'],
      queryFn: inventoryRead,
      staleTime: Number.POSITIVE_INFINITY,
    });
    await chooseSurvey();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.posts).toHaveLength(1));
    context.view.unmount();
    context.releasePost();
    await waitFor(() => expect(inventoryRead).toHaveBeenCalledTimes(2));
    expect(context.close).not.toHaveBeenCalled();
  });

  it('uses a new key when a different returned approval is chosen after an error', async () => {
    const context = setup({ paged: true, postStatus: 500 });
    await chooseSurvey();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await screen.findByText(COPY.attachError);
    fireEvent.click(screen.getByRole('button', { name: COPY.more }));
    fireEvent.click(await screen.findByRole('radio', { name: /두 번째 승인/ }));
    context.setPostStatus(201);
    fireEvent.click(screen.getByTestId('add-evidence-submit'));
    await waitFor(() => expect(context.close).toHaveBeenCalledOnce());
    expect(context.posts[1]?.key).not.toBe(context.posts[0]?.key);
    expect(context.posts[1]?.body).toEqual({
      approved_excerpt_id: SURVEY.otherExcerpt,
      sentiment: null,
      importance: null,
    });
  });

  it('pages safe candidates and resets selection when Survey or source changes', async () => {
    const context = setup({ paged: true });
    await chooseSurvey();
    await chooseExcerpt();
    fireEvent.click(screen.getByRole('button', { name: COPY.more }));
    fireEvent.click(await screen.findByRole('radio', { name: /두 번째 승인/ }));
    expect(
      context.fetchMock.mock.calls.some(([url]) => String(url).includes('cursor=safe-next')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('combobox', { name: COPY.survey }));
    fireEvent.click(await screen.findByRole('option', { name: /SRV-43/ }));
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
    await chooseExcerpt();
    fireEvent.click(screen.getByTestId('evidence-source-type-select'));
    fireEvent.click(await screen.findByRole('option', { name: '수동 메모' }));
    expect(screen.getByTestId('evidence-quote-input')).toBeInTheDocument();
    await chooseSurvey();
    expect(screen.getByTestId('add-evidence-submit')).toBeDisabled();
  });
});
