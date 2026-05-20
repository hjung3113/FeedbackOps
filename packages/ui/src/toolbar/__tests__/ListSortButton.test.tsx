/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListSortButton } from '../ListSortButton.js';
import type { SortOption } from '../ListSortButton.js';

const options: SortOption[] = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'severity:desc', label: '심각도 높은순' },
];

const DEFAULT_VALUE = 'created_at:desc';

describe('ListSortButton — button label', () => {
  it('shows "정렬" when value equals defaultValue', () => {
    render(
      <ListSortButton
        options={options}
        value={DEFAULT_VALUE}
        defaultValue={DEFAULT_VALUE}
        onChange={() => {}}
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('정렬');
  });

  it('shows chip with active label when value differs from defaultValue', () => {
    render(
      <ListSortButton
        options={options}
        value="severity:desc"
        defaultValue={DEFAULT_VALUE}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('심각도 높은순')).toBeInTheDocument();
  });

  it('shows "정렬:" prefix when non-default sort is active', () => {
    const { container } = render(
      <ListSortButton
        options={options}
        value="severity:desc"
        defaultValue={DEFAULT_VALUE}
        onChange={() => {}}
      />,
    );
    expect(container).toHaveTextContent('정렬:');
  });
});

describe('ListSortButton — popover + radio', () => {
  it('shows all sort options after opening', async () => {
    const user = userEvent.setup();
    render(
      <ListSortButton
        options={options}
        value={DEFAULT_VALUE}
        defaultValue={DEFAULT_VALUE}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('최신순')).toBeInTheDocument();
    expect(screen.getByText('오래된순')).toBeInTheDocument();
    expect(screen.getByText('심각도 높은순')).toBeInTheDocument();
  });

  it('calls onChange with selected value when a radio is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ListSortButton
        options={options}
        value={DEFAULT_VALUE}
        defaultValue={DEFAULT_VALUE}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('오래된순'));
    expect(onChange).toHaveBeenCalledWith('created_at:asc');
  });

  it('closes popover after selection', async () => {
    const user = userEvent.setup();
    render(
      <ListSortButton
        options={options}
        value={DEFAULT_VALUE}
        defaultValue={DEFAULT_VALUE}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('오래된순'));
    // After close, option labels should no longer be in DOM
    expect(screen.queryByText('오래된순')).toBeNull();
  });
});
