// TriageQueue.test.tsx — RED tests for the triage queue container.
// Covers: renders rows, empty state, OutOfScopeSummary.
// TDD RED: these tests are written before the implementation file exists.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TriageQueue } from '../TriageQueue';
import type { VocListItem } from '@fops/shared';

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
    attachment_count: 0,
  },
];

describe('TriageQueue', () => {
  it('renders all voc rows when queue is non-empty', () => {
    render(
      <TriageQueue
        vocs={VOCS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('First VOC')).toBeInTheDocument();
    expect(screen.getByText('Second VOC')).toBeInTheDocument();
  });

  it('renders TriageEmpty when queue is empty', () => {
    render(
      <TriageQueue
        vocs={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    // TriageEmpty renders "큐가 비었습니다" copy from prototype
    expect(screen.getByText('큐가 비었습니다')).toBeInTheDocument();
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
});
