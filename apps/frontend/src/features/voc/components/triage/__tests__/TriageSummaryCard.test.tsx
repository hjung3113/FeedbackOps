import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TriagePanelLocalState } from '../../../hooks/useTriagePanelState';
import { TriageSummaryCard } from '../TriageSummaryCard';

const BASE_STATE: TriagePanelLocalState = {
  severity: 'medium',
  ownerUserId: null,
  ownerTeamId: null,
  analyticsAreaId: null,
};

describe('TriageSummaryCard', () => {
  it('shows the clean-state message without diff rows and includes the status transition', () => {
    render(
      <TriageSummaryCard
        panelState={BASE_STATE}
        baseline={BASE_STATE}
        currentReporterStatus="received"
      />,
    );
    expect(screen.getByText('변경 없음 — 현재 값 그대로 확정됩니다.')).toBeInTheDocument();
    expect(screen.queryByTestId(/^summary-diff-row-/)).not.toBeInTheDocument();
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent(
      '확정 시 Reporter status:',
    );
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent('접수됨');
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent('검토 중');
    expect(screen.queryByText('Cluster')).not.toBeInTheDocument();
  });

  it('shows only the changed Severity diff and keeps the status transition', () => {
    const panelState = { ...BASE_STATE, severity: 'critical' };
    render(
      <TriageSummaryCard
        panelState={panelState}
        baseline={BASE_STATE}
        currentReporterStatus="received"
      />,
    );
    const row = screen.getByTestId('summary-diff-row-Severity');
    expect(row).toHaveTextContent('medium');
    expect(row).toHaveTextContent('critical');
    expect(row.querySelector('.line-through')).toHaveTextContent('medium');
    expect(row.querySelector('.text-text-primary')).toHaveTextContent('critical');
    expect(screen.getAllByTestId(/^summary-diff-row-/)).toHaveLength(1);
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent(
      '확정 시 Reporter status:',
    );
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent('검토 중');
  });

  it('shows an Owner diff from unset to the actor display name', () => {
    const panelState = { ...BASE_STATE, ownerUserId: 'u-1' };
    const actorMap = new Map([['u-1', { display_name: '김철수' }]]);
    render(
      <TriageSummaryCard
        panelState={panelState}
        baseline={BASE_STATE}
        actorMap={actorMap}
        currentReporterStatus="received"
      />,
    );
    const row = screen.getByTestId('summary-diff-row-Owner');
    expect(row).toHaveTextContent('미지정');
    expect(row).toHaveTextContent('김철수');
    expect(row.querySelector('.line-through')).toHaveTextContent('미지정');
    expect(row.querySelector('.text-text-primary')).toHaveTextContent('김철수');
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent(
      '확정 시 Reporter status:',
    );
    expect(screen.getByTestId('reporter-status-transition')).toHaveTextContent('담당자 배정됨');
    expect(screen.queryByText('Cluster')).not.toBeInTheDocument();
  });

  it('uses the neutral Owner team label without leaking an unresolved team id', () => {
    const baseline = { ...BASE_STATE, ownerTeamId: '00000000-0000-0000-0000-000000000099' };
    const panelState = { ...BASE_STATE, ownerTeamId: null };
    const { container } = render(<TriageSummaryCard panelState={panelState} baseline={baseline} />);
    const row = screen.getByTestId('summary-diff-row-Owner');
    expect(within(row).getByText('Owner team')).toBeInTheDocument();
    expect(row).toHaveTextContent('미지정');
    expect(container).not.toHaveTextContent('00000000');
  });

  it('omits the reporter-status line when the caller has no status', () => {
    render(<TriageSummaryCard panelState={BASE_STATE} baseline={BASE_STATE} />);
    expect(screen.queryByTestId('reporter-status-transition')).not.toBeInTheDocument();
  });

  it('shows Analytics Area names rather than id fragments in a changed-field diff', () => {
    const baseline = { ...BASE_STATE, analyticsAreaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
    const panelState = { ...BASE_STATE, analyticsAreaId: 'ffffffff-1111-2222-3333-444444444444' };
    render(
      <TriageSummaryCard
        panelState={panelState}
        baseline={baseline}
        baselineAnalyticsAreaName="결제 경험"
        analyticsAreaName="구독 분석"
      />,
    );
    const row = screen.getByTestId('summary-diff-row-Analytics Area');
    expect(row).toHaveTextContent('결제 경험');
    expect(row).toHaveTextContent('구독 분석');
    expect(row).not.toHaveTextContent('aaaaaaaa');
    expect(row).not.toHaveTextContent('ffffffff');
  });
});
