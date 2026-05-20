/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../SeverityBadge.js';
import type { SeverityEnum } from '../../indicators/SeverityIndicator.js';

const cases: Array<{ severity: SeverityEnum; label: string }> = [
  { severity: 'low',      label: '낮음' },
  { severity: 'medium',   label: '중간' },
  { severity: 'high',     label: '높음' },
  { severity: 'critical', label: '심각' },
];

describe('SeverityBadge', () => {
  cases.forEach(({ severity, label }) => {
    it(`renders Korean label "${label}" for severity="${severity}"`, () => {
      render(<SeverityBadge severity={severity} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`sets data-token to --severity-${severity}`, () => {
      const { container } = render(<SeverityBadge severity={severity} />);
      const badge = container.querySelector(`[data-token="--severity-${severity}"]`);
      expect(badge).not.toBeNull();
    });
  });
});
