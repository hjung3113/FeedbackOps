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
import { useHorizontalOverflow } from '../internal/useHorizontalOverflow.js';
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

/** Edge fade width (px) that masks a partially clipped tab on a scrollable side. */
const EDGE_FADE_PX = 16;

export function ListTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  align = 'start',
  className,
}: ListTabsProps): React.ReactElement {
  const tabViewportRef = React.useRef<HTMLDivElement>(null);
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = React.useState(tabs[0]?.value ?? '');
  const selectedTab = activeTab ?? uncontrolledActiveTab;
  const tabKey = tabs.map((tab) => tab.value).join('|');
  const overflowState = useHorizontalOverflow(tabViewportRef, { contentKey: tabKey });
  const hasOverflow = overflowState.canScrollLeft || overflowState.canScrollRight;
  // CSS mask-image fade on each scrollable side so a partially clipped tab does not
  // show as a stray fragment.
  const viewportStyle = React.useMemo(() => {
    const { canScrollLeft, canScrollRight } = overflowState;
    if (!canScrollLeft && !canScrollRight) return undefined;
    const fade = `${EDGE_FADE_PX}px`;
    const image = `linear-gradient(to right, ${
      canScrollLeft ? `transparent 0, black ${fade}` : 'black 0'
    }, ${canScrollRight ? `black calc(100% - ${fade}), transparent 100%` : 'black 100%'})`;
    return { maskImage: image, WebkitMaskImage: image };
  }, [overflowState]);
  const revealActiveTab = React.useCallback(() => {
    const viewport = tabViewportRef.current;
    const active = viewport?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!viewport || !active) return;

    const viewportRect = viewport.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    const canScrollLeft = viewport.scrollLeft > 1;
    const canScrollRight = maxScrollLeft - viewport.scrollLeft > 1;
    const visibleLeft = viewportRect.left + (canScrollLeft ? EDGE_FADE_PX : 0);
    const visibleRight = viewportRect.right - (canScrollRight ? EDGE_FADE_PX : 0);
    let left = 0;
    if (activeRect.left < visibleLeft) left = activeRect.left - visibleLeft;
    else if (activeRect.right > visibleRight) left = activeRect.right - visibleRight;

    if (left !== 0) {
      const destination = Math.max(0, Math.min(maxScrollLeft, viewport.scrollLeft + left));
      const scrollDelta = destination - viewport.scrollLeft;
      if (scrollDelta !== 0) viewport.scrollBy({ left: scrollDelta, behavior: 'smooth' });
    }
  }, []);

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
                    'mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
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
            className="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap scrollbar-none [&::-webkit-scrollbar]:hidden"
            data-list-toolbar-tabs
            data-fade-left={overflowState.canScrollLeft ? 'true' : 'false'}
            data-fade-right={overflowState.canScrollRight ? 'true' : 'false'}
            style={
              // oxlint-disable-next-line shadcn/no-inline-styles -- the scroll-fade mask tracks the live overflow edges
              viewportStyle
            }
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
                        'group inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-0 text-sm font-medium text-text-muted transition-colors',
                        'hover:bg-surface-card hover:text-text-primary',
                        'data-[state=active]:bg-surface-card-elevated data-[state=active]:text-text-primary data-[state=active]:shadow-none',
                        tab.urgent === true &&
                          'text-text-danger-label hover:text-text-danger-label data-[state=active]:text-text-danger-label [&>svg]:text-text-danger',
                      )}
                    >
                      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      {tab.label}
                      {tab.badgeCount !== undefined && (
                        <span className="text-tiny text-text-muted tabular-nums group-data-[state=active]:text-text-secondary">
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
                    'ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
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
