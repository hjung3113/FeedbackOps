// VocTriageScreen.kicker.test.tsx — V1 inline kicker (TDD RED → GREEN)
//
// Verifies that VocTriageScreen renders the "Console · Triage" kicker
// in the toolbar after removing ShellHeader from vocs.tsx. The kicker
// provides route identity inline in the 50px toolbar.
//
// Spec: .review/TRIAGE-LAYOUT-VARIANTS.html §V1 kicker styling.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
import { VocTriageScreen } from '../VocTriageScreen';

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

describe('VocTriageScreen — V1 inline kicker', () => {
  it('renders independently supplied navigation counts on both supported tabs', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[MOCK_VOC, PINNED_OUT_OF_TAB_VOC]}
          selectedId={PINNED_OUT_OF_TAB_VOC.id}
          activeTab="unassigned"
          queueTotal={7}
          unassignedTabCount={1}
          highTabCount={3}
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    expect(screen.getByRole('tab', { name: /미배정 1/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /높은 심각도 3/ })).toBeInTheDocument();
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
    expect(consoleLabel.textContent).toBe('Console');
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

  it('shows "N건 처리됨" after a VOC is optimistically removed (confirm)', () => {
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
    // the optimistic remove that drives the processed count.
    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));

    const count = screen.getByTestId('triage-processed-count');
    expect(count).toBeInTheDocument();
    expect(count.textContent).toContain('1건 처리됨');
  });
});
