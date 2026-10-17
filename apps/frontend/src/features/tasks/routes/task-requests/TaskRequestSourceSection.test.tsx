import { shortId } from '@/lib/identity';
import type { TaskRequestDto } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskRequestSourceSection } from './TaskRequestSourceSection';

const SOURCE_ID = '40000000-0000-0000-0000-000000000004';

function makeItem(
  sourceType: 'voc' | 'voc_cluster',
  source: Partial<NonNullable<TaskRequestDto['source']>> | null,
): TaskRequestDto {
  return {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'REQ-42',
    source_type: sourceType,
    source_id: SOURCE_ID,
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    evidence_summary: '로그인 흐름에서 오류가 발생합니다.',
    requested_outcome: '로그인 오류를 수정합니다.',
    requester_actor_id: '20000000-0000-0000-0000-000000000002',
    status: 'pending_review',
    assigned_reviewer_actor_id: null,
    assigned_reviewer_team_id: null,
    reviewer_actor_id: null,
    decision_reason: null,
    decided_at: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...(source
      ? {
          source: {
            type: sourceType,
            id: SOURCE_ID,
            relation_type: 'requested_task' as const,
            link_id: '50000000-0000-0000-0000-000000000005',
            ...source,
          },
        }
      : {}),
  };
}

const KIND_LABEL = { voc: 'VOC', voc_cluster: 'VOC Cluster' } as const;

describe('Task Request source section for VOC and Cluster origins (#1243)', () => {
  it.each(['voc', 'voc_cluster'] as const)(
    '%s shows the display id and title when the payload carries both',
    (type) => {
      render(
        <TaskRequestSourceSection
          item={makeItem(type, { display_id: 'V-204', title: '로그인 지연' })}
          sourceFinding={undefined}
        />,
      );
      expect(screen.getByText(`출처 ${KIND_LABEL[type]}`)).toBeInTheDocument();
      expect(screen.getByText('V-204')).toBeInTheDocument();
      expect(screen.getByText('로그인 지연')).toBeInTheDocument();
      expect(screen.queryByText(shortId(SOURCE_ID))).not.toBeInTheDocument();
    },
  );

  it.each([
    ['voc', { display_id: 'V-204' }],
    ['voc', { title: '로그인 지연' }],
    ['voc', null],
    ['voc_cluster', { display_id: 'C-9' }],
    ['voc_cluster', { title: '로그인 클러스터' }],
    ['voc_cluster', null],
  ] as const)('%s with %j falls back to the short id and evidence summary', (type, source) => {
    render(<TaskRequestSourceSection item={makeItem(type, source)} sourceFinding={undefined} />);
    expect(screen.getByText(`출처 ${KIND_LABEL[type]}`)).toBeInTheDocument();
    expect(screen.getByText(shortId(SOURCE_ID))).toBeInTheDocument();
    expect(screen.getByText('로그인 흐름에서 오류가 발생합니다.')).toBeInTheDocument();
    for (const leaked of ['V-204', 'C-9', '로그인 지연', '로그인 클러스터']) {
      expect(screen.queryByText(leaked)).not.toBeInTheDocument();
    }
  });
});
