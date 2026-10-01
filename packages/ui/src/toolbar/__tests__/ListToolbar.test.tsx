import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListToolbar } from '../ListToolbar.js';
import type { ListToolbarTab } from '../ListToolbar.js';

const tabs: ListToolbarTab[] = [
  { value: 'untriaged', label: '미분류' },
  { value: 'high', label: '긴급' },
  { value: 'unassigned', label: '미배정', badgeCount: 5 },
  { value: 'disabled', label: '비활성', disabled: true },
];

const rect = (left: number, right: number): DOMRect =>
  ({
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 40,
    width: right - left,
    height: 40,
    toJSON: () => ({}),
  }) as DOMRect;

describe('ListToolbar — tabs mode', () => {
  it('locks the toolbar row to the 50px h-toolbar rhythm', () => {
    const { container } = render(<ListToolbar tabs={tabs} activeTab="untriaged" />);
    const toolbar = container.firstElementChild;
    expect(toolbar?.className).toContain('h-toolbar');
    expect(toolbar).toHaveAttribute('data-toolbar-height', '50');
  });

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
    const tabsWithZero: ListToolbarTab[] = [{ value: 'a', label: '탭A', badgeCount: 0 }];
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

  it('applies the danger token to an urgent tab', () => {
    const urgentTabs: ListToolbarTab[] = [
      { value: 'untriaged', label: '미분류' },
      { value: 'unassigned', label: 'Unassigned', urgent: true },
    ];
    render(<ListToolbar tabs={urgentTabs} activeTab="untriaged" />);
    expect(screen.getByText('Unassigned').className).toContain('text-danger');
    // Non-urgent tabs are not flagged.
    expect(screen.getByText('미분류').className).not.toContain('text-danger');
  });

  it('renders action slot when provided', () => {
    render(
      <ListToolbar
        tabs={tabs}
        activeTab="untriaged"
        action={<button type="button">+ New VOC</button>}
      />,
    );
    expect(screen.getByText('+ New VOC')).toBeInTheDocument();
  });

  it('keeps the tab strip scrollable when actions occupy toolbar width', () => {
    const { container } = render(
      <ListToolbar
        tabs={tabs}
        activeTab="untriaged"
        action={<button type="button">Action</button>}
      />,
    );
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]');
    expect(tabViewport?.className).toContain('overflow-x-auto');
    expect(tabViewport?.className).toContain('whitespace-nowrap');
  });

  it('shows a next-tab control for overflow and scrolls the active tab into view', () => {
    const { container } = render(<ListToolbar tabs={tabs} activeTab="unassigned" />);
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
    const scrollBy = vi.fn();
    tabViewport.scrollBy = scrollBy;
    Object.defineProperties(tabViewport, {
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 300 },
    });
    tabViewport.getBoundingClientRect = vi.fn(() => rect(0, 120));
    screen.getByRole('tab', { name: /미배정/ }).getBoundingClientRect = vi.fn(() => rect(200, 260));

    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByRole('button', { name: '다음 탭 보기' })).toBeVisible();
    expect(scrollBy).toHaveBeenCalledWith({ left: 140, behavior: 'smooth' });
  });

  it('does not show scroll controls when the tab strip fits', () => {
    const { container } = render(<ListToolbar tabs={tabs} activeTab="untriaged" />);
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
    Object.defineProperties(tabViewport, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 300 },
    });

    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.queryByRole('button', { name: '이전 탭 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 탭 보기' })).not.toBeInTheDocument();
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
