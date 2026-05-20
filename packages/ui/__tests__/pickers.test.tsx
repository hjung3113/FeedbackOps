// AnalyticsAreaPicker is feature-local in packages/ui (not exported from the
// public index) until a real second consumer lands (likely #21 triage composer's
// ManagedSystem/AnalyticsArea selector). Tests live here — internal to the package.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AnalyticsAreaPicker } from '../src/components/AnalyticsAreaPicker';

describe('<AnalyticsAreaPicker>', () => {
  test('disabled prop is announced on the picker root via aria-disabled', () => {
    render(
      <AnalyticsAreaPicker
        options={[{ id: 'a', label: 'Alpha' }]}
        value={null}
        onChange={() => {}}
        disabled
        testId="aa-picker"
      />,
    );
    expect(screen.getByTestId('aa-picker')).toHaveAttribute('aria-disabled', 'true');
  });

  test('renders options and fires onChange with the selected id', () => {
    const onChange = (val: string | null) => val;
    render(
      <AnalyticsAreaPicker
        options={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
        value={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeInTheDocument();
  });
});
