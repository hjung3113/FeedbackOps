import type { FindingDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listTasks, linkTaskToFinding } = vi.hoisted(() => ({
  listTasks: vi.fn(),
  linkTaskToFinding: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listTasks,
    linkTaskToFinding,
    useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
  };
});
vi.mock('../../hooks/useEvidenceMutations', () => ({
  useAddEvidenceHighlightMutation: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
  useLinkEvidenceMutation: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddEvidenceModal } from './AddEvidenceModal';
import { LinkEvidenceModal } from './LinkEvidenceModal';
import { LinkTaskModal } from './LinkTaskModal';

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

const dialogs = [
  {
    name: 'AddEvidenceModal',
    render: () => (
      <AddEvidenceModal
        findingId={FINDING.id}
        managedSystemId={FINDING.primary_managed_system_id}
        open
        onClose={vi.fn()}
      />
    ),
  },
  {
    name: 'LinkEvidenceModal',
    render: () => (
      <LinkEvidenceModal
        findingId={FINDING.id}
        managedSystemId={FINDING.primary_managed_system_id}
        open
        onClose={vi.fn()}
      />
    ),
  },
  {
    name: 'LinkTaskModal',
    render: () => <LinkTaskModal finding={FINDING} open onClose={vi.fn()} />,
  },
] as const;

describe('Finding dialog cancel variants', () => {
  beforeEach(() => {
    listTasks.mockReset().mockResolvedValue({ items: [] });
    linkTaskToFinding.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [], page: { has_more: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(dialogs)('$name cancel action uses secondary styling', ({ render: renderDialog }) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(<QueryClientProvider client={client}>{renderDialog()}</QueryClientProvider>);

    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });
});
