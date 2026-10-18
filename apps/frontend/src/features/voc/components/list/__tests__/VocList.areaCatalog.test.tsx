import type { AnalyticsAreaDto } from '@/lib/api/analytics-areas';
import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VocList } from '../VocList';

const { fetchAnalyticsAreas } = vi.hoisted(() => ({ fetchAnalyticsAreas: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/lib/api/analytics-areas', () => ({ fetchAnalyticsAreas }));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: () => ({ data: { state: 'blocked_non_requestable' } }),
}));

function area(n: number, name: string): AnalyticsAreaDto {
  return {
    id: `area-${n}`,
    workspace_id: 'ws',
    managed_system_id: 'ms-aaa',
    slug: `area-${n}`,
    name,
    owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };
}

const VOC = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC',
  primary_managed_system_id: 'ms-aaa',
  analytics_area_id: 'area-500',
  reporter_id: 'user-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  similar_count: 0,
  attachment_count: 0,
  review_postponed_at: null,
} as VocListItem;

describe('<VocList> Analytics Area names', () => {
  beforeEach(() => {
    fetchAnalyticsAreas.mockReset();
    fetchAnalyticsAreas.mockImplementation(async ({ offset = 0 }: { offset?: number }) =>
      offset === 0
        ? { items: Array.from({ length: 500 }, (_, i) => area(i, `Area ${i}`)), total: 501 }
        : { items: [area(500, 'Second Page Area')], total: 501 },
    );
  });

  it('shows the name of an Area beyond the first catalog page', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <VocList items={[VOC]} loading={false} error={null} onSelect={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Second Page Area')).toBeInTheDocument();
  });
});
