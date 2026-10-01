import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../components/shadcn/tabs.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface ListToolbarTab {
  value: string;
  label: string;
  /** Optional count shown as a bare number; undefined means the count is unknown. */
  badgeCount?: number;
  disabled?: boolean;
  /** Urgent affordance — renders the trigger label in the danger token (red). */
  urgent?: boolean;
  icon?: LucideIcon;
  tip?: string;
  id?: string;
  controlsId?: string;
  testId?: string;
}

export interface ListTabsProps {
  tabs: ListToolbarTab[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  ariaLabel?: string;
  align?: 'start' | 'end';
  className?: string;
}

export function ListTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  align = 'start',
  className,
}: ListTabsProps): React.ReactElement {
  const [overflowState, setOverflowState] = React.useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const hasOverflow = overflowState.canScrollLeft || overflowState.canScrollRight;
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = React.useState(tabs[0]?.value ?? '');
  const tabViewportRef = React.useRef<HTMLDivElement>(null);
  const selectedTab = activeTab ?? uncontrolledActiveTab;
  const tabKey = tabs.map((tab) => tab.value).join('|');

  const revealActiveTab = React.useCallback(() => {
    const viewport = tabViewportRef.current;
    const active = viewport?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!viewport || !active) return;

    const viewportRect = viewport.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left =
      activeRect.left < viewportRect.left
        ? activeRect.left - viewportRect.left
        : activeRect.right > viewportRect.right
          ? activeRect.right - viewportRect.right
          : 0;
    if (left !== 0) viewport.scrollBy({ left, behavior: 'smooth' });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tabKey is the rebind trigger when the tab set changes.
  React.useLayoutEffect(() => {
    const viewport = tabViewportRef.current;
    if (!viewport) return;

    const updateOverflow = () => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      setOverflowState({
        canScrollLeft: viewport.scrollLeft > 1,
        canScrollRight: maxScroll - viewport.scrollLeft > 1,
      });
    };
    updateOverflow();
    viewport.addEventListener('scroll', updateOverflow, { passive: true });
    window.addEventListener('resize', updateOverflow);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow);
    resizeObserver?.observe(viewport);
    for (const child of viewport.children) resizeObserver?.observe(child);
    return () => {
      viewport.removeEventListener('scroll', updateOverflow);
      window.removeEventListener('resize', updateOverflow);
      resizeObserver?.disconnect();
    };
  }, [tabKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selection, tab-set, or initial overflow changes must reveal the active tab.
  React.useLayoutEffect(() => {
    revealActiveTab();
  }, [revealActiveTab, selectedTab, tabKey, hasOverflow]);

  const handleTabChange = (next: string) => {
    if (activeTab === undefined) setUncontrolledActiveTab(next);
    onTabChange?.(next);
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    const viewport = tabViewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left:
        direction === 'right'
          ? Math.max(viewport.clientWidth * 0.75, 120)
          : -Math.max(viewport.clientWidth * 0.75, 120),
      behavior: 'smooth',
    });
  };

  return (
    <div className={cn('flex min-w-0 flex-1 items-center', className)}>
      <TooltipProvider delayDuration={400}>
        <div className="flex min-w-0 flex-1 items-center">
          {hasOverflow && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="이전 탭 보기"
                  aria-hidden={!overflowState.canScrollLeft}
                  disabled={!overflowState.canScrollLeft}
                  className={cn(
                    'mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    !overflowState.canScrollLeft && 'invisible',
                  )}
                  onClick={() => scrollTabs('left')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                이전 탭 보기
              </TooltipContent>
            </Tooltip>
          )}
          <div
            ref={tabViewportRef}
            className="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-list-toolbar-tabs
          >
            <Tabs
              className={cn(align === 'end' && 'ml-auto')}
              value={selectedTab}
              onValueChange={handleTabChange}
            >
              <TabsList
                {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
                className="h-7 justify-start gap-0.5 rounded-none bg-transparent p-0 text-text-muted"
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      disabled={tab.disabled}
                      {...(tab.id !== undefined ? { id: tab.id } : {})}
                      {...(tab.controlsId !== undefined ? { 'aria-controls': tab.controlsId } : {})}
                      {...(tab.testId !== undefined ? { 'data-testid': tab.testId } : {})}
                      {...(tab.tip !== undefined ? { title: tab.tip } : {})}
                      className={cn(
                        'group inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-0 text-[13px] font-medium text-text-muted transition-colors',
                        'hover:bg-surface-card hover:text-text-primary',
                        'data-[state=active]:bg-surface-card-elevated data-[state=active]:text-text-primary data-[state=active]:shadow-none',
                        tab.urgent === true &&
                          'text-text-danger hover:text-text-danger data-[state=active]:text-text-danger',
                      )}
                    >
                      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      {tab.label}
                      {tab.badgeCount !== undefined && (
                        <span className="text-[11px] text-text-muted tabular-nums group-data-[state=active]:text-text-secondary">
                          {tab.badgeCount}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
          {hasOverflow && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="다음 탭 보기"
                  aria-hidden={!overflowState.canScrollRight}
                  disabled={!overflowState.canScrollRight}
                  className={cn(
                    'ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    !overflowState.canScrollRight && 'invisible',
                  )}
                  onClick={() => scrollTabs('right')}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                다음 탭 보기
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

ListTabs.displayName = 'ListTabs';
