// TriageActions.mutation.test.tsx — C3.2 mutation wire-up tests.
//
// Tests the full triage mutation flow as exercised through TriagePanel +
// TriageActions. Each test mounts the minimal provider tree needed.
//
// C3.2 of slice3 #21.
// Test count: 4
//   1. optimistic remove fires synchronously on confirm click
//   2. compensating PATCH (settled undo) carries a FRESH Idempotency-Key
//   3. 409 conflict.stale_write → onOptimisticRestore called
//   4. 409 conflict.idempotency_key_reuse → confirm button becomes disabled
//
// Pattern: mock sonner so toast.custom is captured without needing a live Toaster.
// The compensating PATCH test triggers undo via the captured onAction callback.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── sonner mock — capture toast.custom so we can trigger undo programmatically ──

// Capture the most recent toast.custom renderer so tests can invoke onAction.
let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-001';
    }),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { TriagePanel } from '../TriagePanel';
import type { VocListItem } from '@fops/shared';

// ── fixtures ────────────────────────────────────────────────────────────────

const MOCK_VOC: VocListItem = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC for mutation',
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      {children}
    </QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Helper: make panel dirty by clicking a severity chip
function clickSeverity() {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[0]) fireEvent.click(chips[0]);
}

// Helper: render the captured toast renderer into the document body and return
// the element so the test can click "실행 취소".
function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'captured-toast');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-001');
  // Use ReactDOM.createRoot to render the toast node
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  act(() => { root.render(node as React.ReactElement); });
  return toastEl;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('TriageActions mutation wire-up', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 1. optimistic remove fires synchronously on confirm ────────────────────

  it('calls onOptimisticRemove synchronously when Triage 확정 is clicked', async () => {
    // Long-running fetch so the mutation stays in-flight
    globalThis.fetch = vi.fn(
      () => new Promise<Response>(() => { /* never resolves */ })
    ) as typeof globalThis.fetch;

    const onOptimisticRemove = vi.fn();
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={onOptimisticRemove}
        />
      </Wrapper>
    );

    // Make panel dirty
    clickSeverity();

    // Wait for confirm button to become enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    // Click confirm — optimistic remove should fire synchronously
    fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    expect(onOptimisticRemove).toHaveBeenCalledWith(MOCK_VOC.id);
  });

  // 2. compensating PATCH carries fresh Idempotency-Key after settled undo ──

  it('compensating PATCH (settled undo) uses a fresh Idempotency-Key distinct from the initial request', async () => {
    const seenKeys: string[] = [];
    let callCount = 0;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const rawHeaders = init?.headers;
      let idk: string | undefined;
      if (rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)) {
        const h = rawHeaders as Record<string, string>;
        idk = h['Idempotency-Key'] ?? h['idempotency-key'];
      } else if (rawHeaders instanceof Headers) {
        idk = rawHeaders.get('Idempotency-Key') ?? rawHeaders.get('idempotency-key') ?? undefined;
      }
      if (idk) seenKeys.push(idk);
      return jsonResponse({ id: MOCK_VOC.id, triage_state: 'triaged', updated_at: '2026-05-01T12:01:00.000Z' });
    }) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();
    const { baseElement } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>
    );

    // Make panel dirty
    clickSeverity();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    // Fire confirm — initial PATCH settles quickly
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // Wait for the initial mutation to settle (at least one fetch call)
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));

    // The toast renderer is now captured — render it and click "실행 취소"
    expect(capturedToastRenderer).not.toBeNull();
    const toastContainer = renderCapturedToast(baseElement);
    expect(toastContainer).not.toBeNull();

    // Find and click the undo button rendered by UndoToast
    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="captured-toast"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    // Wait for compensating PATCH to fire (second fetch call)
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2), { timeout: 3000 });

    // Both keys must be present and DISTINCT (D-3.5: compensating PATCH uses fresh key)
    expect(seenKeys.length).toBeGreaterThanOrEqual(2);
    expect(seenKeys[0]).toBeTruthy();
    expect(seenKeys[1]).toBeTruthy();
    expect(seenKeys[0]).not.toBe(seenKeys[1]);
  });

  // 3. stale_write → onOptimisticRestore called ─────────────────────────────

  it('stale_write (409) calls onOptimisticRestore to re-insert VOC into queue', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'conflict.stale_write', message: '다른 사용자가 먼저 수정했습니다.' }, 409)
    ) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>
    );

    // Make dirty
    clickSeverity();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // Backend returns 409 stale_write → VOC must be re-inserted
    await waitFor(
      () => expect(onOptimisticRestore).toHaveBeenCalledWith(MOCK_VOC.id),
      { timeout: 3000 },
    );
  });

  // 4. idempotency_key_reuse → panel locked ──────────────────────────────────

  it('idempotency_key_reuse (409) disables the Triage 확정 button (panel locked)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'conflict.idempotency_key_reuse', message: '이미 처리된 요청입니다.' }, 409)
    ) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
        />
      </Wrapper>
    );

    // Make dirty
    clickSeverity();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // After idempotency_key_reuse, panel must be locked → confirm disabled
    await waitFor(
      () => expect(screen.getByRole('button', { name: /triage 확정/i })).toBeDisabled(),
      { timeout: 3000 },
    );
  });
});
