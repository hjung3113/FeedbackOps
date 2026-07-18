import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EntityLinkDto } from '@fops/shared';

import { LinkedEntityTrailSection } from '../LinkedEntityTrailSection';

const IDS = {
  link: '11111111-1111-4111-8111-111111111111',
  voc: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  actor: '44444444-4444-4444-8444-444444444444',
  system: '55555555-5555-4555-8555-555555555555',
} as const;

function baseLink() {
  return {
    id: IDS.link,
    source_type: 'voc' as const,
    target_type: 'task' as const,
    relation_type: 'evidence_of' as const,
    status: 'active' as const,
    managed_system_id: IDS.system,
    created_by: IDS.actor,
    created_at: '2026-07-18T09:00:00.000Z',
    updated_at: null,
  };
}

const summaryVisibleTask: EntityLinkDto = {
  ...baseLink(),
  visibility_state: 'summary_visible',
  summary: {
    target_type: 'task',
    public_title: '공개 가능한 개선 작업',
    reporter_facing_status: '진행 중',
  },
};

describe('<LinkedEntityTrailSection>', () => {
  it('renders only the reporter summary title and projected status', () => {
    render(<LinkedEntityTrailSection links={[summaryVisibleTask]} isReporterContext />);

    expect(screen.getByText('공개 가능한 개선 작업')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByTestId('linked-task-summary')).toBeInTheDocument();
  });

  it('does not invent absent optional reporter fields', () => {
    render(<LinkedEntityTrailSection links={[summaryVisibleTask]} isReporterContext />);

    expect(screen.queryByText('담당 팀')).not.toBeInTheDocument();
    expect(screen.queryByText('예상 해결일')).not.toBeInTheDocument();
    expect(screen.queryByText('최근 공개 업데이트')).not.toBeInTheDocument();
  });

  it('does not leak an allowed Task full DTO in reporter context', () => {
    const allowedTask: EntityLinkDto = {
      ...baseLink(),
      source_id: IDS.voc,
      target_id: IDS.task,
      visibility: 'internal_only',
      visibility_state: 'allowed',
      target_summary: {
        type: 'task',
        id: IDS.task,
        display_id: 'TASK-SECRET',
        title: '내부 우선순위 P0 작업',
        status: 'in_progress',
        priority: 'critical',
        primary_managed_system_id: IDS.system,
        assignee_actor_id: IDS.actor,
        due_date: '2026-07-31',
      },
    };

    render(<LinkedEntityTrailSection links={[allowedTask]} isReporterContext />);

    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.queryByText('내부 우선순위 P0 작업')).not.toBeInTheDocument();
    expect(screen.queryByText('critical')).not.toBeInTheDocument();
    expect(screen.queryByText('TASK-SECRET')).not.toBeInTheDocument();
  });

  it('renders an allowed Task only for an operator view', () => {
    const allowedTask: EntityLinkDto = {
      ...baseLink(),
      source_id: IDS.voc,
      target_id: IDS.task,
      visibility: 'internal_only',
      visibility_state: 'allowed',
      target_summary: {
        type: 'task',
        id: IDS.task,
        display_id: 'TASK-42',
        title: '운영자 전용 Task',
        status: 'in_progress',
        priority: 'high',
        primary_managed_system_id: IDS.system,
        assignee_actor_id: null,
        due_date: null,
      },
    };

    render(<LinkedEntityTrailSection links={[allowedTask]} isReporterContext={false} />);
    expect(screen.getByTestId('linked-task-allowed')).toHaveTextContent('운영자 전용 Task');
  });

  it('conceals hidden Task links completely', () => {
    const link: EntityLinkDto = { ...baseLink(), visibility_state: 'hidden' };
    render(<LinkedEntityTrailSection links={[link]} isReporterContext />);

    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.queryByText('연결된 항목')).not.toBeInTheDocument();
    expect(screen.queryByText('연결된 Task')).not.toBeInTheDocument();
  });

  it('renders an acknowledged minimal blocked surface for denied Task links', () => {
    const link: EntityLinkDto = { ...baseLink(), visibility_state: 'denied' };
    render(<LinkedEntityTrailSection links={[link]} isReporterContext />);

    expect(screen.getByTestId('linked-task-denied')).toBeInTheDocument();
    expect(screen.queryByText('공개 가능한 개선 작업')).not.toBeInTheDocument();
  });
});
