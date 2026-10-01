import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { type TaskRequestDto, taskRequestStatusSchema } from '@fops/shared';
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
    expect(screen.getByText(REQUEST.requested_outcome)).toBeInTheDocument();
    expect(screen.getByText(/↔ Finding/)).toBeInTheDocument();
    expect(screen.getByText('Managed System')).toBeInTheDocument();
    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
    expect(screen.queryByText('40000000')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidence 1')).not.toBeInTheDocument();
    expect(screen.getByText('30000000')).toHaveClass('text-text-muted');
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
    expect(screen.queryByText('10000000')).not.toBeInTheDocument();
  });

  it('shows the Finding display id and actual evidence count', () => {
    const item = {
      ...REQUEST,
      source: {
        type: 'finding' as const,
        id: REQUEST.source_id,
        relation_type: 'requested_task' as const,
        link_id: '50000000-0000-0000-0000-000000000005',
        display_id: 'FIN-181',
        title: '리포트 속도 저하',
        evidence_count: 7,
      },
    };
    render(
      <TaskRequestRow
        item={item}
        selected={false}
        names={{ actorsById: {}, managedSystemsById: {} }}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText(/↔ FIN-181/)).toBeInTheDocument();
    expect(screen.getByText('리포트 속도 저하')).toBeInTheDocument();
    expect(screen.getByText(REQUEST.requested_outcome)).toHaveClass('text-text-muted');
    expect(screen.getByText('Evidence · 7')).toBeInTheDocument();
    expect(screen.queryByText('Evidence 1')).not.toBeInTheDocument();
    expect(screen.queryByText('40000000')).not.toBeInTheDocument();
  });

  it('omits the trailing separator when the created date is missing', () => {
    render(
      <TaskRequestRow
        item={{ ...REQUEST, created_at: '' }}
        selected={false}
        names={{
          actorsById: {},
          managedSystemsById: { [REQUEST.primary_managed_system_id]: { name: 'Billing Ops' } },
        }}
        onSelect={() => undefined}
      />,
    );

    const row = screen.getByRole('button', { name: /REQ-42/ });
    const separators = row.querySelectorAll('span[aria-hidden="true"]');
    expect(separators).toHaveLength(1);
    expect(separators[0]?.nextElementSibling).toHaveTextContent('Billing Ops');
  });

  it.each(taskRequestStatusSchema.options)(
    'renders a display label for Task Request status %s',
    (status) => {
      render(
        <TaskRequestRow
          item={{ ...REQUEST, status }}
          selected={false}
          names={{ actorsById: {}, managedSystemsById: {} }}
          onSelect={() => undefined}
        />,
      );

      expect(screen.getByText(TASK_REQUEST_STATUS_LABELS[status])).toBeInTheDocument();
      expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
    },
  );
});
