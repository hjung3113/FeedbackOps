import type { EntityLinkDto } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('uses the entity type as a safe source label when no source summary is available', () => {
    render(<EntityRelationRow link={LINK} />);

    expect(screen.getByText('Finding')).toHaveClass('text-text-primary');
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
  });

  it('leads with source and target display ids for allowed links', () => {
    const link = {
      ...LINK,
      source_summary: {
        type: 'finding' as const,
        id: LINK.source_id,
        display_id: 'FIN-12',
        title: '매출 리포트 지연',
        summary: '응답 시간이 늘어남',
        severity: 'high',
        confidence: null,
        status: 'active',
        primary_managed_system_id: LINK.managed_system_id,
        evidence_count: 1,
      },
    } as EntityLinkDto;

    render(<EntityRelationRow link={link} />);

    expect(screen.getByText('FIN-12')).toBeInTheDocument();
    expect(screen.getByText('TASK-1000')).toBeInTheDocument();
    expect(screen.queryByText('20000000')).not.toBeInTheDocument();
  });

  it.each(['hidden', 'denied'] as const)(
    'uses a safe label and omits endpoint identities for %s links with adversarial summaries',
    (visibility_state) => {
      const restricted = {
        ...LINK,
        source_summary: {
          type: 'finding',
          id: '20000000-0000-0000-0000-000000000002',
          display_id: 'FIN-12',
          title: '매출 리포트 지연',
          summary: '응답 시간이 늘어남',
          severity: 'high',
          confidence: null,
          status: 'active',
          primary_managed_system_id: LINK.managed_system_id,
          evidence_count: 1,
        },
        visibility_state,
      } as unknown as EntityLinkDto;

      render(<EntityRelationRow link={restricted} />);

      expect(screen.getByText('접근할 수 없는 항목')).toBeInTheDocument();
      expect(screen.queryByText('매출 리포트 지연')).not.toBeInTheDocument();
      expect(screen.queryByText('매출 리포트 쿼리 플랜 개선')).not.toBeInTheDocument();
      expect(screen.queryByText('FIN-12')).not.toBeInTheDocument();
      expect(screen.queryByText('TASK-1000')).not.toBeInTheDocument();
      expect(screen.queryByText('20000000')).not.toBeInTheDocument();
      expect(screen.queryByText('30000000')).not.toBeInTheDocument();
    },
  );
});
