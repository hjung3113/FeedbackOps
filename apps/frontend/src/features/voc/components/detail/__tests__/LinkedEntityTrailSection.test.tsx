import type { EntityLinkDto } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LinkedEntityTrailSection } from '../LinkedEntityTrailSection';

const IDS = {
  link: '11111111-1111-4111-8111-111111111111',
  voc: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  actor: '44444444-4444-4444-8444-444444444444',
  system: '55555555-5555-4555-8555-555555555555',
  finding: '77777777-7777-4777-8777-777777777777',
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

function allowedTaskLink(): EntityLinkDto {
  return {
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
}

function allowedFindingLink(
  relationType: 'evidence_of' | 'created_finding' = 'evidence_of',
): EntityLinkDto {
  return {
    ...baseLink(),
    source_id: IDS.voc,
    target_type: 'finding',
    target_id: IDS.finding,
    relation_type: relationType,
    visibility: 'internal_only',
    visibility_state: 'allowed',
    target_summary: {
      type: 'finding',
      id: IDS.finding,
      display_id: 'FIN-1042',
      title: '운영자 전용 Finding',
      summary: '수집 파이프라인 오류',
      severity: 'high',
      confidence: null,
      status: 'active',
      primary_managed_system_id: IDS.system,
      evidence_count: 2,
    },
  };
}

describe('<LinkedEntityTrailSection>', () => {
  it('renders the reporter status label and formats public dates', () => {
    const summaryWithDates: EntityLinkDto = {
      ...summaryVisibleTask,
      summary: {
        ...summaryVisibleTask.summary,
        expected_resolution_date: '2026-07-31',
        last_public_update_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    };
    render(<LinkedEntityTrailSection links={[summaryWithDates]} isReporterContext />);

    expect(screen.getByText('공개 가능한 개선 작업')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByText('2026. 7. 31.')).toBeInTheDocument();
    expect(screen.getByText('2시간 전')).toBeInTheDocument();
    expect(screen.queryByText('2026-07-31')).not.toBeInTheDocument();
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
    render(<LinkedEntityTrailSection links={[allowedTaskLink()]} isReporterContext={false} />);
    expect(screen.getByTestId('linked-task-allowed')).toHaveTextContent('운영자 전용 Task');
  });

  it('opens the linked Task from an allowed trail node', async () => {
    const onOpenTask = vi.fn();
    render(
      <LinkedEntityTrailSection
        links={[allowedTaskLink()]}
        isReporterContext={false}
        onOpenTask={onOpenTask}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /운영자 전용 Task/ }));
    expect(onOpenTask).toHaveBeenCalledWith(IDS.task);
  });

  it('renders the allowed node as plain text when no destination is supplied', () => {
    render(<LinkedEntityTrailSection links={[allowedTaskLink()]} isReporterContext={false} />);

    expect(screen.getByTestId('linked-task-allowed')).toHaveTextContent('운영자 전용 Task');
    expect(screen.queryByRole('button', { name: /운영자 전용 Task/ })).not.toBeInTheDocument();
  });

  it('never offers a destination for a summary_visible Task, even when one is supplied', () => {
    // ADR-0023 §E: a Reporter sees the projected summary and nothing more —
    // handing this surface a navigation callback must not create a way in.
    const onOpenTask = vi.fn();
    render(
      <LinkedEntityTrailSection
        links={[summaryVisibleTask]}
        isReporterContext
        onOpenTask={onOpenTask}
      />,
    );

    expect(screen.queryByRole('button', { name: /공개 가능한 개선 작업/ })).not.toBeInTheDocument();
    expect(onOpenTask).not.toHaveBeenCalled();
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

  // #1174b U2-1: Finding links follow the same backend-decided visibility matrix
  // as Task links (ADR-0023 §C + ADR-0024 §D; a Finding summary_visible payload
  // is unreachable and fails closed).
  it.each(['evidence_of', 'created_finding'] as const)(
    'renders an allowed %s Finding link for an operator view',
    (relationType) => {
      render(
        <LinkedEntityTrailSection
          links={[allowedFindingLink(relationType)]}
          isReporterContext={false}
        />,
      );

      expect(screen.getByTestId('linked-finding-allowed')).toHaveTextContent('운영자 전용 Finding');
      expect(screen.getByText('FIN-1042')).toBeInTheDocument();
    },
  );

  it('opens the linked Finding from an allowed trail node', async () => {
    const onOpenFinding = vi.fn();
    render(
      <LinkedEntityTrailSection
        links={[allowedFindingLink()]}
        isReporterContext={false}
        onOpenFinding={onOpenFinding}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /운영자 전용 Finding/ }));
    expect(onOpenFinding).toHaveBeenCalledWith(IDS.finding);
  });

  it('renders an allowed Finding as plain text when no destination is supplied', () => {
    render(<LinkedEntityTrailSection links={[allowedFindingLink()]} isReporterContext={false} />);

    expect(screen.getByTestId('linked-finding-allowed')).toHaveTextContent('운영자 전용 Finding');
    expect(screen.queryByRole('button', { name: /운영자 전용 Finding/ })).not.toBeInTheDocument();
  });

  it('does not leak an allowed Finding in a Reporter context', () => {
    render(<LinkedEntityTrailSection links={[allowedFindingLink()]} isReporterContext />);

    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.queryByText('운영자 전용 Finding')).not.toBeInTheDocument();
    expect(screen.queryByText('FIN-1042')).not.toBeInTheDocument();
  });

  it('conceals hidden Finding links completely', () => {
    const link: EntityLinkDto = {
      ...baseLink(),
      target_type: 'finding',
      relation_type: 'evidence_of',
      visibility_state: 'hidden',
    };
    render(<LinkedEntityTrailSection links={[link]} isReporterContext={false} />);

    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.queryByText('운영자 전용 Finding')).not.toBeInTheDocument();
  });

  it('fails closed on an inconsistent summary_visible Finding payload', () => {
    const link: EntityLinkDto = {
      ...baseLink(),
      target_type: 'finding',
      relation_type: 'evidence_of',
      visibility_state: 'summary_visible',
      summary: {
        target_type: 'task',
        public_title: '공개 가능한 개선 작업',
        reporter_facing_status: '진행 중',
      },
    };
    render(<LinkedEntityTrailSection links={[link]} isReporterContext={false} />);

    expect(screen.queryByText('관련 엔티티')).not.toBeInTheDocument();
    expect(screen.queryByText('공개 가능한 개선 작업')).not.toBeInTheDocument();
  });

  it('renders an acknowledged minimal blocked surface for denied Finding links', () => {
    const link: EntityLinkDto = {
      ...baseLink(),
      target_type: 'finding',
      relation_type: 'evidence_of',
      visibility_state: 'denied',
    };
    render(<LinkedEntityTrailSection links={[link]} isReporterContext={false} />);

    expect(screen.getByTestId('linked-finding-denied')).toBeInTheDocument();
    expect(screen.queryByText('운영자 전용 Finding')).not.toBeInTheDocument();
    expect(screen.queryByText('FIN-1042')).not.toBeInTheDocument();
  });
});
