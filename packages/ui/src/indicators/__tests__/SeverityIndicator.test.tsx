/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render } from '@testing-library/react';
import { SeverityIndicator, type SeverityEnum } from '../SeverityIndicator.js';

const severities: Array<{ severity: SeverityEnum; expectedFilled: number }> = [
  { severity: 'low',      expectedFilled: 1 },
  { severity: 'medium',   expectedFilled: 2 },
  { severity: 'high',     expectedFilled: 3 },
  { severity: 'critical', expectedFilled: 3 },
];

describe('SeverityIndicator', () => {
  severities.forEach(({ severity, expectedFilled }) => {
    describe(`severity="${severity}"`, () => {
      it(`renders ${expectedFilled} filled bar(s) and ${3 - expectedFilled} dimmed bar(s)`, () => {
        const { container } = render(<SeverityIndicator severity={severity} />);
        const bars = container.querySelectorAll('[data-filled]');
        expect(bars).toHaveLength(3);

        const filledBars   = Array.from(bars).filter(b => b.getAttribute('data-filled') === 'true');
        const dimmedBars   = Array.from(bars).filter(b => b.getAttribute('data-filled') === 'false');
        expect(filledBars).toHaveLength(expectedFilled);
        expect(dimmedBars).toHaveLength(3 - expectedFilled);
      });

      it(`sets data-token to --severity-${severity} on every bar`, () => {
        const { container } = render(<SeverityIndicator severity={severity} />);
        const bars = container.querySelectorAll('[data-token]');
        bars.forEach(bar => {
          expect(bar.getAttribute('data-token')).toBe(`--severity-${severity}`);
        });
      });

      it('filled bars have opacity 1 and dimmed bars have opacity 0.3', () => {
        const { container } = render(<SeverityIndicator severity={severity} />);
        const bars = Array.from(container.querySelectorAll('[data-filled]'));
        bars.forEach(bar => {
          const isFilled = bar.getAttribute('data-filled') === 'true';
          const el = bar as HTMLElement;
          expect(el.style.opacity).toBe(isFilled ? '1' : '0.3');
        });
      });
    });
  });
});
