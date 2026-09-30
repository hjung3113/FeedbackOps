// TriagePanel.clusterRecommendation.test.tsx — #168 step 6 chunk 6b.
//
// The recommendation surface is mounted inside the triage panel and receives
// the source VOC id. ADR-0031 coexistence: `similar_count` remains the peer
// count, separate from the semantic recommendation section label.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import type { VocListItem } from '@fops/shared';
import { TriagePanel } from '../TriagePanel';

const VOC: VocListItem = {
  id: '00000000-0000-0000-0000-0000000000aa',
  display_id: 'VOC-CR1',
  title: '리포트 수치가 어긋납니다',
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TriagePanel — 유사 VOC 추천 section', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('mounts the recommendation section for the selected VOC and requests its recommendations', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      urls.push(url);
      if (url.endsWith('/recommendations')) {
        return jsonResponse({
          available: true,
          embedding_version: 1,
          items: [
            {
              voc_id: '00000000-0000-0000-0000-0000000000b1',
              display_id: 'VOC-201',
              title: '동일 지표가 두 값으로 보입니다',
              severity: 'medium',
              reporter_facing_status: 'received',
              score: 0.83,
            },
          ],
          total: 1,
        });
      }
      return jsonResponse({ actors: [] });
    }) as unknown as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <TriagePanel voc={VOC} />
      </Wrapper>,
    );

    expect(
      await screen.findByTestId('cluster-recommendation-row-00000000-0000-0000-0000-0000000000b1'),
    ).toHaveTextContent('VOC-201');
    expect(urls).toContain(`/vocs/${VOC.id}/recommendations`);
  });

  it('keeps the recommendation nav visible when there are no same-Managed-System peers', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/recommendations')) {
        return jsonResponse({
          available: false,
          reason: 'provider_disabled',
          embedding_version: 1,
          items: [],
          total: 0,
        });
      }
      return jsonResponse({ actors: [] });
    }) as unknown as typeof globalThis.fetch;

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <TriagePanel voc={VOC} />
      </Wrapper>,
    );

    const navEntry = screen.getByRole('button', { name: '유사 VOC 추천' });
    expect(navEntry).not.toHaveTextContent('0');
    expect(screen.queryByTestId('cluster-similarity-badge')).toBeNull();

    // The state line testid is likewise present during loading, so wait for the
    // settled COPY to prove the recommendation query reached its unavailable state.
    await waitFor(() => {
      expect(screen.getByTestId('cluster-recommendation-state')).toHaveTextContent(
        '임베딩 제공자가 설정되어 있지 않아',
      );
    });
  });
});
