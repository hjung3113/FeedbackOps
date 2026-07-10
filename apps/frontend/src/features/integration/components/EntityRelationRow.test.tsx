import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EntityLinkDto } from '@fops/shared';
import { EntityRelationRow } from './EntityRelationRow';

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    EntityIconBadge: ({ type }: { type: string }) => <span aria-label={type} />,
  };
});

const LINK: EntityLinkDto = {
  id: '10000000-0000-0000-0000-000000000001',
  source_type: 'finding',
  source_id: '20000000-0000-0000-0000-000000000002',
  target_type: 'task',
  target_id: '30000000-0000-0000-0000-000000000003',
  target_summary: {
    type: 'task',
    id: '30000000-0000-0000-0000-000000000003',
    display_id: 'TASK-1000',
    title: '매출 리포트 쿼리 플랜 개선',
    status: 'backlog',
    priority: 'high',
    primary_managed_system_id: '40000000-0000-0000-0000-000000000004',
    assignee_actor_id: null,
    due_date: null,
  },
  relation_type: 'requested_task',
  visibility: 'internal_only',
  status: 'active',
  managed_system_id: '40000000-0000-0000-0000-000000000004',
  created_by: '50000000-0000-0000-0000-000000000005',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  visibility_state: 'allowed',
};

describe('EntityRelationRow', () => {
  it('renders the target summary display_id for allowed entity link chips', () => {
    render(<EntityRelationRow link={LINK} />);

    expect(screen.getByText('TASK-1000')).toBeInTheDocument();
    expect(screen.queryByText('30000000')).not.toBeInTheDocument();
  });
});
