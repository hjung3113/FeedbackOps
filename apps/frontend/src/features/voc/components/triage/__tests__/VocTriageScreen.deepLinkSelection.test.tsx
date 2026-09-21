// VocTriageScreen.deepLinkSelection.test.tsx — #383
//
// The VOC detail panel's "트리아지에서 변경" button deep-links into this screen
// with ?selected=<id>. Before the fix, a target the queue could not show fell
// through `?? liveQueue[0]` and put a DIFFERENT VOC's commit form on screen with
// no indication the target had changed — a wrong-record write hazard.
//
// Two behaviours must stay apart:
//   - selection absent from the server result  → show nothing, say so
//   - selection present but optimistically removed (just triaged) → auto-advance

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-deeplink-test'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import type { VocListItem } from '@fops/shared';
import { VocTriageScreen } from '../VocTriageScreen';

function makeVoc(id: string, displayId: string, title: string): VocListItem {
  return {
    id,
    display_id: displayId,
    title,
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
}

const QUEUED = makeVoc('voc-queued-001', 'VOC-Q-001', '대기열에 있는 다른 VOC');

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('VocTriageScreen — deep-link selection (#383)', () => {
  it('does not swap in another VOC when the deep-link target is absent', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[QUEUED]}
          selectedId="voc-not-in-this-queue"
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // Assert the explanation is on screen FIRST — otherwise the negative
    // assertion below would also pass on a screen that rendered nothing.
    expect(screen.getByTestId('triage-deeplink-missing')).toBeInTheDocument();

    // The other VOC's commit form must not have been substituted. Its title
    // still appears in the left queue, so key off the panel's commit control.
    expect(screen.queryByRole('button', { name: /Triage 확정/ })).not.toBeInTheDocument();
  });

  it('still auto-advances after the selected VOC is triaged away', () => {
    const NEXT = makeVoc('voc-next-002', 'VOC-Q-002', '다음 VOC');

    const { rerender } = render(
      <Wrapper>
        <VocTriageScreen
          items={[QUEUED, NEXT]}
          selectedId={QUEUED.id}
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // Selected item is in the server result → panel shows it, no missing notice.
    expect(screen.queryByTestId('triage-deeplink-missing')).not.toBeInTheDocument();

    // Server drops the triaged row on refetch; the selection id lingers in the
    // URL. That is the auto-advance case, NOT a broken deep link.
    rerender(
      <Wrapper>
        <VocTriageScreen
          items={[NEXT]}
          selectedId={QUEUED.id}
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // The row was this screen's selection a moment ago, so this is the
    // auto-advance case — NOT a broken deep link.
    expect(screen.queryByTestId('triage-deeplink-missing')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Triage 확정/ })).toBeInTheDocument();
  });

  it('falls back to the first queue item when no selection is requested', () => {
    render(
      <Wrapper>
        <VocTriageScreen
          items={[QUEUED]}
          selectedId={null}
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    expect(screen.queryByTestId('triage-deeplink-missing')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Triage 확정/ })).toBeInTheDocument();
  });
});
