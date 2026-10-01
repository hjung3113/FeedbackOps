import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Flag } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListTabs } from '../ListTabs.js';
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

  it('end-aligns the Tabs root as the viewport direct child', () => {
    const { container } = render(<ListTabs tabs={tabs} activeTab="untriaged" align="end" />);
    const viewport = container.querySelector('[data-list-toolbar-tabs]');
    const tabsRoot = viewport?.firstElementChild;

    expect(tabsRoot).toHaveClass('ml-auto');
    expect(tabsRoot).toContainElement(screen.getByRole('tablist'));
    expect(screen.getByRole('tablist')).not.toHaveClass('ml-auto');
  });

  it('uses the shared prototype tab size, hover, and active states', () => {
    const styledTabs: ListToolbarTab[] = [
      { value: 'normal', label: 'Normal' },
      { value: 'urgent', label: 'Urgent', urgent: true },
    ];
    const { rerender } = render(<ListTabs tabs={styledTabs} activeTab="normal" />);

    const normalTab = screen.getByRole('tab', { name: 'Normal' });
    const urgentTab = screen.getByRole('tab', { name: 'Urgent' });
    expect(normalTab).toHaveClass(
      'h-7',
      'px-2.5',
      'gap-1.5',
      'text-[13px]',
      'hover:bg-surface-card',
      'hover:text-text-primary',
      'data-[state=active]:bg-surface-card-elevated',
      'data-[state=active]:text-text-primary',
      'data-[state=active]:shadow-none',
    );
    expect(normalTab).not.toHaveClass('data-[state=active]:shadow-sm');
    expect(urgentTab).toHaveClass(
      'text-text-danger',
      'hover:text-text-danger',
      'data-[state=active]:text-text-danger',
    );

    rerender(<ListTabs tabs={styledTabs} activeTab="urgent" />);
    expect(screen.getByRole('tab', { name: 'Urgent' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Urgent' })).toHaveClass(
      'text-text-danger',
      'data-[state=active]:bg-surface-card-elevated',
      'data-[state=active]:text-text-danger',
    );
  });

  it('renders badgeCount as a bare number when defined', () => {
    render(<ListToolbar tabs={tabs} activeTab="untriaged" />);
    const tab = screen.getByRole('tab', { name: '미배정 5' });
    expect(tab).toBeInTheDocument();
    expect(screen.getByText('5')).toHaveClass('text-[11px]', 'text-text-muted', 'tabular-nums');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders defined zero counts and omits undefined counts', () => {
    const tabsWithZero: ListToolbarTab[] = [
      { value: 'a', label: '탭A', badgeCount: 0 },
      { value: 'b', label: '탭B' },
    ];
    render(<ListToolbar tabs={tabsWithZero} activeTab="a" />);

    expect(screen.getByRole('tab', { name: '탭A 0' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '탭B' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('0')).toHaveClass(
      'text-[11px]',
      'text-text-muted',
      'tabular-nums',
      'group-data-[state=active]:text-text-secondary',
    );
    expect(screen.getByRole('tab', { name: '탭B' }).querySelector('span')).toBeNull();
  });

  it('renders the icon as decorative and uses a native title for its tip', () => {
    const iconTab: ListToolbarTab[] = [
      { value: 'flagged', label: 'Flagged', icon: Flag, tip: 'Items waiting for review' },
    ];
    render(<ListToolbar tabs={iconTab} activeTab="flagged" />);

    const tab = screen.getByRole('tab', { name: 'Flagged' });
    expect(tab).toHaveAttribute('title', 'Items waiting for review');
    expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the secondary text token for the active tab count', () => {
    const countedTabs: ListToolbarTab[] = [
      { value: 'selected', label: 'Selected', badgeCount: 1 },
      { value: 'other', label: 'Other', badgeCount: 2 },
    ];
    render(<ListToolbar tabs={countedTabs} activeTab="selected" />);

    const selectedCount = screen.getByRole('tab', { name: 'Selected 1' }).querySelector('span');
    const otherCount = screen.getByRole('tab', { name: 'Other 2' }).querySelector('span');
    expect(selectedCount).toHaveClass('group-data-[state=active]:text-text-secondary');
    expect(otherCount).toHaveClass('text-text-muted');
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
    expect(screen.getByText('Unassigned').className).toContain('text-text-danger');
    // Non-urgent tabs are not flagged.
    expect(screen.getByText('미분류').className).not.toContain('text-text-danger');
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
