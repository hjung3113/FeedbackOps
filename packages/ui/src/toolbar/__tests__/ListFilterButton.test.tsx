/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListFilterButton } from '../ListFilterButton.js';
import type { FilterCategory } from '../ListFilterButton.js';

const categories: FilterCategory[] = [
  {
    key: 'filter.severity',
    label: '심각도',
    options: [
      { value: 'critical', label: '심각' },
      { value: 'high', label: '높음' },
    ],
  },
  {
    key: 'filter.reporterStatus',
    label: '상태',
    options: [
      { value: 'open', label: '오픈' },
      { value: 'closed', label: '종료' },
    ],
  },
];

async function openPopover() {
  const user = userEvent.setup();
  const button = screen.getByRole('button', { name: /필터/ });
  await user.click(button);
  return user;
}

describe('ListFilterButton — button label', () => {
  it('shows just "필터" when no filters are applied', () => {
    render(<ListFilterButton categories={categories} values={{}} onChange={() => {}} />);
    const button = screen.getByRole('button', { name: /필터/ });
    expect(button).toBeInTheDocument();
    // No count badge
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it('shows count badge when 1 filter applied', () => {
    render(
      <ListFilterButton
        categories={categories}
        values={{ 'filter.severity': ['critical'] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows count = sum across all categories', () => {
    render(
      <ListFilterButton
        categories={categories}
        values={{ 'filter.severity': ['critical', 'high'], 'filter.reporterStatus': ['open'] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('ListFilterButton — popover content', () => {
  it('shows category labels after opening', async () => {
    render(<ListFilterButton categories={categories} values={{}} onChange={() => {}} />);
    await openPopover();
    expect(screen.getByText('심각도')).toBeInTheDocument();
    expect(screen.getByText('상태')).toBeInTheDocument();
  });

  it('shows option labels', async () => {
    render(<ListFilterButton categories={categories} values={{}} onChange={() => {}} />);
    await openPopover();
    expect(screen.getByText('심각')).toBeInTheDocument();
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('toggles a checkbox and calls onChange with added value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ListFilterButton categories={categories} values={{}} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /필터/ }));
    const checkbox = screen.getByRole('checkbox', { name: /심각$/ });
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ 'filter.severity': ['critical'] }),
    );
  });

  it('toggles a checkbox and calls onChange with value removed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ListFilterButton
        categories={categories}
        values={{ 'filter.severity': ['critical'] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /필터/ }));
    const checkbox = screen.getByRole('checkbox', { name: /심각$/ });
    await user.click(checkbox);
    // key should be removed when array becomes empty
    const firstCall = onChange.mock.calls[0];
    if (!firstCall) throw new Error('onChange not called');
    const nextArg = firstCall[0] as Record<string, string[]>;
    expect(nextArg['filter.severity']).toBeUndefined();
  });
});

describe('ListFilterButton — 필터 초기화', () => {
  it('calls onChange({}) and closes popover', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ListFilterButton
        categories={categories}
        values={{ 'filter.severity': ['critical'] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /필터/ }));
    await user.click(screen.getByText('필터 초기화'));
    expect(onChange).toHaveBeenCalledWith({});
    // Popover should close: category label no longer visible
    expect(screen.queryByText('심각도')).toBeNull();
  });
});
