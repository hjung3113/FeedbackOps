// OutOfScopeSummaryBanner.test.tsx — RED tests.
// Prototype ref: screen-voc-create.jsx:672-687
// TDD RED: written before implementation exists.

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutOfScopeSummaryBanner } from '../OutOfScopeSummaryBanner';

describe('OutOfScopeSummaryBanner', () => {
  it('renders count and severity distribution', () => {
    render(
      <OutOfScopeSummaryBanner
        count={3}
        severityDistribution={{ high: 2, critical: 1 }}
      />,
    );
    expect(screen.getByText(/3건/)).toBeInTheDocument();
    expect(screen.getByText(/high/)).toBeInTheDocument();
    expect(screen.getByText(/critical/)).toBeInTheDocument();
  });

  it('renders the "Managed System 권한 밖" context text', () => {
    render(
      <OutOfScopeSummaryBanner
        count={1}
        severityDistribution={{ medium: 1 }}
      />,
    );
    expect(screen.getByText(/Managed System 권한 밖/)).toBeInTheDocument();
  });
});
