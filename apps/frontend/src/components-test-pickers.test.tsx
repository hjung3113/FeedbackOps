// Dumb picker contracts (Slice 2 #11, rebuilt Pack 17 / ADR-0021 on shadcn
// ToggleGroup). Migrated from native-select fireEvent.change semantics to
// chip-click semantics; the dumb-prop contract (PickerOption[],
// onChange(string|null), disabled, testId) is preserved unchanged. The DOM
// assertion surface now matches the Radix ToggleGroup that ships per spec §3.4.

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
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  test('re-clicking the selected chip fires onChange(null)', () => {
    const onChange = vi.fn();
    render(
      <ManagedSystemPicker options={[{ id: 'a', label: 'Alpha' }]} value="a" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
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
});
