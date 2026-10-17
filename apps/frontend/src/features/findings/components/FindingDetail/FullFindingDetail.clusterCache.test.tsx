// FullFindingDetail.clusterCache.test.tsx — #1174 FIX1 regression.
//
// TanStack Query keeps cached `data` when a refetch fails, so the mocked-hook
// cluster tests cannot catch a stale source Cluster identity. This file runs
// the REAL useVocClusterDetail + apiRequest against a scripted fetch: the
// first read is authorized (200), the refetch is denied (403) or missing (404).

import type { FindingDto, VocClusterDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullFindingDetail } from './FullFindingDetail';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useRouter: () => undefined,
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/findings/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

const CLUSTER_ID = '70000000-0000-7000-8000-000000000007';

const CLUSTER_DTO: VocClusterDto = {
  id: CLUSTER_ID,
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'CLU-9001',
  title: '결제 실패 클러스터',
  summary: null,
  status: 'confirmed',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  created_by: '40000000-0000-0000-0000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  member_count: 2,
};

const FINDING: FindingDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: '리포트 속도 저하',
  summary: '쿼리 플랜 개선 필요',
  source_type: 'voc_cluster',
  source_id: CLUSTER_ID,
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'medium',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: '40000000-0000-0000-0000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};

const ORIGINAL_FETCH = globalThis.fetch;
let clusterResponses: Array<{ status: number; body: unknown }> = [];

function installFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === `/voc-clusters/${CLUSTER_ID}`) {
      const next = clusterResponses.shift();
      if (next) {
        return new Response(JSON.stringify(next.body), {
          status: next.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
}

function renderDetail(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FullFindingDetail finding={FINDING} />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('FullFindingDetail source Cluster identity after a denied refetch (#1174 FIX1)', () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it.each([
    { status: 403, scenario: 'authorization denied' },
    { status: 404, scenario: 'not found' },
  ])(
    'clears the cached Cluster title, display id and link when the refetch is $scenario ($status)',
    async ({ status }) => {
      clusterResponses = [
        { status: 200, body: CLUSTER_DTO },
        {
          status,
          body: {
            code: status === 403 ? 'permission.denied' : 'not_found.record',
            message: 'cluster read refused',
          },
        },
      ];
      const queryClient = renderDetail();

      // Positive twin: the authorized read names and links the Cluster, so the
      // disappearance assertions below cannot pass vacuously.
      const clusterLink = await screen.findByRole('link', { name: /결제 실패 클러스터/ });
      expect(clusterLink).toHaveTextContent('CLU-9001');

      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['voc-cluster', CLUSTER_ID] });
      });

      await waitFor(
        () => {
          expect(
            screen.queryByRole('link', { name: /결제 실패 클러스터/ }),
          ).not.toBeInTheDocument();
        },
        { timeout: 4000 },
      );
      expect(screen.queryByText('결제 실패 클러스터')).not.toBeInTheDocument();
      expect(screen.queryByText('CLU-9001')).not.toBeInTheDocument();
    },
    15000,
  );
});
