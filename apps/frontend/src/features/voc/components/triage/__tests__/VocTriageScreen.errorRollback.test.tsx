// VocTriageScreen.errorRollback.test.tsx — codex REV-1 P1-#5
//
// Finding: error rollback reads vocIdRef.current. After optimistic remove,
// VocTriageScreen auto-advances the selected VOC to the next row. The mutation
// resolves AFTER auto-advance, so vocIdRef.current now points at the NEW
// panel VOC and the restore puts the wrong row back into the queue.
//
// Fix: close over input.vocId in onError, never vocIdRef.current.
//
// These integration tests exercise the FULL VocTriageScreen flow (not the
// component-level TriagePanel direct path) so that auto-advance actually
// happens before the error rollback runs — that is the exact path the bug
// lives on.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-id-rev1-5'),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { VocTriageScreen } from '../VocTriageScreen';
import type { VocListItem } from '@fops/shared';

const VOC_A_ID = 'voc-rev1-p1-5-a';
const VOC_B_ID = 'voc-rev1-p1-5-b';

const VOC_A: VocListItem = {
  id: VOC_A_ID,
  display_id: 'VOC-A',
  title: 'first voc — will fail',
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
};

const VOC_B: VocListItem = {
  id: VOC_B_ID,
  display_id: 'VOC-B',
  title: 'second voc — auto-advance target',
  reporter_facing_status: 'received',
  severity: 'medium',
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000099',
  reporter_id: '00000000-0000-0000-0000-000000000011',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
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

function clickSeverity() {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[0]) fireEvent.click(chips[0]);
}

describe('VocTriageScreen — error rollback after auto-advance (REV-1 #5)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // Hold the PATCH response on a deferred promise so the test can:
  //   1. fire confirm → optimistic remove + auto-advance synchronously,
  //   2. assert the panel re-rendered against VOC_B,
  //   3. THEN release the error → exercise the auto-advance race.
  function makeDeferredErrorFetch(status: number, code: string) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse({ actors: [] });
      await gate;
      return jsonResponse({ code, message: 'denied' }, status);
    }) as typeof globalThis.fetch;
    return { fetchFn, release: () => release() };
  }

  it('stale_write (409) after auto-advance restores VOC_A (the failed row), not VOC_B (the current panel row)', async () => {
    const { fetchFn, release } = makeDeferredErrorFetch(409, 'conflict.stale_write');
    globalThis.fetch = fetchFn;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <VocTriageScreen
          items={[VOC_A, VOC_B]}
          selectedId={VOC_A_ID}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // Both rows present at start.
    expect(screen.getByRole('button', { name: /voc-a/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voc-b/i })).toBeInTheDocument();

    clickSeverity();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // VOC_A optimistically removed → VocTriageScreen auto-advances to VOC_B.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /voc-a/i })).not.toBeInTheDocument();
    });
    // Detail panel now shows VOC-B's title.
    // Detail panel re-renders against VOC_B — multiple nodes carry the title
    // (PanelTitleBlock + NestedTextBlock), so use getAllByText.
    expect(screen.getAllByText(/second voc/i).length).toBeGreaterThan(0);

    // Release the PATCH → 409 stale_write fires AFTER auto-advance has happened.
    await act(async () => {
      release();
      // Yield so the error propagates through React Query.
      await new Promise<void>((r) => { setTimeout(r, 0); });
    });

    // VOC_A (the failing input.vocId) must be restored — NOT VOC_B.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /voc-a/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /voc-b/i })).toBeInTheDocument();
  });

  it('permission.denied (403) after auto-advance restores VOC_A, not VOC_B', async () => {
    const { fetchFn, release } = makeDeferredErrorFetch(403, 'permission.denied');
    globalThis.fetch = fetchFn;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <VocTriageScreen
          items={[VOC_A, VOC_B]}
          selectedId={VOC_A_ID}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    clickSeverity();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /voc-a/i })).not.toBeInTheDocument();
    });
    // Detail panel re-renders against VOC_B — multiple nodes carry the title
    // (PanelTitleBlock + NestedTextBlock), so use getAllByText.
    expect(screen.getAllByText(/second voc/i).length).toBeGreaterThan(0);

    await act(async () => {
      release();
      await new Promise<void>((r) => { setTimeout(r, 0); });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /voc-a/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /voc-b/i })).toBeInTheDocument();
  });
});
