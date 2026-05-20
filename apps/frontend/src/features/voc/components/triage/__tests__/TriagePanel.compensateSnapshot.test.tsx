// TriagePanel.compensateSnapshot.test.tsx — codex REV-1 P1-#3
//
// Finding: snapshot() captures the staged panelState (the new severity / owner
// / AA the user just selected) instead of the prior VOC values. After undo,
// the compensating PATCH writes the SAME staged values back with
// triage_state='untriaged' — leaving the VOC's severity/owner/AA permanently
// mutated even though the user "undid" the triage.
//
// Fix: snapshot from voc.severity, voc.owner_user_id, voc.owner_team_id,
// voc.analytics_area_id at the moment confirm fires.

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let capturedToastRenderer: ((id: string | number) => React.ReactNode) | null = null;

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => React.ReactNode) => {
      capturedToastRenderer = renderer;
      return 'toast-id-compensate-snap';
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

// VOC with PRIOR values already populated — the user is re-triaging.
const PRIOR_VOC: VocListItem = {
  id: 'voc-rev1-p1-3',
  display_id: 'VOC-R3',
  title: 'REV-1 P1-3',
  reporter_facing_status: 'received',
  severity: 'low',                                   // prior severity
  owner_user_id: '00000000-0000-0000-0000-000000000aaa', // prior owner
  owner_team_id: null,
  analytics_area_id: '00000000-0000-0000-0000-000000000bbb', // prior AA
  primary_managed_system_id: '00000000-0000-0000-0000-000000000099',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'triaged',
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

function renderCapturedToast(container: HTMLElement): HTMLElement | null {
  if (!capturedToastRenderer) return null;
  const toastEl = document.createElement('div');
  toastEl.setAttribute('data-testid', 'rev1-snap-toast-host');
  container.appendChild(toastEl);
  const node = capturedToastRenderer('toast-id-compensate-snap');
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client');
  const root = createRoot(toastEl);
  act(() => {
    root.render(node as React.ReactElement);
  });
  return toastEl;
}

describe('TriagePanel — compensating PATCH payload (REV-1 #3)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    capturedToastRenderer = null;
    vi.restoreAllMocks();
  });

  it('compensating PATCH (settled undo) restores the PRIOR voc values, not the staged panel values', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' && init?.body) {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        requests.push({ url, body });
      }
      // GET /actors etc. — return an empty actor list for the picker.
      if (method === 'GET') {
        return jsonResponse({ actors: [] });
      }
      return jsonResponse({
        id: PRIOR_VOC.id,
        triage_state: 'triaged',
        updated_at: '2026-05-02T00:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    const { baseElement } = render(
      <Wrapper>
        <TriagePanel
          voc={PRIOR_VOC}
          onAct={vi.fn()}
          onOptimisticRemove={vi.fn()}
          onOptimisticRestore={vi.fn()}
        />
      </Wrapper>,
    );

    // User stages a NEW severity (different from prior 'low')
    const highChip = screen.getByRole('button', { name: /^high$/i });
    fireEvent.click(highChip);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
    });

    // Confirm
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    });

    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(1));

    // First PATCH carries staged values (severity: 'high')
    expect(requests[0]?.body.severity).toBe('high');
    expect(requests[0]?.body.triage_state).toBe('triaged');

    // Render the undo toast and click 실행 취소
    expect(capturedToastRenderer).not.toBeNull();
    renderCapturedToast(baseElement);
    const undoBtn = await waitFor(() => {
      const el = baseElement.querySelector('[data-testid="rev1-snap-toast-host"] button');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    await act(async () => {
      fireEvent.click(undoBtn);
    });

    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });

    // Compensating PATCH must restore the PRIOR values, not the staged ones.
    const comp = requests[1];
    expect(comp).toBeTruthy();
    expect(comp?.body.triage_state).toBe('untriaged');
    expect(comp?.body.severity).toBe('low');                                       // PRIOR, not 'high'
    expect(comp?.body.owner_user_id).toBe('00000000-0000-0000-0000-000000000aaa'); // PRIOR
    expect(comp?.body.owner_team_id).toBeNull();
    expect(comp?.body.analytics_area_id).toBe('00000000-0000-0000-0000-000000000bbb'); // PRIOR
  });
});
