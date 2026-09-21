import { linkTaskToFinding, listTasks } from '@/lib/api';
import type { FindingDto, TaskDto } from '@fops/shared';
// LinkTaskModal.test.tsx — the link-task mutation's success wiring lives inside
// this modal component (invalidation + close), so it is covered with RTL
// instead of controller-level spies. See useFindingDetailController.test.tsx.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkTaskModal } from './LinkTaskModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const IDS = vi.hoisted(() => ({
  finding: '10000000-0000-0000-0000-000000000001',
  managedSystem: '30000000-0000-0000-0000-000000000003',
  task: '20000000-0000-0000-0000-000000000002',
}));

vi.mock('@/lib/api', () => ({
  errorMapper: () => ({ message: 'mapped error' }),
  listTasks: vi.fn(),
  linkTaskToFinding: vi.fn(),
  useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
}));

const FINDING: FindingDto = {
  id: IDS.finding,
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: IDS.managedSystem,
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

const CANDIDATE = {
  id: IDS.task,
  title: '매출 리포트 쿼리 플랜 개선',
  display_id: 'TASK-901',
  primary_managed_system_id: IDS.managedSystem,
} as TaskDto;

const OTHER_SYSTEM_TASK = {
  ...CANDIDATE,
  id: '20000000-0000-0000-0000-000000000003',
  display_id: 'TASK-902',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000099',
} as TaskDto;

beforeAll(() => {
  // jsdom lacks Pointer Capture; Radix Select's trigger path needs the stubs.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

describe('LinkTaskModal', () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockResolvedValue({ items: [CANDIDATE, OTHER_SYSTEM_TASK] });
    vi.mocked(linkTaskToFinding).mockResolvedValue(FINDING);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('submitting a candidate invalidates the finding + tasks queries and closes', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <LinkTaskModal finding={FINDING} open onClose={onClose} />
      </QueryClientProvider>,
    );

    // Same-managed-system filter: only TASK-901 is offered.
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    const option = screen.getByRole('option', { name: /TASK-901/ });
    await user.click(option);

    await user.click(screen.getByTestId('link-task-submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(linkTaskToFinding).toHaveBeenCalledWith(IDS.finding, { task_id: IDS.task }, 'idem-key');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finding', IDS.finding] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
    expect(toast.success).toHaveBeenCalledWith('Task가 Finding에 연결되었습니다.');
  });
});
