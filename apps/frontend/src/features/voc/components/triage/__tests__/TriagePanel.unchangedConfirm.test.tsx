// #1175: confirm is available on a VOC that is not yet triaged even when no field changed
// (confirming marks it triaged); an already triaged VOC with nothing changed stays disabled.
import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { TriagePanel } from '../TriagePanel';

const VOC: VocListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  display_id: 'VOC-UC1',
  title: '변경 없이 확정',
  primary_managed_system_id: '00000000-0000-4000-8000-000000000010',
  analytics_area_id: '00000000-0000-4000-8000-000000000101',
  reporter_id: '00000000-0000-4000-8000-000000000002',
  owner_user_id: '00000000-0000-4000-8000-000000000003',
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

function renderPanel(voc: VocListItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TriagePanel voc={voc} />
    </QueryClientProvider>,
  );
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const record = (headers ?? {}) as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}

describe('TriagePanel confirm without field changes (#1175)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it.each(['untriaged', 'needs_more_information'] as const)(
    'confirms a %s VOC with its current values and keeps nulls',
    async (triageState) => {
      const prior = { ...VOC, triage_state: triageState, owner_user_id: null, severity: null };
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ updated_at: '2026-08-02T01:00:00.000Z' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as typeof globalThis.fetch;
      renderPanel(prior);

      expect(screen.getByTestId('summary-no-changes')).toHaveTextContent(
        '변경 없음 — 현재 값 그대로 확정됩니다.',
      );
      const confirm = screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/ });
      expect(confirm).toBeEnabled();
      fireEvent.click(confirm);

      await waitFor(() =>
        expect(
          vi.mocked(globalThis.fetch).mock.calls.some(([, init]) => init?.method === 'PATCH'),
        ).toBe(true),
      );
      const [, init] = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([, call]) => call?.method === 'PATCH') ?? [undefined, undefined];
      expect(JSON.parse(String(init?.body))).toEqual({
        triage_state: 'triaged',
        severity: null,
        owner_user_id: null,
        owner_team_id: null,
        analytics_area_id: VOC.analytics_area_id,
      });
      expect(header(init, 'If-Match')).toBe(VOC.updated_at);
      expect(header(init, 'Idempotency-Key')).toBeTruthy();
    },
  );

  it('sends the prior severity, owner and area when they are set', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ updated_at: '2026-08-02T01:00:00.000Z' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;
    renderPanel(VOC);
    fireEvent.click(screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/ }));
    await waitFor(() =>
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([, init]) => init?.method === 'PATCH'),
      ).toBe(true),
    );
    const [, init] = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([, call]) => call?.method === 'PATCH') ?? [undefined, undefined];
    expect(JSON.parse(String(init?.body))).toEqual({
      triage_state: 'triaged',
      severity: 'high',
      owner_user_id: VOC.owner_user_id,
      owner_team_id: null,
      analytics_area_id: VOC.analytics_area_id,
    });
  });

  it('keeps confirm disabled for an already triaged VOC with nothing changed', () => {
    renderPanel({ ...VOC, triage_state: 'triaged' });

    expect(screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/ })).toBeDisabled();
    const note = screen.getByTestId('summary-no-changes');
    expect(note).toHaveTextContent('변경 없음');
    expect(note).not.toHaveTextContent('그대로 확정됩니다');
  });

  it('enables confirm for an already triaged VOC once a field changes', () => {
    renderPanel({ ...VOC, triage_state: 'triaged' });
    fireEvent.click(screen.getByRole('button', { name: /낮음/ }));
    expect(screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/ })).toBeEnabled();
  });
});
