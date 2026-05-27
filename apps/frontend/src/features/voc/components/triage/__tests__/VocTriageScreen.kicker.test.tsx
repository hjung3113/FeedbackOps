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

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('VocTriageScreen — V1 inline kicker', () => {
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
