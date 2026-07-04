import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TriagePanelLocalState } from '../../../hooks/useTriagePanelState';
import { TriageSummaryCard } from '../TriageSummaryCard';

const BASE_STATE: TriagePanelLocalState = {
  severity: null,
  ownerUserId: null,
  ownerTeamId: null,
  analyticsAreaId: null,
};

describe('TriageSummaryCard', () => {
  it('shows "미지정" for each field when state is empty', () => {
    render(<TriageSummaryCard panelState={BASE_STATE} />);
    // Severity row and Owner row both show 미지정
    const missingTexts = screen.getAllByText('미지정');
    expect(missingTexts.length).toBeGreaterThanOrEqual(2);
    // Analytics Area shows "없음"
    expect(screen.getByText('없음')).toBeInTheDocument();
  });

  it('shows SeverityBadge when severity is set', () => {
    const state = { ...BASE_STATE, severity: 'high' };
    render(<TriageSummaryCard panelState={state} />);
    // SeverityBadge renders Korean label '높음' for 'high'
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('shows owner display_name when ownerUserId is set and actorMap provided', () => {
    const state = { ...BASE_STATE, ownerUserId: 'u-1' };
    const actorMap = new Map([['u-1', { display_name: '김철수' }]]);
    render(<TriageSummaryCard panelState={state} actorMap={actorMap} />);
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });

  it('uses a neutral owner label when a team id cannot be resolved', () => {
    const state = { ...BASE_STATE, ownerTeamId: '00000000-0000-0000-0000-000000000099' };
    render(<TriageSummaryCard panelState={state} />);
    expect(screen.getByText('Owner team')).toBeInTheDocument();
    expect(screen.queryByText(/Team 00000000/)).not.toBeInTheDocument();
  });

  it('shows analytics area name instead of id slice', () => {
    const state = {
      ...BASE_STATE,
      analyticsAreaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    };
    render(<TriageSummaryCard panelState={state} analyticsAreaName="결제 경험" />);
    expect(screen.getByText('결제 경험')).toBeInTheDocument();
    expect(screen.queryByText('aaaaaaaa')).not.toBeInTheDocument();
  });

  // Prototype ref: screen-voc-create.jsx:561-567 — "Reporter status 변경" row.
  it('omits the reporter-status transition row when currentReporterStatus is undefined', () => {
    render(<TriageSummaryCard panelState={BASE_STATE} />);
    expect(screen.queryByTestId('reporter-status-transition')).not.toBeInTheDocument();
  });

  it('renders current → reviewing when an owner is NOT staged', () => {
    render(<TriageSummaryCard panelState={BASE_STATE} currentReporterStatus="received" />);
    const row = screen.getByTestId('reporter-status-transition');
    expect(row).toBeInTheDocument();
    // current 접수됨 → target 검토 중 (no owner)
    expect(row).toHaveTextContent('접수됨');
    expect(row).toHaveTextContent('검토 중');
  });

  it('renders current → assigned when an owner IS staged', () => {
    const state = { ...BASE_STATE, ownerUserId: 'u-1' };
    render(<TriageSummaryCard panelState={state} currentReporterStatus="received" />);
    const row = screen.getByTestId('reporter-status-transition');
    // current 접수됨 → target 담당자 배정됨 (owner present)
    expect(row).toHaveTextContent('담당자 배정됨');
  });
});
