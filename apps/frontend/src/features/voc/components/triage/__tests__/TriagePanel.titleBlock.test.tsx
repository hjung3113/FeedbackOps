import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import type { VocDetailEnvelope, VocListItem, VocSummaryEnvelope } from '@fops/shared';
import { TriagePanel } from '../TriagePanel';

const TRIAGE_VOC: VocListItem = {
  id: 'voc-title-block-test',
  display_id: 'VOC-TB1',
  title: 'Looker 모델 변경 후 알림이 오지 않음',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000099',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

const DESCRIPTION = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '구독 알림 발송이 멈췄습니다.' }] },
  ],
};

function detailEnvelope(description: unknown): VocDetailEnvelope {
  return {
    ...TRIAGE_VOC,
    description_rich_content: description,
    next_actions: [],
    next_reporter_states: { allowed: [], forbidden: {} },
    linked_execution: { findingRef: null, taskRef: null },
    conversation_timeline: [],
    conversation_page: { has_more: false },
    permission_decisions: {},
    attachments: [],
  } as unknown as VocDetailEnvelope;
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function renderPanel(voc = TRIAGE_VOC) {
  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <TriagePanel voc={voc} />
    </Wrapper>,
  );
}

function mockDetail(result: Record<string, unknown>) {
  vi.mocked(useVocDetail).mockReturnValue(result as never);
}

describe('TriagePanel Overview and grouped navigation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockDetail({ data: detailEnvelope(DESCRIPTION), isLoading: false, isError: false });
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ actors: [] })),
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the title at prototype lg typography', () => {
    renderPanel();
    const h2 = screen.getByRole('heading', { level: 2, name: TRIAGE_VOC.title });
    expect(h2).toHaveClass('text-lg');
    expect(h2).toHaveClass('font-semibold');
    expect(h2).toHaveClass('leading-[1.35]');
    expect(h2).not.toHaveClass('text-xl');
  });

  it('renders exactly the four grouped section nav items in order without overflow', () => {
    renderPanel();
    const overview = screen.getByRole('button', { name: '개요' });
    const nav = overview.parentElement;
    expect(nav).not.toBeNull();
    const labels = within(nav as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent?.replace(/\s/g, ''));
    // #592: the recommendation section is named for the ADR-0034 surface, without the peer count.
    expect(labels).toEqual(['개요', '담당배정', '유사VOC추천', '요약']);
    expect(within(nav as HTMLElement).queryByText('더보기')).not.toBeInTheDocument();
    for (const removed of ['Body', 'Severity', 'Owner', 'Area', 'Cluster']) {
      expect(
        within(nav as HTMLElement).queryByRole('button', { name: new RegExp(removed) }),
      ).not.toBeInTheDocument();
    }
  });

  it('shows fetched description text and renders the title only once outside the description region', () => {
    renderPanel();
    expect(screen.getByText('구독 알림 발송이 멈췄습니다.')).toBeInTheDocument();
    expect(screen.getAllByText(TRIAGE_VOC.title)).toHaveLength(1);
    expect(screen.getByTestId('triage-description-region')).not.toHaveTextContent(TRIAGE_VOC.title);
  });

  it('shows muted empty-body copy for a structurally empty description', () => {
    mockDetail({
      data: detailEnvelope({ type: 'doc', content: [{ type: 'paragraph' }] }),
      isLoading: false,
      isError: false,
    });
    renderPanel();
    expect(screen.getByText('본문 없음')).toHaveClass('text-text-muted');
    expect(screen.getByTestId('triage-description-region')).not.toHaveTextContent(TRIAGE_VOC.title);
  });

  it('shows unavailable copy for a permission-limited summary envelope', () => {
    const summary: VocSummaryEnvelope = {
      id: TRIAGE_VOC.id,
      display_id: TRIAGE_VOC.display_id,
      primary_managed_system_id: TRIAGE_VOC.primary_managed_system_id,
      reporter_facing_status: TRIAGE_VOC.reporter_facing_status,
      created_at: TRIAGE_VOC.created_at,
      permission_decisions: {},
    };
    mockDetail({ data: summary, isLoading: false, isError: false });
    renderPanel();
    expect(
      screen.getByText('본문을 표시할 수 없습니다 — 이 VOC의 상세 내용을 볼 권한이 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('triage-description-region')).not.toHaveTextContent(TRIAGE_VOC.title);
  });

  it('shows load-failure copy when the detail query errors', () => {
    mockDetail({ isError: true, isLoading: false, error: new Error('failed') });
    renderPanel();
    expect(screen.getByText('본문을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByTestId('triage-description-region')).not.toHaveTextContent(TRIAGE_VOC.title);
  });

  it('keeps cached description visible when a background detail refetch errors', () => {
    mockDetail({
      data: detailEnvelope(DESCRIPTION),
      isError: true,
      isLoading: false,
      error: new Error('refetch failed'),
    });
    renderPanel();
    expect(screen.getByText('구독 알림 발송이 멈췄습니다.')).toBeInTheDocument();
    expect(screen.queryByText('본문을 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('wires reporter status and the actual baseline into the live Summary', () => {
    renderPanel();

    const transition = screen.getByTestId('reporter-status-transition');
    expect(transition).toBeInTheDocument();
    expect(transition).toHaveTextContent('접수됨');
    expect(transition).toHaveTextContent('검토 중');
    expect(screen.getByTestId('summary-no-changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '낮음' }));

    expect(screen.getAllByTestId(/^summary-diff-row-/)).toHaveLength(1);
    expect(screen.getByTestId('summary-diff-row-Severity')).toHaveTextContent('낮음');
    expect(screen.queryByTestId('summary-no-changes')).not.toBeInTheDocument();
  });

  it('shows a muted loading line without rendering title text as body', () => {
    mockDetail({ isLoading: true, isError: false, data: undefined });
    renderPanel();
    expect(screen.getByText('불러오는 중…')).toHaveClass('text-text-muted');
    expect(screen.getByTestId('triage-description-region')).not.toHaveTextContent(TRIAGE_VOC.title);
  });

  it('keeps disabled expand and more buttons in the panel header', () => {
    renderPanel();
    expect(screen.getByTestId('triage-panel-expand')).toBeDisabled();
    expect(screen.getByTestId('triage-panel-more')).toBeDisabled();
  });
});
