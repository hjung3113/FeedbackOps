// TriageQueue.test.tsx — RED tests for the triage queue container.
// Covers: renders rows, empty state, OutOfScopeSummary.
// TDD RED: these tests are written before the implementation file exists.

import type { VocListItem } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TriageQueue } from '../TriageQueue';

const VOCS: VocListItem[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: 'First VOC',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u1',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high',
    reporter_facing_status: 'received',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_id: 'VOC-002',
    title: 'Second VOC',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: 'aa-1',
    reporter_id: 'u2',
    owner_user_id: 'u-owner',
    owner_team_id: null,
    severity: 'medium',
    reporter_facing_status: 'reviewing',
    triage_state: 'untriaged',
    source_context: 'proxy_report',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  },
];

describe('TriageQueue', () => {
  it('renders all voc rows when queue is non-empty', () => {
    render(<TriageQueue vocs={VOCS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('First VOC')).toBeInTheDocument();
    expect(screen.getByText('Second VOC')).toBeInTheDocument();
  });

  it('renders OutOfScopeSummaryBanner when outOfScopeSummary is provided', () => {
    render(
      <TriageQueue
        vocs={VOCS}
        selectedId={null}
        onSelect={vi.fn()}
        outOfScopeSummary={{ count: 2, severity_distribution: { high: 1, critical: 1 } }}
      />,
    );
    // OutOfScopeSummaryBanner is rendered above rows
    expect(screen.getByText(/2건/)).toBeInTheDocument();
  });

  it.each([
    {
      queueTotal: 7,
      present: '이 탭에 해당하는 VOC가 없습니다',
      absent: '큐가 비었습니다',
    },
    {
      queueTotal: 0,
      present: '큐가 비었습니다',
      absent: '이 탭에 해당하는 VOC가 없습니다',
    },
    {
      // FIX1: an unknown total is not evidence of a truly empty queue — it
      // must not claim every VOC was processed.
      queueTotal: undefined,
      present: '이 탭에 해당하는 VOC가 없습니다',
      absent: '큐가 비었습니다',
    },
  ])(
    'picks the right empty copy for queueTotal=$queueTotal (#922)',
    ({ queueTotal, present, absent }) => {
      render(
        <TriageQueue
          vocs={[]}
          selectedId={null}
          onSelect={vi.fn()}
          {...(queueTotal !== undefined ? { queueTotal } : {})}
        />,
      );
      expect(screen.getByText(present)).toBeInTheDocument();
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    },
  );

  // #935: a failed queue read with no rows renders the shared list load-error
  // state; retry re-enters the route's refetch.
  it('renders the load-error state on queueError and calls onRetryQueue on retry click (#935)', () => {
    const onRetryQueue = vi.fn();
    render(
      <TriageQueue
        vocs={[]}
        selectedId={null}
        onSelect={vi.fn()}
        queueError
        onRetryQueue={onRetryQueue}
      />,
    );
    expect(screen.getByText('불러오기 실패')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetryQueue).toHaveBeenCalledTimes(1);
  });
});
