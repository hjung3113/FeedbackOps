// VocTriageScreen.findingWiring.test.tsx — #527
//
// Clicking "Finding 만들기" in Triage used to commit the triage decision and
// show a stale "Finding 생성은 Slice 5에서 제공됩니다." toast instead of
// opening the real, already-shipped CreateFindingModal (used elsewhere in
// VocDetailPanel). VocTriageScreen now owns the modal's open state — it must
// survive the optimistic removal that unmounts TriagePanel for that VOC.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-finding-wiring'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const createFindingModalSpy = vi.fn();
vi.mock('@/features/cross-system/create-finding/CreateFindingModal', () => ({
  CreateFindingModal: (props: {
    vocId: string;
    managedSystemId: string;
    sourceAnalyticsAreaId: string | null;
    defaultTitle?: string;
    defaultSeverity?: string;
    open: boolean;
    onClose: () => void;
  }) => {
    createFindingModalSpy(props);
    return props.open ? <div data-testid="create-finding-modal-stub" /> : null;
  },
}));

import type { VocListItem } from '@fops/shared';
import { VocTriageScreen } from '../VocTriageScreen';

const MOCK_VOC: VocListItem = {
  id: 'voc-finding-wiring-001',
  display_id: 'VOC-FW-001',
  title: 'Finding wiring screen test',
  reporter_facing_status: 'received',
  severity: 'high',
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: 'aa-original',
  primary_managed_system_id: 'ms-001',
  reporter_id: 'reporter-001',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('VocTriageScreen — Finding wiring (#527)', () => {
  it('opens CreateFindingModal with VOC defaults and committed source context, not a deferral toast', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: MOCK_VOC.id,
            triage_state: 'triaged',
            updated_at: MOCK_VOC.updated_at,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;

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

    expect(screen.queryByTestId('create-finding-modal-stub')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));

    await waitFor(() =>
      expect(screen.getByTestId('create-finding-modal-stub')).toBeInTheDocument(),
    );
    expect(createFindingModalSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        vocId: MOCK_VOC.id,
        managedSystemId: MOCK_VOC.primary_managed_system_id,
        sourceAnalyticsAreaId: MOCK_VOC.analytics_area_id,
        defaultTitle: MOCK_VOC.title,
        defaultSeverity: 'high',
        open: true,
      }),
    );

    globalThis.fetch = originalFetch;
  });
});
