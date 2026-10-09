// TriagePanel.findingWiring.test.tsx — #527
//
// "Finding 만들기" used to commit the triage decision and then show a
// hardcoded "Finding 생성은 Slice 5에서 제공됩니다." deferral toast, even
// though the real Finding-creation flow (CreateFindingModal) has shipped and
// is already used elsewhere (VocDetailPanel). Fix: TriagePanel now reports
// the committed vocId/managedSystemId/analyticsAreaId back through onAct so
// the parent (VocTriageScreen) can open CreateFindingModal instead.

import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { TriagePanel } from '../TriagePanel';

const VOC: VocListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  display_id: 'VOC-527',
  title: 'Finding wiring check',
  primary_managed_system_id: '00000000-0000-4000-8000-000000000010',
  analytics_area_id: '00000000-0000-4000-8000-000000000020',
  reporter_id: '00000000-0000-4000-8000-000000000002',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('TriagePanel — Finding wiring (#527)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reports the VOC title, triaged severity, and source context instead of the old deferral toast', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: VOC.id, triage_state: 'triaged', updated_at: VOC.updated_at }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ) as typeof globalThis.fetch;

    const onAct = vi.fn();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <TriagePanel
          voc={VOC}
          onAct={onAct}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={vi.fn()}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));

    expect(onAct).toHaveBeenCalledWith('finding', {
      vocId: VOC.id,
      managedSystemId: VOC.primary_managed_system_id,
      analyticsAreaId: VOC.analytics_area_id,
      title: VOC.title,
      severity: 'medium',
    });
    // No deferral toast — this is the defect #527 fixes.
    expect(toast.info).not.toHaveBeenCalled();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });
});
