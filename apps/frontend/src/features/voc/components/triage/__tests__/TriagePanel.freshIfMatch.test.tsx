// TriagePanel.freshIfMatch.test.tsx — codex REV-1 P1-#4
//
// Finding: compensating PATCH reuses the ORIGINAL If-Match (voc.updated_at at
// confirm time). After the first PATCH commits, the VOC version has bumped,
// so undo-after-settle self-fails with conflict.stale_write.
//
// Fix: capture the fresh updated_at from the first PATCH response and use
// THAT as the If-Match for the compensating PATCH. The fresh Idempotency-Key
// requirement from §5.3 stays.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-freshifmatch';
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
const FRESH_UPDATED_AT = '2026-05-02T11:22:33.000Z';

const MOCK_VOC: VocListItem = {
  id: 'voc-rev1-p1-4',
  display_id: 'VOC-R4',
  title: 'REV-1 P1-4',
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

function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'rev1-fresh-ifmatch-host');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-freshifmatch');
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

describe('TriagePanel — compensating PATCH If-Match (REV-1 #4)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
  });

  it('compensating PATCH uses the FRESH updated_at from the first PATCH response, not the stale original', async () => {
    const patchIfMatchHeaders: string[] = [];

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse({ actors: [] });
      if (method === 'PATCH') {
        const ifMatch = readHeader(init, 'If-Match');
        if (ifMatch !== undefined) patchIfMatchHeaders.push(ifMatch);
        return jsonResponse({
          id: MOCK_VOC.id,
          triage_state: 'triaged',
          updated_at: FRESH_UPDATED_AT,
        });
      }
      return jsonResponse({});
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    const { baseElement } = render(
      <Wrapper>
        <TriagePanel
          voc={MOCK_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={vi.fn()}
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

    await waitFor(() => expect(patchIfMatchHeaders.length).toBeGreaterThanOrEqual(1));
    expect(patchIfMatchHeaders[0]).toBe(ORIGINAL_UPDATED_AT);

    // Render the undo toast and click 실행 취소
    expect(capturedToastRenderer).not.toBeNull();
    renderCapturedToast(baseElement);
    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="rev1-fresh-ifmatch-host"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    await waitFor(
      () => expect(patchIfMatchHeaders.length).toBeGreaterThanOrEqual(2),
      { timeout: 3000 },
    );

    // The compensating PATCH must use the FRESH updated_at from the first
    // PATCH response — not the stale original baseline.
    expect(patchIfMatchHeaders[1]).toBe(FRESH_UPDATED_AT);
    expect(patchIfMatchHeaders[1]).not.toBe(ORIGINAL_UPDATED_AT);
  });
});
