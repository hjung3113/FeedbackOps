import { render, screen } from '@testing-library/react';
import { type ReporterFacingStatusEnum, ReporterStatusBadge } from '../ReporterStatusBadge.js';

const cases: Array<{ status: ReporterFacingStatusEnum; label: string }> = [
  { status: 'received', label: '접수됨' },
  { status: 'reviewing', label: '검토 중' },
  { status: 'assigned', label: '담당자 배정됨' },
  { status: 'progress', label: '처리 중' },
  { status: 'prep', label: '해결 준비 중' },
  { status: 'resolved', label: '해결됨' },
  { status: 'reopened', label: '다시 처리 중' },
  { status: 'closed', label: '종료됨' },
];

describe('ReporterStatusBadge', () => {
  for (const { status, label } of cases) {
    it(`renders Korean label "${label}" for status="${status}"`, () => {
      render(<ReporterStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`sets data-token to --status-reporter-${status}`, () => {
      const { container } = render(<ReporterStatusBadge status={status} />);
      const badge = container.querySelector(`[data-token="--status-reporter-${status}"]`);
      expect(badge).not.toBeNull();
    });

    // #525: the label text must use the contrast-safe `-label` token, not
    // the base token — the base hue fails WCAG AA 4.5:1 as text at its own
    // 14% tint (measured 2.25:1-3.91:1 for 6 of the 8 statuses).
    it('uses the -label token (not the base token) for label text color', () => {
      const { container } = render(<ReporterStatusBadge status={status} />);
      const badge = container.querySelector(
        `[data-token="--status-reporter-${status}"]`,
      ) as HTMLElement;
      expect(badge).toHaveClass(`text-status-reporter-${status}-label`);
      expect(badge.style.getPropertyValue('--status-badge-tint')).toBe(
        `rgb(var(--status-reporter-${status}) / 0.14)`,
      );
    });
  }
});
