import type { TaskRequestDto } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskRequestRow } from './TaskRequestRow';

const REQUEST: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '쿼리 플랜 개선 필요',
  requested_outcome: 'Task 전환 검토',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

describe('TaskRequestRow identity', () => {
  it('uses safe source, Managed System, and requester labels when names are unavailable', () => {
    render(
      <TaskRequestRow
        item={REQUEST}
        selected={false}
        names={{ actorsById: {}, managedSystemsById: {} }}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /REQ-42/ })).toBeInTheDocument();
    expect(screen.getByText(/↔ Finding/)).toBeInTheDocument();
    expect(screen.getByText('Managed System')).toBeInTheDocument();
    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
    expect(screen.getByText('40000000')).toHaveClass('text-text-muted');
    expect(screen.getByText('30000000')).toHaveClass('text-text-muted');
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
    expect(screen.queryByText('10000000')).not.toBeInTheDocument();
  });
});
