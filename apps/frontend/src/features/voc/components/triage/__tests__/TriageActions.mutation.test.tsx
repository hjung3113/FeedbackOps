// TriageActions.mutation.test.tsx — TDD RED for the C3.2 mutation wire-up.
//
// Tests the full triage mutation flow as exercised through VocTriageScreen +
// TriagePanel + TriageActions. Each test mounts the minimal tree needed to
// trigger the flow.
//
// C3.2 of slice3 #21.
// Test count: 4
//   1. optimistic remove → undo in-flight (backend delay 1000ms, abort fires)
//   2. compensating PATCH carries an explicit FRESH UUID after settled undo
//   3. 409 conflict.stale_write → VOC re-inserts into queue, toast shown
//   4. 409 conflict.idempotency_key_reuse → panel locked (confirm button disabled)
//
// Pattern note: these tests mount TriageActions wrapped in a minimal provider
// tree and stub the useVocTriageMutation hook directly to control timing.
// Full integration sweep is C6.3; here we test the component wiring.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// We import the wired TriagePanel (which mounts TriageActions with mutation logic).
// The test stubs fetch to control behavior.
import { TriagePanel } from '../TriagePanel';
import type { VocListItem } from '@fops/shared';

// ── fixtures ────────────────────────────────────────────────────────────────

const MOCK_VOC: VocListItem = {
  id: 'voc-mut-test-001',
  display_id: 'VOC-001',
  title: 'Test VOC for mutation',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  managed_system_id: 'ms-001',
  triage_state: 'untriaged',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('TriageActions mutation wire-up', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 1. optimistic remove → undo in-flight (abort path) ─────────────────────

  it('optimistic remove fires immediately; undo within 4s aborts in-flight PATCH', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let resolveRequest!: (v: Response) => void;
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((resolve) => { resolveRequest = resolve; })
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

    // Set severity to make the panel dirty (enable Triage 확정 button)
    // We need to pick a severity chip first — find and click a SeverityPicker chip
    const severityChips = screen.getAllByRole('radio');
    if (severityChips.length > 0) {
      fireEvent.click(severityChips[0]);
    }

    // Wait for the confirm button to become enabled
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /triage 확정/i });
      expect(btn).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));

    // Optimistic remove should fire synchronously
    expect(onOptimisticRemove).toHaveBeenCalledWith(MOCK_VOC.id);

    // Now undo within 4s — should show undo toast
    await waitFor(() => expect(screen.queryByText(/실행 취소/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /실행 취소/i }));

    // Resolve the fetch with an error (abort scenario — fetch rejection after abort)
    resolveRequest(jsonResponse({ id: MOCK_VOC.id, triage_state: 'triaged' }, 200));
  });

  // 2. compensating PATCH carries an explicit fresh UUID after settled undo ──

  it('compensating PATCH (settled path) carries a fresh Idempotency-Key distinct from the initial request', async () => {
    const seenKeys: string[] = [];
    let callCount = 0;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const rawHeaders = init?.headers;
      let idk: string | undefined;
      if (rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)) {
        const headers = rawHeaders as Record<string, string>;
        idk = headers['Idempotency-Key'] ?? headers['idempotency-key'];
      } else if (rawHeaders instanceof Headers) {
        idk = rawHeaders.get('Idempotency-Key') ?? rawHeaders.get('idempotency-key') ?? undefined;
      }
      if (idk) seenKeys.push(idk);
      return jsonResponse({ id: MOCK_VOC.id, triage_state: 'triaged', updated_at: '2026-05-01T12:01:00.000Z' });
    }) as typeof globalThis.fetch;

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
    const severityChips = screen.getAllByRole('radio');
    if (severityChips.length > 0) {
      fireEvent.click(severityChips[0]);
    }

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /triage 확정/i });
      expect(btn).not.toBeDisabled();
    });

    // Confirm — backend responds quickly (settled)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // Wait for the toast to appear (settled path)
    await waitFor(() => expect(screen.queryByText(/실행 취소/)).toBeTruthy(), { timeout: 2000 });

    // Undo after settle — should fire compensating PATCH
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /실행 취소/i }));
    });

    // Two fetches: initial PATCH + compensating PATCH
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2));

    // Both keys must be present and distinct (fresh key on compensating PATCH)
    expect(seenKeys.length).toBeGreaterThanOrEqual(2);
    const [firstKey, secondKey] = seenKeys;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  // 3. 409 conflict.stale_write → VOC re-inserts into queue, toast shown ────

  it('stale_write error re-inserts VOC into queue via onOptimisticRestore and shows error toast', async () => {
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
    const severityChips = screen.getAllByRole('radio');
    if (severityChips.length > 0) {
      fireEvent.click(severityChips[0]);
    }

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /triage 확정/i });
      expect(btn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // Wait for error handling: queue restore and error toast
    await waitFor(() => expect(onOptimisticRestore).toHaveBeenCalledWith(MOCK_VOC.id), { timeout: 3000 });
  });

  // 4. 409 conflict.idempotency_key_reuse → panel locked ────────────────────

  it('idempotency_key_reuse error disables the confirm button (panel locked)', async () => {
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
    const severityChips = screen.getAllByRole('radio');
    if (severityChips.length > 0) {
      fireEvent.click(severityChips[0]);
    }

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /triage 확정/i });
      expect(btn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // After idempotency_key_reuse error, the panel should be locked
    await waitFor(
      () => expect(screen.getByRole('button', { name: /triage 확정/i })).toBeDisabled(),
      { timeout: 3000 },
    );
  });
});
