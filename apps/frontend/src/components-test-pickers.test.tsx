// Dumb picker contracts (Slice 2 #11). Verifies that the pickers render
// the options they are passed, fire `onChange(null)` when the placeholder
// option is selected, and stay accessible via the test id.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AnalyticsAreaPicker, ManagedSystemPicker } from '@fops/ui';

describe('<ManagedSystemPicker>', () => {
  test('renders options and fires onChange with the selected id', () => {
    const onChange = vi.fn();
    render(
      <ManagedSystemPicker
        options={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
        value={null}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('managed-system-picker'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  test('selecting placeholder fires onChange(null)', () => {
    const onChange = vi.fn();
    render(
      <ManagedSystemPicker options={[{ id: 'a', label: 'Alpha' }]} value="a" onChange={onChange} />,
    );
    fireEvent.change(screen.getByTestId('managed-system-picker'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('archived label suffix renders when includeArchivedInLabel is true', () => {
    render(
      <ManagedSystemPicker
        options={[{ id: 'a', label: 'Alpha', archived: true }]}
        value={null}
        onChange={() => {}}
        includeArchivedInLabel
      />,
    );
    expect(screen.getByText('Alpha (archived)')).toBeInTheDocument();
  });
});

describe('<AnalyticsAreaPicker>', () => {
  test('disabled prop disables the underlying select', () => {
    render(
      <AnalyticsAreaPicker
        options={[]}
        value={null}
        onChange={() => {}}
        disabled
        testId="aa-picker"
      />,
    );
    expect(screen.getByTestId('aa-picker')).toBeDisabled();
  });
});
