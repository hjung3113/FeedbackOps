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
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

describe('TaskRequestRow identity', () => {
  it('uses the shared reviewer badge when no reviewer is assigned', () => {
    render(
      <TaskRequestRow
        item={REQUEST}
        selected={false}
        names={{ actorsById: {}, managedSystemsById: {} }}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText('검토자 없음')).toHaveClass(
      'bg-accent-danger/10',
      'text-accent-danger',
    );
  });

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

it.each(['actor', 'team'] as const)(
  'displays assigned %s separately from the actual decision Actor',
  (mode) => {
    const id = '60000000-0000-0000-0000-000000000006';
    const actual = '70000000-0000-0000-0000-000000000007';
    render(
      <TaskRequestRow
        selected={false}
        onSelect={() => undefined}
        item={{
          ...REQUEST,
          assigned_reviewer_actor_id: mode === 'actor' ? id : null,
          assigned_reviewer_team_id: mode === 'team' ? id : null,
          reviewer_actor_id: actual,
        }}
        names={{
          actorsById: {
            [id]: { id, display_name: '배정 운영자' },
            [actual]: { id: actual, display_name: '실제 검토자' },
          },
          teamsById: { [id]: { name: '검토팀' } },
          managedSystemsById: {},
        }}
      />,
    );
    expect(
      screen.getByText(mode === 'actor' ? /검토 담당 배정 운영자/ : /검토 담당 팀 · 검토팀/),
    ).toBeInTheDocument();
    expect(screen.getByText(/결정 · 실제 검토자/)).toBeInTheDocument();
  },
);

it('renders a pending assigned reviewer as 검토 담당 in the meta line with a neutral undecided chip', () => {
  const id = '60000000-0000-0000-0000-000000000006';
  render(
    <TaskRequestRow
      selected={false}
      onSelect={() => undefined}
      item={{ ...REQUEST, assigned_reviewer_actor_id: id }}
      names={{
        actorsById: { [id]: { id, display_name: '배정 운영자' } },
        managedSystemsById: {},
      }}
    />,
  );
  expect(screen.getByText(/검토 담당/)).toBeInTheDocument();
  expect(screen.getByText('미결정')).toBeInTheDocument();
  expect(screen.queryByText('검토자 없음')).not.toBeInTheDocument();
});

it('labels the decided row with 결정 and renders no unrouted chip once a decider exists', () => {
  const actual = '70000000-0000-0000-0000-000000000007';
  render(
    <TaskRequestRow
      selected={false}
      onSelect={() => undefined}
      item={{ ...REQUEST, reviewer_actor_id: actual }}
      names={{
        actorsById: { [actual]: { id: actual, display_name: '실제 검토자' } },
        managedSystemsById: {},
      }}
    />,
  );
  expect(screen.getByText(/결정 · 실제 검토자/)).toBeInTheDocument();
  expect(screen.queryByText('검토자 없음')).not.toBeInTheDocument();
  expect(screen.queryByText('미결정')).not.toBeInTheDocument();
});
