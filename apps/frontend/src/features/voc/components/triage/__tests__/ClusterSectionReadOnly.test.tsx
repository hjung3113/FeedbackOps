// ClusterSectionReadOnly.test.tsx — #168 step 6 chunk 6b.
//
// The Slice 3 stub ("Cluster 추천은 다음 슬라이스에서 제공됩니다") is gone; the
// section now renders the real recommendation surface. Covers all four
// response states, per-candidate dismiss/confirm, and the two error paths.
//
// Prototype ref: screen-voc-create.jsx:512-541 (title, Similarity badge, card).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VocRecommendationsResponse } from '@fops/shared';
import { ClusterSectionReadOnly } from '../ClusterSectionReadOnly';

const SOURCE_VOC_ID = '00000000-0000-0000-0000-0000000000aa';
const CANDIDATE_A = '00000000-0000-0000-0000-0000000000b1';
const CANDIDATE_B = '00000000-0000-0000-0000-0000000000b2';

const ITEM_A = {
  voc_id: CANDIDATE_A,
  display_id: 'VOC-101',
  title: '대시보드 지표가 어제부터 갱신되지 않아요',
  severity: 'high' as const,
  reporter_facing_status: 'received' as const,
  score: 0.91,
};

const ITEM_B = {
  voc_id: CANDIDATE_B,
  display_id: 'VOC-102',
  title: '주간 리포트 수치가 서로 다릅니다',
  severity: null,
  reporter_facing_status: 'received' as const,
  score: 0.78,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** GET returns the queued responses in order (last one repeats); POST is delegated. */
function mockApi(options: {
  gets: VocRecommendationsResponse[];
  post?: (url: string) => Response;
}) {
  let getCall = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      const idx = Math.min(getCall, options.gets.length - 1);
      getCall += 1;
      return jsonResponse(options.gets[idx]);
    }
    if (options.post) return options.post(url);
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;
}

function renderSection(similarCount = 2) {
  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <ClusterSectionReadOnly vocId={SOURCE_VOC_ID} similarCount={similarCount} />
    </Wrapper>,
  );
}

describe('ClusterSectionReadOnly — recommendation surface', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('keeps the prototype section title and the ADR-0031 Similarity badge', async () => {
    globalThis.fetch = mockApi({
      gets: [{ available: true, embedding_version: 1, items: [ITEM_A], total: 1 }],
    });
    renderSection(3);

    expect(screen.getByText('Cluster 추천')).toBeInTheDocument();
    const badge = await screen.findByTestId('cluster-similarity-badge');
    expect(badge).toHaveTextContent('Similarity 3');
  });

  it('hides the Similarity badge when similar_count is zero (ADR-0031 heuristic unchanged)', async () => {
    globalThis.fetch = mockApi({
      gets: [{ available: true, embedding_version: 1, items: [], total: 0 }],
    });
    renderSection(0);

    await screen.findByText('추천 임계값을 넘은 유사 VOC가 없습니다.');
    expect(screen.queryByTestId('cluster-similarity-badge')).toBeNull();
  });

  it('available: true with items — renders one row per candidate with display_id, title and score %', async () => {
    globalThis.fetch = mockApi({
      gets: [{ available: true, embedding_version: 1, items: [ITEM_A, ITEM_B], total: 2 }],
    });
    renderSection();

    expect(
      await screen.findByTestId(`cluster-recommendation-row-${CANDIDATE_A}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId(`cluster-recommendation-row-${CANDIDATE_B}`)).toBeInTheDocument();
    expect(screen.getByText('VOC-101')).toBeInTheDocument();
    expect(screen.getByText(ITEM_A.title)).toBeInTheDocument();
    expect(screen.getByTestId(`cluster-recommendation-score-${CANDIDATE_A}`)).toHaveTextContent(
      '유사도 91%',
    );
    expect(screen.getByTestId(`cluster-recommendation-score-${CANDIDATE_B}`)).toHaveTextContent(
      '유사도 78%',
    );
    expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
      '유사한 VOC 2건이 발견됐어요',
    );
    // The threshold is unvalidated — the surface must not present the score as a guarantee.
    expect(screen.getByText(/실제 임베딩으로 검증되지 않았습니다/)).toBeInTheDocument();
  });

  it('available: true with an empty list — reads as "nothing passed the threshold", not as disabled', async () => {
    globalThis.fetch = mockApi({
      gets: [{ available: true, embedding_version: 1, items: [], total: 0 }],
    });
    renderSection();

    // `cluster-recommendation-state` exists during loading too, so awaiting the
    // element proves nothing — wait for the settled COPY before asserting.
    await waitFor(() => {
      expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
        '추천 임계값을 넘은 유사 VOC가 없습니다.',
      );
    });
    expect(screen.queryByTestId('cluster-recommendation-list')).toBeNull();
  });

  it('available: false / provider_disabled — says the provider is not configured', async () => {
    globalThis.fetch = mockApi({
      gets: [
        {
          available: false,
          reason: 'provider_disabled',
          embedding_version: 1,
          items: [],
          total: 0,
        },
      ],
    });
    renderSection();

    // Wait for the settled copy first: a negative assertion run during the
    // loading state would pass for the wrong reason.
    await waitFor(() => {
      expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
        '임베딩 제공자가 설정되어 있지 않아',
      );
    });
    const state = screen.getByTestId('cluster-recommendation-state');
    expect(state).not.toHaveTextContent('추천 임계값을 넘은 유사 VOC가 없습니다.');
    expect(state).not.toHaveTextContent('아직 임베딩되지 않았습니다');
  });

  it('available: false / source_not_embedded — says this VOC has no vector yet, and differs from provider_disabled', async () => {
    globalThis.fetch = mockApi({
      gets: [
        {
          available: false,
          reason: 'source_not_embedded',
          embedding_version: 1,
          items: [],
          total: 0,
        },
      ],
    });
    renderSection();

    await waitFor(() => {
      expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
        '아직 임베딩되지 않았습니다',
      );
    });
    const state = screen.getByTestId('cluster-recommendation-state');
    // ADR-0034 D2: the two unavailable reasons must not collapse into one string.
    expect(state).not.toHaveTextContent('임베딩 제공자가 설정되어 있지 않아');
    expect(state).not.toHaveTextContent('추천 임계값을 넘은 유사 VOC가 없습니다.');
  });

  it('dismiss removes that candidate row and leaves the others', async () => {
    globalThis.fetch = mockApi({
      gets: [
        { available: true, embedding_version: 1, items: [ITEM_A, ITEM_B], total: 2 },
        { available: true, embedding_version: 1, items: [ITEM_B], total: 1 },
      ],
      post: () => new Response(null, { status: 204 }),
    });
    renderSection();

    const dismissA = await screen.findByTestId(`cluster-recommendation-dismiss-${CANDIDATE_A}`);
    await userEvent.click(dismissA);

    await waitFor(() => {
      expect(screen.queryByTestId(`cluster-recommendation-row-${CANDIDATE_A}`)).toBeNull();
    });
    expect(screen.getByTestId(`cluster-recommendation-row-${CANDIDATE_B}`)).toBeInTheDocument();
    expect(await screen.findByTestId('cluster-recommendation-feedback')).toHaveTextContent(
      'VOC-101 추천을 무시했습니다.',
    );
  });

  it('confirm reports which cluster outcome happened', async () => {
    globalThis.fetch = mockApi({
      gets: [
        { available: true, embedding_version: 1, items: [ITEM_A], total: 1 },
        { available: true, embedding_version: 1, items: [], total: 0 },
      ],
      post: () =>
        jsonResponse({
          voc_cluster_id: '00000000-0000-0000-0000-0000000000c1',
          cluster_created: true,
        }),
    });
    renderSection();

    const confirmA = await screen.findByTestId(`cluster-recommendation-confirm-${CANDIDATE_A}`);
    await userEvent.click(confirmA);

    expect(await screen.findByTestId('cluster-recommendation-feedback')).toHaveTextContent(
      '새 Cluster를 만들었습니다.',
    );
  });

  it('confirm 422 out_of_scope surfaces the cross-Managed-System reason instead of throwing', async () => {
    globalThis.fetch = mockApi({
      gets: [{ available: true, embedding_version: 1, items: [ITEM_A], total: 1 }],
      post: () =>
        jsonResponse(
          {
            code: 'validation.failed',
            message: 'candidate is out of scope',
            detail: { fields: [{ path: ['candidate_voc_id'], code: 'out_of_scope' }] },
          },
          422,
        ),
    });
    renderSection();

    const confirmA = await screen.findByTestId(`cluster-recommendation-confirm-${CANDIDATE_A}`);
    await userEvent.click(confirmA);

    expect(await screen.findByTestId('cluster-recommendation-feedback')).toHaveTextContent(
      '다른 Managed System의 VOC와는 Cluster를 만들 수 없습니다.',
    );
    // The row survives — a rejected confirm is not a dismiss.
    expect(screen.getByTestId(`cluster-recommendation-row-${CANDIDATE_A}`)).toBeInTheDocument();
  });

  it('confirm 404 surfaces a "no longer visible" message instead of throwing', async () => {
    globalThis.fetch = mockApi({
      gets: [
        { available: true, embedding_version: 1, items: [ITEM_A], total: 1 },
        { available: true, embedding_version: 1, items: [], total: 0 },
      ],
      post: () =>
        jsonResponse({ code: 'not_found.record', message: 'record not found' }, 404),
    });
    renderSection();

    const confirmA = await screen.findByTestId(`cluster-recommendation-confirm-${CANDIDATE_A}`);
    await userEvent.click(confirmA);

    expect(await screen.findByTestId('cluster-recommendation-feedback')).toHaveTextContent(
      '이 VOC를 더 이상 볼 수 없습니다',
    );
  });

  it('dismiss 404 surfaces a message rather than throwing', async () => {
    globalThis.fetch = mockApi({
      gets: [
        { available: true, embedding_version: 1, items: [ITEM_A], total: 1 },
        { available: true, embedding_version: 1, items: [], total: 0 },
      ],
      post: () =>
        jsonResponse({ code: 'not_found.record', message: 'record not found' }, 404),
    });
    renderSection();

    const dismissA = await screen.findByTestId(`cluster-recommendation-dismiss-${CANDIDATE_A}`);
    await userEvent.click(dismissA);

    expect(await screen.findByTestId('cluster-recommendation-feedback')).toHaveTextContent(
      '이 VOC를 더 이상 볼 수 없습니다',
    );
  });

  it('renders an error line when the recommendation request itself fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'internal.unexpected', message: 'boom' }, 500),
    ) as unknown as typeof globalThis.fetch;
    renderSection();

    // The query hook retries once, so allow for the retry delay.
    await waitFor(
      () => {
        expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
          '추천을 불러오지 못했습니다',
        );
      },
      { timeout: 5000 },
    );
  });
});
