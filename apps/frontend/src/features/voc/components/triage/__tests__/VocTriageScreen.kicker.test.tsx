// VocTriageScreen.kicker.test.tsx — V1 inline kicker (TDD RED → GREEN)
//
// Verifies that VocTriageScreen renders the "Console · Triage" kicker
// in the toolbar after removing ShellHeader from vocs.tsx. The kicker
// provides route identity inline in the 50px toolbar.
//
// Spec: .review/TRIAGE-LAYOUT-VARIANTS.html §V1 kicker styling.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-kicker-test'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { TRIAGE_STATE_LABELS } from '@/lib/copy/enum-labels';
import { VOC_TRIAGE_TAB_LABELS } from '@/lib/copy/voc-views';
import type { VocListItem } from '@fops/shared';
import { type TriageTab, VocTriageScreen } from '../VocTriageScreen';

const MOCK_VOC: VocListItem = {
  id: 'voc-kicker-001',
  display_id: 'VOC-K-001',
  title: '키커 테스트 VOC',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

const PINNED_OUT_OF_TAB_VOC: VocListItem = {
  ...MOCK_VOC,
  id: 'voc-kicker-pinned',
  display_id: 'VOC-K-PINNED',
  title: '이미 분류된 고정 VOC',
  triage_state: 'triaged',
  owner_user_id: '00000000-0000-0000-0000-000000000011',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function ControlledTriageScreen() {
  const [activeTab, setActiveTab] = useState<TriageTab>('unassigned');
  return (
    <VocTriageScreen
      items={[MOCK_VOC]}
      selectedId={MOCK_VOC.id}
      activeTab={activeTab}
      onSelectVoc={vi.fn()}
      onTabChange={setActiveTab}
    />
  );
}

describe('VocTriageScreen — V1 inline kicker', () => {
  it('associates each selected tab with the queue panel and end-aligns the strip', () => {
    render(
      <Wrapper>
        <ControlledTriageScreen />
      </Wrapper>,
    );

    const unassignedTab = screen.getByRole('tab', { name: /미배정/ });
    let panel = screen.getByRole('tabpanel');
    const viewport = screen.getByRole('tablist').closest('[data-list-toolbar-tabs]');
    expect(viewport?.firstElementChild).toHaveClass('ml-auto');
    expect(unassignedTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(unassignedTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', unassignedTab.id);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /높음/ }));

    const highTab = screen.getByRole('tab', { name: /높음/ });
    panel = screen.getByRole('tabpanel');
    expect(highTab).toHaveAttribute('aria-selected', 'true');
    expect(highTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(highTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', highTab.id);
  });

  it('renders independently supplied navigation counts on both supported tabs', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC, PINNED_OUT_OF_TAB_VOC]}
          selectedId={PINNED_OUT_OF_TAB_VOC.id}
          activeTab="unassigned"
          queueTotal={7}
          tabCounts={{ unassigned: 1, high: 3 }}
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    expect(screen.getByRole('tab', { name: /^미배정\s*,\s*1$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /^높음\s*,\s*3$/ })).toBeInTheDocument();
  });

  it('uses the shared untriaged label for the triage tab', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    expect(screen.getByRole('tab', { name: TRIAGE_STATE_LABELS.untriaged })).toBeInTheDocument();
  });

  it('uses the sidebar labels for the Unassigned and High severity tabs', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    expect(screen.getByRole('tab', { name: VOC_TRIAGE_TAB_LABELS.unassigned })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: VOC_TRIAGE_TAB_LABELS.high })).toBeInTheDocument();
  });

  it('locks the route-owned toolbar to the 50px h-toolbar rhythm', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    const toolbar = screen.getByTestId('triage-toolbar');
    expect(toolbar.className).toContain('h-toolbar');
    expect(toolbar).toHaveAttribute('data-toolbar-height', '50');
  });

  it('renders "Console" kicker label in the toolbar', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // The kicker "Console" segment must be present in the toolbar.
    // It renders as text with data-testid="triage-kicker-console".
    const consoleLabel = screen.getByTestId('triage-kicker-console');
    expect(consoleLabel).toBeInTheDocument();
    expect(consoleLabel.textContent).toBe('콘솔');
  });

  it('renders "Triage" kicker name in the toolbar', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // The kicker "Triage" segment must be present.
    const triageLabel = screen.getByTestId('triage-kicker-name');
    expect(triageLabel).toBeInTheDocument();
    expect(triageLabel.textContent).toBe('Triage');
  });

  it('kicker wrapper precedes the flag icon in DOM order (left-edge placement)', () => {
    const { container } = render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // The toolbar is the first flex container. Its first child should be the kicker div.
    const toolbar = container.querySelector('[data-testid="triage-toolbar"]');
    expect(toolbar).not.toBeNull();
    const firstChild = toolbar?.firstElementChild;
    expect(firstChild?.getAttribute('data-testid')).toBe('triage-kicker');
  });

  // Prototype ref: screen-voc-create.jsx:652-656 — "· N건 처리됨" processed count.
  it('hides the processed-count indicator when nothing has been processed', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByTestId('triage-processed-count')).not.toBeInTheDocument();
  });

  it('shows "N건 처리됨" after a successful confirm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              updated_at: '2026-05-02T00:00:00.000Z',
              items: [],
              available: false,
              reason: 'provider_disabled',
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const items: VocListItem[] = [
      MOCK_VOC,
      { ...MOCK_VOC, id: 'voc-kicker-002', display_id: 'VOC-K-002' },
    ];
    render(
      <Wrapper>
        <VocTriageScreen
          items={items}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByTestId('triage-processed-count')).not.toBeInTheDocument();

    // Stage a severity so the confirm button enables, then confirm to trigger
    // the command; only its successful response drives the processed count.
    fireEvent.click(screen.getByRole('button', { name: /높음/ }));
    fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));

    expect(screen.queryByTestId('triage-processed-count')).not.toBeInTheDocument();
    const count = await screen.findByTestId('triage-processed-count');
    expect(count).toBeInTheDocument();
    expect(count.textContent).toContain('1건 처리됨');
    vi.unstubAllGlobals();
  });

  it('expands the triage panel, handles Escape, and keeps its copy and deferred menu actions', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC]}
          selectedId={MOCK_VOC.id}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    const queue = screen.getByRole('tabpanel');
    const expand = screen.getByRole('button', { name: '전체 화면 전환' });
    expect(expand).toBeEnabled();
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument();

    fireEvent.click(expand);
    expect(queue).toHaveAttribute('hidden');
    expect(expand).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queue).not.toHaveAttribute('hidden');
    expect(expand).toHaveAttribute('aria-pressed', 'false');

    const more = screen.getByRole('button', { name: '더 보기' });
    fireEvent.keyDown(more, { key: 'Enter' });
    expect(screen.getByText('읽음 표시')).toBeInTheDocument();
    expect(screen.getByText('스누즈')).toBeInTheDocument();
  });
});
