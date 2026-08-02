// TriagePanel.undoTokenBinding.test.tsx — codex REV-3 Cluster X
//
// Finding: TriagePanel issues UndoToast.onAction → undoLastRef.current(), which
// reads the latest hook state. After call A settles and call B starts, the
// still-visible toast A's button now operates on call B — clicking A's toast
// can abort/undo the unrelated follow-up mutation.
//
// Required behavior: each toast is bound to its specific call (token). Clicking
// an old toast after a newer mutation has started must NOT affect the newer
// call.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

// sonner mock — capture every toast.custom renderer so the test can render
// each toast independently (toast A and toast B).
const capturedRenderers: Array<(id: string | number) => React.ReactNode> = [];
const dismissedIds: Array<string | number> = [];

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedRenderers.push(renderer);
      return `toast-id-${capturedRenderers.length}`;
    }),
    dismiss: vi.fn((id: string | number) => {
      dismissedIds.push(id);
    }),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import type { VocListItem } from '@fops/shared';
import { TriagePanel } from '../TriagePanel';

const MOCK_VOC: VocListItem = {
  id: 'voc-rev3-clusterX',
  display_id: 'VOC-CX',
  title: 'REV-3 cluster X',
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

function clickSeverity(idx = 0) {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[idx]) fireEvent.click(chips[idx]);
}

function renderToast(container: HTMLElement, idx: number, hostId: string): HTMLElement | null {
  const renderer = capturedRenderers[idx];
  if (!renderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', hostId);
  container.appendChild(toastEl);
  const node = renderer(`toast-id-${idx + 1}`);
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return toastEl;
}

describe('TriagePanel — UndoToast token binding (REV-3 Cluster X)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedRenderers.length = 0;
    dismissedIds.length = 0;
    vi.restoreAllMocks();
  });

  it("clicking toast A's undo after call A has settled and call B has started does NOT abort/undo call B", async () => {
    // Call A resolves immediately. Call B never resolves (in-flight while we
    // click the stale toast A).
    let patchCount = 0;
    const patchAborted: boolean[] = [];

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse({ actors: [] });
      if (method === 'PATCH') {
        patchCount += 1;
        if (patchCount === 1) {
          // Call A — resolves fast with fresh updated_at.
          return jsonResponse({
            id: MOCK_VOC.id,
            triage_state: 'triaged',
            updated_at: '2026-05-02T00:00:00.000Z',
          });
        }
        // Call B — never resolves; record whether it gets aborted.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            patchAborted.push(true);
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }
      return jsonResponse({});
    }) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();

    const Wrapper = makeWrapper();
    const { baseElement, rerender } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    // ── Call A ────────────────────────────────────────────────────────────
    clickSeverity(0);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // Wait until call A resolves (toast captured + patchCount === 1).
    await waitFor(() => {
      expect(capturedRenderers.length).toBe(1);
      expect(patchCount).toBe(1);
    });

    // Simulate the parent advancing to a NEW voc (updated updated_at) so we can
    // fire a second mutation. We just rerender with the same VOC fields — the
    // panel allows another mutation now that the prior one settled.
    rerender(
      <Wrapper>
        <TriagePanel
          voc={{ ...MOCK_VOC, updated_at: '2026-05-02T00:00:00.000Z' }}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    // ── Call B (never resolves) ───────────────────────────────────────────
    clickSeverity(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    await waitFor(() => {
      expect(patchCount).toBe(2);
      expect(capturedRenderers.length).toBe(2);
    });

    // Reset restore mock so we can tell if clicking toast A causes any restore.
    onOptimisticRestore.mockClear();

    // ── Click TOAST A (stale) ─────────────────────────────────────────────
    renderToast(baseElement, 0, 'toast-A-host');
    const toastABtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="toast-A-host"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(toastABtn);
    });

    // Allow microtasks to flush.
    await new Promise((r) => setTimeout(r, 50));

    // The in-flight call B must NOT have been aborted by toast A's click.
    expect(patchAborted).toEqual([]);
    // No restore should fire for the in-flight B call.
    expect(onOptimisticRestore).not.toHaveBeenCalled();
  });
});
