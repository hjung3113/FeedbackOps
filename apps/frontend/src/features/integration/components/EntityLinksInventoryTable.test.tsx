import type { EntityLinkDto } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntityLinksInventoryTable } from './EntityLinksInventoryTable';

const ALLOWED_LINK = {
  id: '10000000-0000-0000-0000-000000000001',
  source_type: 'finding',
  source_id: '20000000-0000-0000-0000-000000000002',
  source_summary: {
    type: 'finding',
    id: '20000000-0000-0000-0000-000000000002',
    display_id: 'FIN-12',
    title: '매출 리포트 지연',
    summary: '응답 시간이 늘어남',
    severity: 'high',
    confidence: null,
    status: 'active',
    primary_managed_system_id: '40000000-0000-0000-0000-000000000004',
    evidence_count: 1,
  },
  target_type: 'task',
  target_id: '30000000-0000-0000-0000-000000000003',
  target_summary: {
    type: 'task',
    id: '30000000-0000-0000-0000-000000000003',
    display_id: 'TASK-1000',
    title: '쿼리 플랜 개선',
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
} as unknown as EntityLinkDto;

describe('EntityLinksInventoryTable identity', () => {
  it('uses user-facing language while loading entity links', () => {
    render(<EntityLinksInventoryTable items={[]} loading />);

    expect(screen.getByText('엔티티 링크를 불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByText(/entity_links/)).not.toBeInTheDocument();
  });

  it('leads with endpoint display ids and keeps link/system/actor ids secondary', () => {
    render(<EntityLinksInventoryTable items={[ALLOWED_LINK]} />);

    const row = screen.getByRole('listitem');
    expect(row.textContent?.indexOf('FIN-12')).toBeLessThan(
      row.textContent?.indexOf('TASK-1000') ?? -1,
    );
    expect(screen.getByRole('checkbox', { name: 'FIN-12 → TASK-1000 선택' })).toBeInTheDocument();
    expect(screen.getByText('엔티티 링크 10000000')).toHaveClass('text-text-muted');
    expect(screen.getByText('Managed System')).toBeInTheDocument();
    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
    expect(
      screen.queryByText('40000000', { selector: '.text-text-primary' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('50000000', { selector: '.text-text-primary' }),
    ).not.toBeInTheDocument();
  });

  it('shows no endpoint identity for a hidden link', () => {
    const hidden: EntityLinkDto = {
      id: '10000000-0000-0000-0000-000000000001',
      source_type: 'finding',
      target_type: 'task',
      relation_type: 'requested_task',
      status: 'active',
      managed_system_id: '40000000-0000-0000-0000-000000000004',
      created_by: '50000000-0000-0000-0000-000000000005',
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
      visibility_state: 'hidden',
    };

    render(<EntityLinksInventoryTable items={[hidden]} />);

    expect(screen.getByText('접근할 수 없는 항목')).toBeInTheDocument();
    expect(screen.queryByText('FIN-12')).not.toBeInTheDocument();
    expect(screen.queryByText('TASK-1000')).not.toBeInTheDocument();
    expect(screen.queryByText('20000000')).not.toBeInTheDocument();
    expect(screen.queryByText('30000000')).not.toBeInTheDocument();
  });
});
