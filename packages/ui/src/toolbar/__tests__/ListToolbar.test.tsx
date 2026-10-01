import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListToolbar } from '../ListToolbar.js';
import type { ListToolbarTab } from '../ListToolbar.js';

const tabs: ListToolbarTab[] = [
  { value: 'untriaged', label: '미분류' },
  { value: 'high', label: '긴급' },
  { value: 'unassigned', label: '미배정', badgeCount: 5 },
  { value: 'disabled', label: '비활성', disabled: true },
];
const overflowTabs = tabs.slice(0, 3);

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

function stubResizeObserver() {
  const notifyCallbacks: Array<() => void> = [];
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyCallbacks.push(() => callback([], this as unknown as ResizeObserver));
    }

    observe() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  return () => {
    for (const notify of notifyCallbacks) notify();
  };
}

function setOverflowGeometry(tabViewport: HTMLDivElement) {
  const scrollWidth = 254;
  const tabWidths = [88, 48, 102];
  const controlLabels = ['이전 탭 보기', '다음 탭 보기'];
  Object.defineProperties(tabViewport, {
    scrollLeft: { configurable: true, writable: true, value: 0 },
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: {
      configurable: true,
      get: () => {
        const reservedControlCount = controlLabels.filter((label) =>
          tabViewport.parentElement?.querySelector(`button[aria-label="${label}"]`),
        ).length;
        return 187 - reservedControlCount * 28;
      },
    },
  });
  tabViewport.getBoundingClientRect = vi.fn(() => rect(0, tabViewport.clientWidth));
  tabViewport.scrollBy = vi.fn((options: ScrollToOptions) => {
    const maxScroll = scrollWidth - tabViewport.clientWidth;
    tabViewport.scrollLeft = Math.max(
      0,
      Math.min(maxScroll, tabViewport.scrollLeft + (options.left ?? 0)),
    );
    tabViewport.dispatchEvent(new Event('scroll'));
  }) as unknown as HTMLElement['scrollBy'];

  const tabElements = tabViewport.querySelectorAll<HTMLElement>('[role="tab"]');
  let left = 0;
  tabElements.forEach((tab, index) => {
    const tabLeft = left;
    const tabRight = tabLeft + (tabWidths[index] ?? 0);
    tab.getBoundingClientRect = vi.fn(() =>
      rect(tabLeft - tabViewport.scrollLeft, tabRight - tabViewport.scrollLeft),
    );
    left = tabRight;
  });
}

function expectTabFullyVisible(tab: HTMLElement, tabViewport: HTMLDivElement) {
  const tabRect = tab.getBoundingClientRect();
  const viewportRect = tabViewport.getBoundingClientRect();
  expect(tabRect.left).toBeGreaterThanOrEqual(viewportRect.left);
  expect(tabRect.right).toBeLessThanOrEqual(viewportRect.right);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it.each([
    {
      change: 'selection',
      initialTabs: tabs,
      nextTabs: tabs,
      initialActiveTab: 'untriaged',
      nextActiveTab: 'unassigned',
    },
    {
      change: 'tab set',
      initialTabs: tabs.slice(0, 3),
      nextTabs: tabs,
      initialActiveTab: 'unassigned',
      nextActiveTab: 'unassigned',
    },
  ])(
    'shows overflow controls and reveals the active tab after a $change change',
    ({ initialTabs, nextTabs, initialActiveTab, nextActiveTab }) => {
      const { container, rerender } = render(
        <ListToolbar tabs={initialTabs} activeTab={initialActiveTab} />,
      );
      const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
      const scrollBy = vi.fn();
      tabViewport.scrollBy = scrollBy;
      Object.defineProperties(tabViewport, {
        clientWidth: { configurable: true, value: 120 },
        scrollWidth: { configurable: true, value: 300 },
      });
      tabViewport.getBoundingClientRect = vi.fn(() => rect(0, 120));
      screen.getByRole('tab', { name: /미배정/ }).getBoundingClientRect = vi.fn(() =>
        rect(200, 260),
      );

      act(() => window.dispatchEvent(new Event('resize')));
      rerender(<ListToolbar tabs={nextTabs} activeTab={nextActiveTab} />);

      expect(screen.getByRole('button', { name: '다음 탭 보기' })).toBeVisible();
      expect(scrollBy).toHaveBeenCalledWith({ left: 140, behavior: 'smooth' });
    },
  );

  it('reveals a later selected tab after overflow controls appear on initial mount', () => {
    const notifyResize = stubResizeObserver();
    const { container } = render(<ListToolbar tabs={overflowTabs} activeTab="unassigned" />);
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
    setOverflowGeometry(tabViewport);

    act(() => notifyResize());

    expectTabFullyVisible(screen.getByRole('tab', { selected: true }), tabViewport);
  });

  it('reveals a controlled selection change after overflow controls appear', () => {
    const notifyResize = stubResizeObserver();
    const { container, rerender } = render(
      <ListToolbar tabs={overflowTabs} activeTab="untriaged" />,
    );
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
    setOverflowGeometry(tabViewport);

    act(() => notifyResize());
    rerender(<ListToolbar tabs={overflowTabs} activeTab="unassigned" />);

    expectTabFullyVisible(screen.getByRole('tab', { selected: true }), tabViewport);
  });

  it('keeps the inactive overflow control disabled and named in its reserved slot', () => {
    const notifyResize = stubResizeObserver();
    const { container } = render(<ListToolbar tabs={overflowTabs} activeTab="untriaged" />);
    const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
    setOverflowGeometry(tabViewport);

    act(() => notifyResize());

    const previousControl = container.querySelector<HTMLButtonElement>(
      'button[aria-label="이전 탭 보기"]',
    );
    expect(previousControl).toBeInTheDocument();
    expect(previousControl).toBeDisabled();
    expect(previousControl).toHaveAttribute('aria-hidden', 'true');
    expect(previousControl).toHaveAttribute('aria-label', '이전 탭 보기');
    expect(tabViewport.clientWidth).toBe(131);
  });

  it.each([
    { direction: 'right' as const, activeTab: 'untriaged', start: 0, control: '다음 탭 보기' },
    { direction: 'left' as const, activeTab: 'disabled', start: 225, control: '이전 탭 보기' },
  ])(
    'keeps the $direction scroll position when the overflow control layout resizes',
    async ({ direction, activeTab, start, control }) => {
      const notifyResize = stubResizeObserver();
      const user = userEvent.setup();
      const { container } = render(<ListToolbar tabs={tabs} activeTab={activeTab} />);
      const tabViewport = container.querySelector('[data-list-toolbar-tabs]') as HTMLDivElement;
      Object.defineProperties(tabViewport, {
        scrollLeft: { configurable: true, writable: true, value: start },
        scrollWidth: { configurable: true, value: 300 },
        clientWidth: {
          configurable: true,
          get: () => {
            if (direction === 'right') return tabViewport.scrollLeft > 1 ? 75 : 100;
            return tabViewport.scrollLeft > 200 ? 76 : 52;
          },
        },
      });
      tabViewport.getBoundingClientRect = vi.fn(() => rect(0, tabViewport.clientWidth));
      tabViewport.scrollBy = vi.fn((options: ScrollToOptions) => {
        tabViewport.scrollLeft += options.left ?? 0;
        tabViewport.dispatchEvent(new Event('scroll'));
      }) as unknown as typeof tabViewport.scrollBy;
      const active = screen.getByRole('tab', { selected: true });
      active.getBoundingClientRect = vi.fn(() =>
        direction === 'right'
          ? rect(-tabViewport.scrollLeft, 40 - tabViewport.scrollLeft)
          : rect(274 - tabViewport.scrollLeft, 300 - tabViewport.scrollLeft),
      );

      act(() => window.dispatchEvent(new Event('resize')));
      expect(screen.getByRole('button', { name: control })).toBeVisible();

      await user.click(screen.getByRole('button', { name: control }));
      act(() => notifyResize());

      expect(tabViewport.scrollLeft).toBe(direction === 'right' ? 120 : 105);
    },
  );

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
