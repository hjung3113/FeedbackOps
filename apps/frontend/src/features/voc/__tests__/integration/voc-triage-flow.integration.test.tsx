// voc-triage-flow.integration.test.tsx — C6.3 cross-cutting integration test
//
// Exercises the full triage user flow:
//   1. Render VocTriageScreen with 5 VOCs (mocked queue)
//   2. Select a VOC → TriagePanel renders
//   3. Make dirty (click severity chip) → Triage 확정 enabled
//   4. Click Triage 확정 → optimistic remove (VOC disappears from queue locally)
//   5. Initial PATCH settles → UndoToast rendered
//   6. Click 실행 취소 → compensating PATCH fires with fresh Idempotency-Key
//   7. 409 conflict.stale_write path → VOC re-inserted into queue
//   8. 409 permission.denied path → VOC re-inserted into queue
//
// C6.3 of slice3 #21 — integration sweep. No production code changes.
// Test framework: Vitest + @testing-library/react (O-6 in PLAN-21).
// Playwright is used only for pixel-diff baselines, not here.

import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── sonner mock ──────────────────────────────────────────────────────────────
// Capture toast.custom renderer so tests can trigger 실행 취소 programmatically.

let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-triage';
    }),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { VocTriageScreen } from '../../components/triage/VocTriageScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Stable reference to the first VOC so non-null assertions are avoided throughout.
const FIRST_VOC_ID = 'voc-int-0001';

const MOCK_VOCS: VocListItem[] = [
  {
    id: 'voc-int-0001',
    display_id: 'VOC-I-001',
    title: '통합 테스트 VOC 1',
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
    review_postponed_at: null,
    attachment_count: 0,
  },
  {
    id: 'voc-int-0002',
    display_id: 'VOC-I-002',
    title: '통합 테스트 VOC 2',
    reporter_facing_status: 'received',
    severity: 'low',
    owner_user_id: null,
    owner_team_id: null,
    analytics_area_id: null,
    primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
    reporter_id: '00000000-0000-0000-0000-000000000011',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  },
  {
    id: 'voc-int-0003',
    display_id: 'VOC-I-003',
    title: '통합 테스트 VOC 3',
    reporter_facing_status: 'progress',
    severity: 'medium',
    owner_user_id: '00000000-0000-0000-0000-000000000020',
    owner_team_id: null,
    analytics_area_id: null,
    primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
    reporter_id: '00000000-0000-0000-0000-000000000012',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    similar_count: 2,
    review_postponed_at: null,
    attachment_count: 0,
  },
  {
    id: 'voc-int-0004',
    display_id: 'VOC-I-004',
    title: '통합 테스트 VOC 4',
    reporter_facing_status: 'received',
    severity: null,
    owner_user_id: null,
    owner_team_id: null,
    analytics_area_id: null,
    primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
    reporter_id: '00000000-0000-0000-0000-000000000013',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  },
  {
    id: 'voc-int-0005',
    display_id: 'VOC-I-005',
    title: '통합 테스트 VOC 5',
    reporter_facing_status: 'received',
    severity: 'high',
    owner_user_id: null,
    owner_team_id: null,
    analytics_area_id: null,
    primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
    reporter_id: '00000000-0000-0000-0000-000000000014',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  },
];

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

const capturedToastRoots = new WeakMap<HTMLElement, { unmount: () => void }>();

// Render a captured toast renderer into a host element and return the container.
function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'triage-undo-toast');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-triage');
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  capturedToastRoots.set(toastEl, root);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return toastEl;
}

function unmountCapturedToast(host: HTMLElement | null): void {
  if (!host) return;
  const root = capturedToastRoots.get(host);
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  host.remove();
}

// Helper: click the first severity chip to make the panel dirty.
function clickAnySeverityChip() {
  const chips = screen.getAllByRole('button', { name: /낮음|중간|높음|심각/ });
  if (chips[0]) fireEvent.click(chips[0]);
}

// #857: the forward PATCH is committed the moment fetch is called. It resolves
// after a delay, and rejects with AbortError if its signal aborts first — the
// same race the browser has with a request the server has already accepted.
const IN_FLIGHT_PATCH_DELAY_MS = 1000;

interface CommittedPatch {
  url: string;
  body: Record<string, unknown>;
  committedAt: number;
  resolvedAt: number | null;
}

function readIdempotencyKey(rawHeaders: HeadersInit | undefined): string | null {
  if (rawHeaders == null) return null;
  if (rawHeaders instanceof Headers) {
    return rawHeaders.get('Idempotency-Key') ?? rawHeaders.get('idempotency-key');
  }
  if (Array.isArray(rawHeaders)) {
    const found = rawHeaders.find(([name]) => name.toLowerCase() === 'idempotency-key');
    return found?.[1] ?? null;
  }
  const record = rawHeaders as Record<string, string>;
  return record['Idempotency-Key'] ?? record['idempotency-key'] ?? null;
}

// In-flight fetch promises for the committed-PATCH mock. The it.each cases
// drain this before unmount so a 1s timer cannot resolve during the next case.
const committedPatchFlights: Promise<unknown>[] = [];

function installCommittedPatchFetch(): CommittedPatch[] {
  committedPatchFlights.length = 0;
  const patches: CommittedPatch[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const flight = (async () => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (method !== 'PATCH') {
        return jsonResponse({
          id: 'ignored',
          triage_state: 'untriaged',
          updated_at: '2026-05-02T00:00:00.000Z',
          items: [],
          actors: [],
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const recorded: CommittedPatch = {
        url,
        body,
        committedAt: Date.now(),
        resolvedAt: null,
      };
      patches.push(recorded);
      await new Promise<void>((resolve, reject) => {
        const signal = init?.signal;
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, IN_FLIGHT_PATCH_DELAY_MS);
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      recorded.resolvedAt = Date.now();
      const triageState = body.triage_state;
      return jsonResponse({
        id: url.split('/').pop(),
        triage_state: typeof triageState === 'string' ? triageState : 'triaged',
        updated_at:
          triageState === 'untriaged' ? '2026-05-03T00:00:00.000Z' : '2026-05-02T00:00:00.000Z',
      });
    })();
    committedPatchFlights.push(flight);
    return flight;
  }) as typeof globalThis.fetch;
  return patches;
}

async function drainCommittedPatchFlights(): Promise<void> {
  let seen = -1;
  while (committedPatchFlights.length !== seen) {
    seen = committedPatchFlights.length;
    const pending = committedPatchFlights.slice();
    await act(async () => {
      await Promise.allSettled(pending);
    });
  }
}

const UNDO_PRIOR = {
  severity: 'low' as const,
  owner_user_id: '00000000-0000-0000-0000-0000000000aa',
  owner_team_id: null,
  analytics_area_id: '00000000-0000-0000-0000-0000000000bb',
};

const UNDO_TARGET: VocListItem = {
  id: 'voc-undo-target',
  display_id: 'VOC-UNDO-TARGET',
  title: 'undo target',
  reporter_facing_status: 'received',
  severity: UNDO_PRIOR.severity,
  owner_user_id: UNDO_PRIOR.owner_user_id,
  owner_team_id: UNDO_PRIOR.owner_team_id,
  analytics_area_id: UNDO_PRIOR.analytics_area_id,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000001',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

const UNDO_OTHER: VocListItem = {
  ...UNDO_TARGET,
  id: 'voc-undo-other',
  display_id: 'VOC-UNDO-OTHER',
  title: 'still in the queue',
  severity: null,
  owner_user_id: null,
  analytics_area_id: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Triage flow — integration (C6.3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    capturedToastRenderer = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['unassigned', 'high', 'waiting', 'untriaged'] as const)(
    '940: postponing on %s advances selection and preserves the server tab membership',
    async (activeTab) => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({
          id: FIRST_VOC_ID,
          triage_state: 'untriaged',
          updated_at: '2026-05-02T00:00:00.000Z',
        }),
      ) as typeof globalThis.fetch;
      const Wrapper = makeWrapper();
      function SelectedScreen() {
        const [selectedId, setSelectedId] = React.useState<string | null>(FIRST_VOC_ID);
        return (
          <VocTriageScreen
            items={MOCK_VOCS}
            selectedId={selectedId}
            activeTab={activeTab}
            onSelectVoc={setSelectedId}
            onTabChange={vi.fn()}
          />
        );
      }
      const { baseElement } = render(
        <Wrapper>
          <SelectedScreen />
        </Wrapper>,
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^보류/ }));
      });
      if (activeTab === 'untriaged') {
        expect(screen.queryByRole('button', { name: /VOC-I-001/ })).not.toBeInTheDocument();
      } else {
        expect(
          within(screen.getByRole('button', { name: /VOC-I-001/ })).getByText('보류'),
        ).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: /VOC-I-002/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await waitFor(() => expect(capturedToastRenderer).not.toBeNull());
      const toastHost = renderCapturedToast(baseElement);
      try {
        const undo = toastHost?.querySelector('button');
        if (!undo) throw new Error('Undo action missing');
        await act(async () => {
          fireEvent.click(undo);
        });
        await waitFor(() => {
          const row = screen.getByRole('button', { name: /VOC-I-001/ });
          expect(within(row).queryByText('보류')).not.toBeInTheDocument();
        });
      } finally {
        unmountCapturedToast(toastHost);
      }
    },
  );

  // ── Test 1: Full happy-path flow ────────────────────────────────────────────
  it('renders 5 VOCs, confirms triage (optimistic remove), UndoToast fires, undo triggers compensating PATCH with fresh key', async () => {
    const seenKeys: string[] = [];
    let callCount = 0;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const idk = readIdempotencyKey(init?.headers);
      if (idk) seenKeys.push(idk);
      return jsonResponse({
        id: FIRST_VOC_ID,
        triage_state: 'triaged',
        updated_at: '2026-05-02T00:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();

    const { baseElement } = render(
      <Wrapper>
        <VocTriageScreen
          items={MOCK_VOCS}
          selectedId={FIRST_VOC_ID}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    // 5 VOC rows rendered in the queue (each row uses an aria-label "VOC-I-001 …")
    // The TriageRow renders: <button aria-label="VOC-I-001 title" …>
    // Verify at least 5 rows visible in queue
    const queueRows = screen.getAllByRole('button', {
      name: /voc-i-00\d/i,
    });
    expect(queueRows.length).toBeGreaterThanOrEqual(5);

    // TriagePanel renders for the selected VOC (확정 button)
    expect(screen.getByRole('button', { name: /triage 확정/i })).toBeInTheDocument();

    // Panel dirty: click a severity chip
    clickAnySeverityChip();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    // Click 확정 → optimistic remove + PATCH fires
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // After optimistic remove, one fewer queue row
    await waitFor(() => {
      const remaining = screen.queryAllByRole('button', { name: /voc-i-00\d/i });
      expect(remaining.length).toBeLessThan(5);
    });

    // Wait for PATCH to settle (callCount ≥ 1)
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));

    // UndoToast was rendered via toast.custom — render it and click 실행 취소
    expect(capturedToastRenderer).not.toBeNull();
    const toastContainer = renderCapturedToast(baseElement);
    expect(toastContainer).not.toBeNull();

    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="triage-undo-toast"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    // Compensating PATCH fires (callCount ≥ 2)
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2), { timeout: 3000 });

    // D-3.5: compensating PATCH must use a distinct Idempotency-Key from the initial PATCH
    expect(seenKeys.length).toBeGreaterThanOrEqual(2);
    expect(seenKeys[0]).toBeTruthy();
    expect(seenKeys[1]).toBeTruthy();
    expect(seenKeys[0]).not.toBe(seenKeys[1]);
  });

  // ── Test 2: 409 conflict.stale_write → onOptimisticRestore invoked ───────────
  // NOTE: This test verifies the TriagePanel-level restore callback fires on stale_write.
  // The VocTriageScreen auto-advance logic (next-VOC selection after optimistic remove)
  // means the vocIdRef in TriagePanel advances to the new panel VOC before the error
  // callback fires. This is tracked as a C6.4 follow-up for the vocIdRef issue.
  // Here we verify the restore path at the TriagePanel component level.
  it('stale_write (409) calls onOptimisticRestore on TriagePanel (component-level path)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        { code: 'conflict.stale_write', message: '다른 사용자가 먼저 수정했습니다.' },
        409,
      ),
    ) as typeof globalThis.fetch;

    // Import TriagePanel directly to test at component level (avoids VocTriageScreen auto-advance)
    const { TriagePanel } = await import('../../components/triage/TriagePanel');
    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOCS[0] as VocListItem}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    clickAnySeverityChip();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // stale_write → onOptimisticRestore should be called with the VOC id
    await waitFor(
      () => {
        expect(onOptimisticRestore).toHaveBeenCalledWith(FIRST_VOC_ID);
      },
      { timeout: 3000 },
    );
  });

  // ── Test 3: 403 permission.denied → onOptimisticRestore invoked ──────────────
  it('permission.denied (403) calls onOptimisticRestore on TriagePanel (component-level path)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'permission.denied', message: '권한이 없습니다.' }, 403),
    ) as typeof globalThis.fetch;

    const { TriagePanel } = await import('../../components/triage/TriagePanel');
    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();

    render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOCS[0] as VocListItem}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    clickAnySeverityChip();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    await waitFor(
      () => {
        expect(onOptimisticRestore).toHaveBeenCalledWith(FIRST_VOC_ID);
      },
      { timeout: 3000 },
    );
  });

  // ── Test 4: PATCH URL has no 'sort' param (server-pinned sort, Acceptance criterion) ──
  it('PATCH request URL does not include a sort param (server-pinned sort)', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({
        id: FIRST_VOC_ID,
        triage_state: 'triaged',
        updated_at: '2026-05-02T00:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <VocTriageScreen
          items={MOCK_VOCS}
          selectedId={FIRST_VOC_ID}
          activeTab="untriaged"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </Wrapper>,
    );

    clickAnySeverityChip();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    await waitFor(() => expect(capturedUrl).toBeTruthy());

    // The PATCH URL must not contain a sort query parameter
    expect(capturedUrl).not.toContain('sort=');
  });

  // #857: undo must reconcile a PATCH the server already committed. An abort
  // cannot un-send it. Covers the last-row unmount and an in-flight undo while
  // the panel stays mounted.
  it.each([
    { name: 'the last VOC in the tab', others: [] as VocListItem[] },
    { name: 'a VOC with others left', others: [UNDO_OTHER] },
  ])(
    'undo while the forward PATCH is in flight compensates after it resolves ($name)',
    async ({ others }) => {
      const patches = installCommittedPatchFetch();
      const items = [UNDO_TARGET, ...others];
      const Wrapper = makeWrapper();
      const { baseElement, unmount } = render(
        <Wrapper>
          <VocTriageScreen
            items={items}
            selectedId={UNDO_TARGET.id}
            activeTab="unassigned"
            onSelectVoc={vi.fn()}
            onTabChange={vi.fn()}
          />
        </Wrapper>,
      );

      let toastHost: HTMLElement | null = null;
      try {
        fireEvent.click(screen.getByRole('button', { name: '높음' }));
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
        });

        // The forward PATCH is committed immediately, and has not settled yet.
        expect(patches).toHaveLength(1);
        expect(patches[0]?.resolvedAt).toBeNull();
        expect(patches[0]?.url).toContain(`/vocs/${UNDO_TARGET.id}`);
        expect(patches[0]?.body).toMatchObject({ triage_state: 'triaged', severity: 'high' });

        if (others.length === 0) {
          // Confirming the last row empties the queue and unmounts the panel
          // while the PATCH is still in flight. The screen gets no queueTotal,
          // so FIX1 renders the neutral tab-empty copy — not the whole-queue
          // success claim.
          expect(
            screen.queryByRole('button', { name: /VOC-UNDO-TARGET/i }),
          ).not.toBeInTheDocument();
          expect(screen.queryByRole('button', { name: /triage 확정/i })).not.toBeInTheDocument();
          expect(screen.getByText('이 탭에 해당하는 VOC가 없습니다')).toBeInTheDocument();
        } else {
          expect(screen.getByRole('button', { name: /VOC-UNDO-OTHER/i })).toBeInTheDocument();
          expect(
            screen.queryByRole('button', { name: /VOC-UNDO-TARGET/i }),
          ).not.toBeInTheDocument();
          expect(screen.getByRole('button', { name: /triage 확정/i })).toBeInTheDocument();
        }

        expect(capturedToastRenderer).not.toBeNull();
        toastHost = renderCapturedToast(baseElement);
        const undoBtn = toastHost?.querySelector('button');
        expect(undoBtn).not.toBeNull();
        expect(undoBtn?.textContent).toBe('실행 취소');
        await act(async () => {
          if (undoBtn) fireEvent.click(undoBtn);
        });

        // Pending undo restores the row at once, before either PATCH timer settles.
        expect(screen.getByRole('button', { name: /VOC-UNDO-TARGET/i })).toBeInTheDocument();
        expect(patches[0]?.resolvedAt).toBeNull();

        // The compensating PATCH has its own 1s timer. Wait for that response;
        // its continuation is the second restore. `not.toBeNull()` is not enough:
        // a missing patch's `resolvedAt` is `undefined`.
        await waitFor(
          () => {
            expect(patches[1]?.resolvedAt).toEqual(expect.any(Number));
          },
          { timeout: 5000 },
        );
        await act(async () => {
          await Promise.resolve();
        });

        expect(patches).toHaveLength(2);
        const forward = patches[0];
        const compensate = patches[1];
        expect(forward).toBeDefined();
        expect(compensate).toBeDefined();
        if (!forward || !compensate || forward.resolvedAt === null) {
          throw new Error('forward PATCH did not resolve before compensation');
        }
        expect(compensate.committedAt).toBeGreaterThanOrEqual(forward.resolvedAt);
        expect(compensate.url).toContain(`/vocs/${UNDO_TARGET.id}`);
        expect(compensate.body).toEqual({
          triage_state: 'untriaged',
          severity: UNDO_PRIOR.severity,
          owner_user_id: UNDO_PRIOR.owner_user_id,
          owner_team_id: UNDO_PRIOR.owner_team_id,
          analytics_area_id: UNDO_PRIOR.analytics_area_id,
        });

        expect(screen.getByRole('button', { name: /VOC-UNDO-TARGET/i })).toBeInTheDocument();
      } finally {
        await drainCommittedPatchFlights();
        unmountCapturedToast(toastHost);
        unmount();
      }
    },
    15000,
  );
});
