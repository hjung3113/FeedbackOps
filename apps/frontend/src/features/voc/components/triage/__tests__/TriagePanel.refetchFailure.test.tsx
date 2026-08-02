// TriagePanel.refetchFailure.test.tsx — codex REV-4 Cluster Y refetch-failure path
//
// Finding (P1): when the first PATCH response lacks a fresh updated_at, compensateFn
// refetches the VOC to obtain one. If the refetch fails (network error), the catch
// block currently swallows the error and falls through to executeCompensatingPatch
// with the original stale If-Match, guaranteed to 409. The compensating PATCH may
// then reject inside fire-and-forget `void compensate()` in undoLast, producing an
// unhandled rejection with no user-facing toast.
//
// Required behavior (3 cases):
//   1. Refetch rejects (network error) → toast surfaced, no compensating PATCH fired,
//      no unhandled rejection.
//   2. Refetch succeeds but compensating PATCH 409s → toast surfaced, no unhandled rejection.
//   3. Refetch succeeds, compensating PATCH succeeds → happy path (onOptimisticRestore called).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

// ── sonner mock ──────────────────────────────────────────────────────────────
// Track the last toast.custom renderer so the test can render the undo toast.
// NOTE: capturedToastRenderer must be reset in afterEach.
let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;
// Track manually created DOM nodes so they can be removed after each test.
// RTL cleanup() removes RTL's container but not manually appended elements.
let toastHostEl: HTMLElement | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-rev4';
    }),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import type { VocListItem } from '@fops/shared';
import { toast } from 'sonner';
import { TriagePanel } from '../TriagePanel';

// ── shared fixtures ──────────────────────────────────────────────────────────

const ORIGINAL_UPDATED_AT = '2026-05-01T00:00:00.000Z';
const REFETCHED_UPDATED_AT = '2026-05-03T00:00:00.000Z';

const MOCK_VOC: VocListItem = {
  id: 'voc-rev4-clusterY',
  display_id: 'VOC-REV4-CY',
  title: 'REV-4 cluster Y refetch-failure',
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
  updated_at: ORIGINAL_UPDATED_AT,
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

function emptyResponse(status = 200): Response {
  return new Response('', { status });
}

function readHeader(init: RequestInit | undefined, name: string): string | undefined {
  const h = init?.headers;
  if (!h) return undefined;
  if (h instanceof Headers) return h.get(name) ?? h.get(name.toLowerCase()) ?? undefined;
  const obj = h as Record<string, string>;
  return obj[name] ?? obj[name.toLowerCase()];
}

/**
 * Renders the captured UndoToast renderer into a fresh DOM element appended to
 * `container`. The element reference is stored in `toastHostEl` so afterEach can
 * remove it and prevent stale DOM from leaking into subsequent tests.
 */
function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'rev4-toast-host');
  container.appendChild(el);
  toastHostEl = el; // track for cleanup
  const node = capturedToastRenderer('toast-id-rev4');
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(el);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return el;
}

function clickSeverity() {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[0]) fireEvent.click(chips[0]);
}

/**
 * Fires the confirm mutation and then clicks the undo button on the resulting
 * UndoToast. The `container` should be the element the toast is appended into —
 * using the RTL `container` (not `baseElement`) so the toast is inside RTL's
 * managed DOM subtree.
 */
async function fireMutationAndUndo(container: HTMLElement) {
  clickSeverity();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
  });

  // Wait for the mutation to settle and the toast renderer to be captured
  await waitFor(() => expect(capturedToastRenderer).not.toBeNull());

  const toastEl = renderCapturedToast(container);
  expect(toastEl).not.toBeNull();

  const undoBtn = await waitFor(() => {
    // Use the specific toast host element (not the full container) to avoid
    // matching stale buttons from prior tests.
    const el = toastEl!.querySelector('button');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

  await act(async () => {
    fireEvent.click(undoBtn);
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('TriagePanel — refetch-failure path (REV-4 Cluster Y)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    // Remove the manually appended toast host to prevent DOM leakage between tests.
    if (toastHostEl && toastHostEl.parentNode) {
      toastHostEl.parentNode.removeChild(toastHostEl);
    }
    toastHostEl = null;
    // Clear mock call history (not restoreAllMocks which would wipe vi.fn() impls
    // created in the vi.mock() factory).
    vi.clearAllMocks();
    // RTL cleanup — unmounts all rendered components.
    cleanup();
  });

  // ── Case 1: refetch itself fails (network error) ──────────────────────────
  it('Case 1: refetch fails → error toast surfaced, no compensating PATCH fired, no unhandled rejection', async () => {
    const patchIfMatchHeaders: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input.toString();

      if (method === 'GET') {
        if (url.includes(`/vocs/${MOCK_VOC.id}`)) {
          // Simulate network failure on the refetch
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse({ actors: [] });
      }

      if (method === 'PATCH') {
        const ifMatch = readHeader(init, 'If-Match');
        if (ifMatch !== undefined) patchIfMatchHeaders.push(ifMatch);
        // First PATCH: empty body (no fresh updated_at — triggers refetch path)
        return emptyResponse();
      }

      return jsonResponse({});
    }) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    await fireMutationAndUndo(container);

    // Allow async operations to settle
    await new Promise((r) => setTimeout(r, 100));
    await waitFor(
      () => {
        // An error toast must have been shown to the user
        expect(toast.error as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // Compensating PATCH must NOT have been attempted (only 1 PATCH = the original)
    expect(patchIfMatchHeaders).toHaveLength(1);
    expect(patchIfMatchHeaders[0]).toBe(ORIGINAL_UPDATED_AT);

    // No unhandled rejection: test passes if we reach here without throwing
  });

  // ── Case 2: refetch succeeds but compensating PATCH 409s ─────────────────
  it('Case 2: refetch succeeds but compensating PATCH 409s → error toast surfaced, no unhandled rejection', async () => {
    const patchIfMatchHeaders: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input.toString();

      if (method === 'GET') {
        if (url.includes(`/vocs/${MOCK_VOC.id}`)) {
          return jsonResponse({
            ...MOCK_VOC,
            triage_state: 'triaged',
            updated_at: REFETCHED_UPDATED_AT,
          });
        }
        return jsonResponse({ actors: [] });
      }

      if (method === 'PATCH') {
        const ifMatch = readHeader(init, 'If-Match');
        if (ifMatch !== undefined) patchIfMatchHeaders.push(ifMatch);

        if (patchIfMatchHeaders.length === 1) {
          // First PATCH: empty body (triggers refetch path)
          return emptyResponse();
        }
        // Compensating PATCH: 409 stale_write
        return jsonResponse({ code: 'conflict.stale_write', message: 'stale' }, 409);
      }

      return jsonResponse({});
    }) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    await fireMutationAndUndo(container);

    // Allow async compensate to run
    await waitFor(
      () => {
        expect(patchIfMatchHeaders.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );

    // The compensating PATCH used the fresh refetched updated_at
    expect(patchIfMatchHeaders[1]).toBe(REFETCHED_UPDATED_AT);

    // An error toast must have been surfaced after the 409
    await waitFor(
      () => {
        expect(toast.error as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // No unhandled rejection: test passes if we reach here without throwing
  });

  // ── Case 3: happy path (refetch succeeds, compensating PATCH succeeds) ────
  it('Case 3: refetch succeeds and compensating PATCH succeeds → onOptimisticRestore called, no error toast', async () => {
    const patchIfMatchHeaders: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input.toString();

      if (method === 'GET') {
        if (url.includes(`/vocs/${MOCK_VOC.id}`)) {
          return jsonResponse({
            ...MOCK_VOC,
            triage_state: 'triaged',
            updated_at: REFETCHED_UPDATED_AT,
          });
        }
        return jsonResponse({ actors: [] });
      }

      if (method === 'PATCH') {
        const ifMatch = readHeader(init, 'If-Match');
        if (ifMatch !== undefined) patchIfMatchHeaders.push(ifMatch);

        if (patchIfMatchHeaders.length === 1) {
          // First PATCH: empty body (triggers refetch path)
          return emptyResponse();
        }
        // Compensating PATCH: success
        return jsonResponse({
          id: MOCK_VOC.id,
          triage_state: 'untriaged',
          updated_at: '2026-05-04T00:00:00.000Z',
        });
      }

      return jsonResponse({});
    }) as typeof globalThis.fetch;

    const onOptimisticRestore = vi.fn();
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={onOptimisticRestore}
        />
      </Wrapper>,
    );

    await fireMutationAndUndo(container);

    // Happy path: onOptimisticRestore must be called
    await waitFor(
      () => {
        expect(onOptimisticRestore).toHaveBeenCalledWith(MOCK_VOC.id);
      },
      { timeout: 3000 },
    );

    // No error toast on the success path
    expect(toast.error as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
