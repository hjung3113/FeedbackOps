// TriagePanel.undoRestore.test.tsx — codex REV-1 P1-#1
//
// Finding: Undo during in-flight triage does not restore the optimistically
// removed row. Clicking 실행 취소 aborts the in-flight PATCH via
// useUndoableMutation, but TriagePanel never calls onOptimisticRestore, so the
// VOC stays hidden from the queue.
//
// Fix expectation: pending-abort path must invoke onOptimisticRestore(vocId).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

// sonner mock — capture toast.custom renderer
let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-undo-restore';
    }),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import type { VocListItem } from '@fops/shared';
import { TriagePanel } from '../TriagePanel';

const MOCK_VOC: VocListItem = {
  id: 'voc-rev1-p1-1',
  display_id: 'VOC-R1',
  title: 'REV-1 P1-1',
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

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function clickSeverity() {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[0]) fireEvent.click(chips[0]);
}

function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'rev1-toast-host');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-undo-restore');
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return toastEl;
}

describe('TriagePanel — undo while in-flight (REV-1 #1)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
  });

  it('clicking 실행 취소 while PATCH is in-flight calls onOptimisticRestore with the VOC id', async () => {
    // Long-running fetch — never resolves before undo is clicked.
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>(() => {
          /* never resolves */
        }),
    ) as typeof globalThis.fetch;

    const onOptimisticRemove = vi.fn();
    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();

    const { baseElement } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={onOptimisticRemove}
          onOptimisticRestore={onOptimisticRestore}
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

    // Optimistic remove fired
    expect(onOptimisticRemove).toHaveBeenCalledWith(MOCK_VOC.id);

    // Toast captured — render and click 실행 취소 BEFORE the PATCH resolves.
    expect(capturedToastRenderer).not.toBeNull();
    renderCapturedToast(baseElement);

    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="rev1-toast-host"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    // The in-flight PATCH was aborted; the row must be restored to the queue.
    await waitFor(() => {
      expect(onOptimisticRestore).toHaveBeenCalledWith(MOCK_VOC.id);
    });
  });
});
