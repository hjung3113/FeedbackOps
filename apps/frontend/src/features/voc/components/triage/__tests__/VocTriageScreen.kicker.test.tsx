// VocTriageScreen.kicker.test.tsx — V1 inline kicker (TDD RED → GREEN)
//
// Verifies that VocTriageScreen renders the "Console · Triage" kicker
// in the toolbar after removing ShellHeader from vocs.tsx. The kicker
// provides route identity inline in the 50px toolbar.
//
// Spec: .review/TRIAGE-LAYOUT-VARIANTS.html §V1 kicker styling.

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import { VocTriageScreen } from '../VocTriageScreen';
import type { VocListItem } from '@fops/shared';

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
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('VocTriageScreen — V1 inline kicker', () => {
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
});
