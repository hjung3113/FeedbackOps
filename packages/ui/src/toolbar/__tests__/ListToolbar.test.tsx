/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListToolbar } from '../ListToolbar.js';
import type { ListToolbarTab } from '../ListToolbar.js';

const tabs: ListToolbarTab[] = [
  { value: 'untriaged', label: '미분류' },
  { value: 'high', label: '긴급' },
  { value: 'unassigned', label: '미배정', badgeCount: 5 },
  { value: 'disabled', label: '비활성', disabled: true },
];

describe('ListToolbar — tabs mode', () => {
  it('renders all tab labels', () => {
    render(<ListToolbar tabs={tabs} activeTab="untriaged" />);
    expect(screen.getByText('미분류')).toBeInTheDocument();
    expect(screen.getByText('긴급')).toBeInTheDocument();
    expect(screen.getByText('미배정')).toBeInTheDocument();
  });

  it('renders badgeCount when > 0', () => {
    render(<ListToolbar tabs={tabs} activeTab="untriaged" />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not render badgeCount when 0', () => {
    const tabsWithZero: ListToolbarTab[] = [
      { value: 'a', label: '탭A', badgeCount: 0 },
    ];
    render(<ListToolbar tabs={tabsWithZero} activeTab="a" />);
    // The '0' number should not be in a badge
    const badge = screen.queryByText('0');
    expect(badge).toBeNull();
  });

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<ListToolbar tabs={tabs} activeTab="untriaged" onTabChange={onTabChange} />);
    await user.click(screen.getByText('긴급'));
    expect(onTabChange).toHaveBeenCalledWith('high');
  });

  it('does not render h2 title when tabs are provided', () => {
    render(<ListToolbar tabs={tabs} title="제목" activeTab="untriaged" />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders action slot when provided', () => {
    render(
      <ListToolbar tabs={tabs} activeTab="untriaged" action={<button>+ New VOC</button>} />,
    );
    expect(screen.getByText('+ New VOC')).toBeInTheDocument();
  });
});

describe('ListToolbar — title-only mode', () => {
  it('renders h2 with title when no tabs', () => {
    render(<ListToolbar title="내 VOC 목록" />);
    const heading = screen.getByRole('heading');
    expect(heading).toHaveTextContent('내 VOC 목록');
  });

  it('does not render a TabsList when no tabs', () => {
    const { container } = render(<ListToolbar title="제목" />);
    // No role="tablist" present
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('renders action slot in title-only mode', () => {
    render(<ListToolbar title="My List" action={<span data-testid="action-slot">CTA</span>} />);
    expect(screen.getByTestId('action-slot')).toBeInTheDocument();
  });
});
