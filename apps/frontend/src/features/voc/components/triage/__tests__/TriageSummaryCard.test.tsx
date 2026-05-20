// TriageSummaryCard.test.tsx — TDD RED tests for the Triage 결과 미리보기 card.
// Prototype ref: screen-voc-create.jsx:543-569
// FieldRow rows: Severity, Owner, Analytics Area, Cluster state.

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TriageSummaryCard } from '../TriageSummaryCard';
import type { TriagePanelLocalState } from '../../../hooks/useTriagePanelState';

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
});
