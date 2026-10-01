import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Badge } from '../components/shadcn/badge.js';
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
  badgeCount?: number;
  disabled?: boolean;
  /**
   * Urgent affordance — renders the trigger label in the danger token (red)
   * to flag an attention-needed queue (e.g. VOC inbox "Unassigned"). Mirrors
   * the prototype's `urgent: true` tab flag.
   */
  urgent?: boolean;
}

export interface ListToolbarProps {
  title?: string;
  tabs?: ListToolbarTab[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  action?: React.ReactNode;
  className?: string;
}

export function ListToolbar({
  title,
  tabs,
  activeTab,
  onTabChange,
  action,
  className,
}: ListToolbarProps) {
  const [overflowState, setOverflowState] = React.useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const hasOverflow = overflowState.canScrollLeft || overflowState.canScrollRight;
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = React.useState(tabs?.[0]?.value ?? '');
  const tabViewportRef = React.useRef<HTMLDivElement>(null);
  const selectedTab = activeTab ?? uncontrolledActiveTab;
  const tabKey = tabs?.map((tab) => tab.value).join('|') ?? '';

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: tabKey is the rebind trigger when the tab set changes; tabs is read only for presence.
  React.useLayoutEffect(() => {
    const viewport = tabViewportRef.current;
    if (!viewport) return;
    if (tabs === undefined) {
      setOverflowState({ canScrollLeft: false, canScrollRight: false });
      return;
    }

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
    <div
      className={cn(
        'flex h-toolbar items-center justify-between gap-3 border-b border-border-subtle px-4 bg-surface-canvas sticky top-0 z-10',
        className,
      )}
      data-toolbar-height="50"
    >
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
            {tabs !== undefined ? (
              <Tabs
                {...(activeTab !== undefined ? { value: activeTab } : {})}
                onValueChange={handleTabChange}
              >
                <TabsList>
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      disabled={tab.disabled}
                      className={cn(tab.urgent === true && 'text-danger')}
                    >
                      {tab.label}
                      {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                        <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                          {tab.badgeCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              title !== undefined && (
                <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
              )
            )}
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

      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

ListToolbar.displayName = 'ListToolbar';
