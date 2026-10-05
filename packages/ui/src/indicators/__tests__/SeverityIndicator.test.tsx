import { render } from '@testing-library/react';
import { type SeverityEnum, SeverityIndicator } from '../SeverityIndicator.js';

const severities: Array<{ severity: SeverityEnum; expectedFilled: number }> = [
  { severity: 'low', expectedFilled: 1 },
  { severity: 'medium', expectedFilled: 2 },
  { severity: 'high', expectedFilled: 3 },
  { severity: 'critical', expectedFilled: 3 },
];

describe('SeverityIndicator', () => {
  severities.forEach(({ severity, expectedFilled }) => {
    describe(`severity="${severity}"`, () => {
      it(`renders ${expectedFilled} filled bar(s) and ${3 - expectedFilled} dimmed bar(s)`, () => {
        const { container } = render(<SeverityIndicator severity={severity} />);
        const bars = container.querySelectorAll('[data-filled]');
        expect(bars).toHaveLength(3);

        const filledBars = Array.from(bars).filter((b) => b.getAttribute('data-filled') === 'true');
        const dimmedBars = Array.from(bars).filter(
          (b) => b.getAttribute('data-filled') === 'false',
        );
        expect(filledBars).toHaveLength(expectedFilled);
        expect(dimmedBars).toHaveLength(3 - expectedFilled);
      });

      it(`sets data-token to --severity-${severity} on every bar`, () => {
        const { container } = render(<SeverityIndicator severity={severity} />);
        const bars = container.querySelectorAll('[data-token]');
        bars.forEach((bar) => {
          expect(bar.getAttribute('data-token')).toBe(`--severity-${severity}`);
        });
      });

    });
  });
});
