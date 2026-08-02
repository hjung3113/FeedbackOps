// TriagePanel.emptyBodyCompensate.test.tsx — codex REV-3 Cluster Y
//
// Finding: `apiClient` returns `undefined` for an empty 200 body. The current
// compensate path reads `output.updated_at` when `output !== null`. If the
// PATCH responds with an empty body, `output` is `undefined`, and the strict
// `typeof output?.updated_at === 'string'` guard already in place falls back
// to the stale snapshot.ifMatch — which then 409s.
//
// Required behavior: when the first PATCH response carries no fresh
// `updated_at`, the hook must refetch `['voc', vocId]` and use the fresh
// `updated_at` from that envelope as the If-Match for the compensating PATCH.
// Throwing on `undefined` (the old breakage) is not acceptable either.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-clusterY';
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

const ORIGINAL_UPDATED_AT = '2026-05-01T00:00:00.000Z';
const REFETCHED_UPDATED_AT = '2026-05-02T12:00:00.000Z';

const MOCK_VOC: VocListItem = {
  id: 'voc-rev3-clusterY',
  display_id: 'VOC-CY',
  title: 'REV-3 cluster Y',
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

function emptyResponse(): Response {
  return new Response('', { status: 200 });
}

function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'rev3-Y-toast-host');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-clusterY');
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return toastEl;
}

function clickSeverity() {
  const chips = screen.getAllByRole('button', { name: /low|medium|high|critical/i });
  if (chips[0]) fireEvent.click(chips[0]);
}

function readHeader(init: RequestInit | undefined, name: string): string | undefined {
  const h = init?.headers;
  if (!h) return undefined;
  if (h instanceof Headers) return h.get(name) ?? h.get(name.toLowerCase()) ?? undefined;
  const obj = h as Record<string, string>;
  return obj[name] ?? obj[name.toLowerCase()];
}

describe('TriagePanel — empty-body compensate (REV-3 Cluster Y)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
  });

  it('when PATCH success has empty body, compensate refetches the VOC and uses the fresh updated_at as If-Match (no throw)', async () => {
    const patchIfMatchHeaders: string[] = [];
    let vocDetailFetched = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input.toString();

      if (method === 'GET') {
        if (url.includes(`/vocs/${MOCK_VOC.id}`)) {
          vocDetailFetched += 1;
          // Refetched envelope carries the post-PATCH fresh updated_at.
          // Envelope is flat per packages/shared/src/vocs/detail.ts.
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
        // First PATCH: empty body (200 OK, no JSON).
        if (patchIfMatchHeaders.length === 1) return emptyResponse();
        // Compensating PATCH: succeed.
        return jsonResponse({
          id: MOCK_VOC.id,
          triage_state: 'untriaged',
          updated_at: '2026-05-03T00:00:00.000Z',
        });
      }
      return jsonResponse({});
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
      </Wrapper>,
    );

    clickSeverity();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    // First PATCH fired.
    await waitFor(() => expect(patchIfMatchHeaders.length).toBeGreaterThanOrEqual(1));
    expect(patchIfMatchHeaders[0]).toBe(ORIGINAL_UPDATED_AT);

    // Render undo toast and click 실행 취소
    expect(capturedToastRenderer).not.toBeNull();
    renderCapturedToast(baseElement);
    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="rev3-Y-toast-host"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    // After undo, compensate path must refetch the VOC detail (because the
    // first PATCH body was empty / lacked fresh updated_at) and fire a 2nd
    // PATCH using REFETCHED_UPDATED_AT as If-Match.
    await waitFor(
      () => expect(patchIfMatchHeaders.length).toBeGreaterThanOrEqual(2),
      { timeout: 3000 },
    );
    expect(vocDetailFetched).toBeGreaterThanOrEqual(1);
    expect(patchIfMatchHeaders[1]).toBe(REFETCHED_UPDATED_AT);

    // And — critically — the prior implementation would have thrown
    // `Cannot read properties of undefined (reading 'updated_at')` inside
    // compensateFn, propagating as an unhandled rejection. Verify the queue
    // got restored cleanly via onOptimisticRestore (the compensate success
    // path).
    await waitFor(() => {
      expect(onOptimisticRestore).toHaveBeenCalledWith(MOCK_VOC.id);
    });
  });
});
