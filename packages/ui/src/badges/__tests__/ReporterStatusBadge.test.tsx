/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ReporterStatusBadge, type ReporterFacingStatusEnum } from '../ReporterStatusBadge.js';

const cases: Array<{ status: ReporterFacingStatusEnum; label: string }> = [
  { status: 'received',  label: '접수됨' },
  { status: 'reviewing', label: '검토 중' },
  { status: 'assigned',  label: '담당자 배정됨' },
  { status: 'progress',  label: '처리 중' },
  { status: 'prep',      label: '해결 준비 중' },
  { status: 'resolved',  label: '해결됨' },
  { status: 'reopened',  label: '다시 처리 중' },
  { status: 'closed',    label: '종료됨' },
];

describe('ReporterStatusBadge', () => {
  cases.forEach(({ status, label }) => {
    it(`renders Korean label "${label}" for status="${status}"`, () => {
      render(<ReporterStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`sets data-token to --status-reporter-${status}`, () => {
      const { container } = render(<ReporterStatusBadge status={status} />);
      const badge = container.querySelector(`[data-token="--status-reporter-${status}"]`);
      expect(badge).not.toBeNull();
    });
  });
});
