import { render, screen } from '@testing-library/react';
import type { SeverityEnum } from '../../indicators/SeverityIndicator.js';
import { SeverityBadge } from '../SeverityBadge.js';

const cases: Array<{ severity: SeverityEnum; label: string }> = [
  { severity: 'low', label: '낮음' },
  { severity: 'medium', label: '중간' },
  { severity: 'high', label: '높음' },
  { severity: 'critical', label: '심각' },
];

describe('SeverityBadge', () => {
  it('uses a caller-provided label without changing the severity token', () => {
    const { container } = render(<SeverityBadge severity="critical" label="긴급" />);

    expect(screen.getByText('긴급')).toBeInTheDocument();
    expect(screen.queryByText('심각')).not.toBeInTheDocument();
    expect(container.querySelector('[data-token="--severity-critical"]')).not.toBeNull();
  });

  for (const { severity, label } of cases) {
    it(`renders Korean label "${label}" for severity="${severity}"`, () => {
      render(<SeverityBadge severity={severity} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`sets data-token to --severity-${severity}`, () => {
      const { container } = render(<SeverityBadge severity={severity} />);
      const badge = container.querySelector(`[data-token="--severity-${severity}"]`);
      expect(badge).not.toBeNull();
    });

    // #525: `var(${token})` used directly as `color` is not a valid CSS
    // color (the token is a raw RGB triplet) and the base hue fails WCAG AA
    // 4.5:1 as text at 12% tint anyway — must use the `-label` token,
    // rgb()-wrapped.
    it('uses the -label token (rgb()-wrapped) for label text color', () => {
      const { container } = render(<SeverityBadge severity={severity} />);
      const badge = container.querySelector(`[data-token="--severity-${severity}"]`) as HTMLElement;
      expect(badge).toHaveClass(`text-severity-${severity}-label`);
      expect(badge.style.getPropertyValue('--status-badge-tint')).toBe(
        `rgb(var(--severity-${severity}) / 0.12)`,
      );
    });
  }
});
