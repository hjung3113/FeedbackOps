// useFindingDetail.test.ts — #398: Finding detail payloads are validated at
// the network seam. The valid twin runs first so the malformed-payload
// assertion cannot pass vacuously (e.g. through a broken fetch mock).

import { ApiError, ApiParseError } from '@/lib/api/types';
import type { FindingDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFindingDetail } from '../useFindingDetail';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type MockFetchArgs = {
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
};

function mockFetch(response: MockFetchArgs): typeof fetch {
  const headers = new Headers(response.headers);
  return vi.fn(
    async () =>
      ({
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        headers,
        text: async () =>
          response.jsonBody !== undefined ? JSON.stringify(response.jsonBody) : '',
      }) as Response,
  ) as unknown as typeof fetch;
}

const FINDING: FindingDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: '리포트 속도 저하',
  summary: '쿼리 플랜 개선 필요',
  source_type: 'manual',
  source_id: null,
  evidence_count: 0,
  severity: 'high',
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

function renderFindingDetail(id: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useFindingDetail(id), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useFindingDetail', () => {
  it('resolves a valid payload to the parsed Finding (positive twin)', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: FINDING });
    const { result } = renderFindingDetail(FINDING.id);
    await waitFor(() => expect(result.current.data).toEqual(FINDING), { timeout: 5000 });
    expect(result.current.isError).toBe(false);
  });

  it('drives the query into an error state with ApiParseError on a malformed payload', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: { ...FINDING, severity: 'catastrophic' } });
    const { result } = renderFindingDetail(FINDING.id);

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
    const error = result.current.error;
    expect(error).toBeInstanceOf(ApiParseError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiParseError).detail?.endpoint).toBe(`GET /findings/${FINDING.id}`);
  });
});
