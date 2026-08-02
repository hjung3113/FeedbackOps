import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/lib/api/analytics-areas', () => ({ fetchAnalyticsAreas: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { type AnalyticsAreaDto, fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { CreateFindingModal } from '../CreateFindingModal';

const IDS = {
  voc: '10000000-0000-4000-8000-000000000001',
  managedSystem: '10000000-0000-4000-8000-000000000002',
  inheritedArea: '10000000-0000-4000-8000-000000000003',
  replacementArea: '10000000-0000-4000-8000-000000000004',
} as const;

function area(id: string, name: string, slug: string): AnalyticsAreaDto {
  return {
    id,
    workspace_id: '10000000-0000-4000-8000-000000000099',
    managed_system_id: IDS.managedSystem,
    slug,
    name,
    owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

const AREAS = [
  area(IDS.inheritedArea, '재무 전환 분석', 'finance-conversion'),
  area(IDS.replacementArea, '서비스 안정성 분석', 'service-reliability'),
];

function renderModal(sourceAnalyticsAreaId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreateFindingModal
        vocId={IDS.voc}
        managedSystemId={IDS.managedSystem}
        sourceAnalyticsAreaId={sourceAnalyticsAreaId}
        open
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function submitValidForm(): void {
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'VOC 기반 Finding' } });
  fireEvent.change(screen.getByLabelText('요약'), {
    target: { value: '소스 VOC의 분석 결과를 실행 가능한 판단으로 정리합니다.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Finding 생성' }));
}

async function submittedBody(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
  expect(url).toBe(`/vocs/${IDS.voc}/create-finding`);
  expect(init).toMatchObject({ method: 'POST' });
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('CreateFindingModal Analytics Area inheritance', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    navigate.mockReset();
    vi.mocked(fetchAnalyticsAreas).mockReset();
    vi.mocked(fetchAnalyticsAreas).mockResolvedValue({ items: AREAS, total: AREAS.length });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: '10000000-0000-4000-8000-000000000050' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC-B5a submits the inherited source VOC Analytics Area exactly once', async () => {
    renderModal(IDS.inheritedArea);
    expect(await screen.findByRole('radio', { name: '재무 전환 분석' })).toHaveAttribute(
      'data-state',
      'on',
    );

    submitValidForm();

    expect(await submittedBody()).toMatchObject({ analytics_area_id: IDS.inheritedArea });
  });

  it('AC-B5b submits a replacement Analytics Area selected before creation', async () => {
    renderModal(IDS.inheritedArea);
    fireEvent.click(await screen.findByRole('radio', { name: '서비스 안정성 분석' }));
    expect(screen.getByRole('radio', { name: '서비스 안정성 분석' })).toHaveAttribute(
      'data-state',
      'on',
    );

    submitValidForm();

    expect(await submittedBody()).toMatchObject({ analytics_area_id: IDS.replacementArea });
  });

  it('AC-B5c omits analytics_area_id when the source VOC has no area', async () => {
    renderModal(null);
    expect(await screen.findByTestId('create-finding-aa-picker')).toBeInTheDocument();

    submitValidForm();

    const body = await submittedBody();
    expect(body).toMatchObject({
      title: 'VOC 기반 Finding',
      summary: '소스 VOC의 분석 결과를 실행 가능한 판단으로 정리합니다.',
    });
    expect(body).not.toHaveProperty('analytics_area_id');
  });
});
