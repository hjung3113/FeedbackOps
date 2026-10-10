import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailPanelSectionNav } from '../DetailPanelSectionNav';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'body', label: 'Body' },
  { id: 'severity', label: 'Severity' },
  { id: 'summary', label: 'Summary', count: 3 },
];

const rect = (left: number, right: number, top = 0, height = 24): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    right,
    top,
    bottom: top + height,
    width: right - left,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

function stubResizeObserver() {
  let headerHeight = 24;
  const notifyCallbacks: Array<() => void> = [];
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyCallbacks.push(() => callback([], this as unknown as ResizeObserver));
    }

    observe(target: Element) {
      if (target.getAttribute('data-testid') === 'detail-panel-section-nav-strip') {
        target.getBoundingClientRect = vi.fn(() => rect(0, 300, 0, headerHeight));
      }
    }

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  return {
    setHeaderHeight: (height: number) => {
      headerHeight = height;
    },
    notify: () => {
      for (const notify of notifyCallbacks) notify();
    },
  };
}

function stubIntersectionObserver() {
  const instances: Array<{ callback: IntersectionObserverCallback }> = [];
  class TestIntersectionObserver {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      instances.push(this);
    }
    observe(_target: Element) {}
    unobserve(_target: Element) {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  return {
    fire(entries: IntersectionObserverEntry[]) {
      const observer = instances.at(-1);
      if (!observer) throw new Error('no IntersectionObserver instance');
      act(() => {
        observer.callback(entries, observer as unknown as IntersectionObserver);
      });
    },
    // Same turn as a scroll handler. `fire` would open its own `act`.
    deliver(entries: IntersectionObserverEntry[]) {
      const observer = instances.at(-1);
      if (!observer) throw new Error('no IntersectionObserver instance');
      observer.callback(entries, observer as unknown as IntersectionObserver);
    },
  };
}

const entry = (anchor: Element, isIntersecting: boolean, top: number): IntersectionObserverEntry =>
  ({
    isIntersecting,
    boundingClientRect: rect(0, 100, top),
    target: anchor,
  }) as IntersectionObserverEntry;

const mountedScrollContainers: HTMLElement[] = [];

interface NavAnchorLayout {
  rootTop?: number;
  rootHeight?: number;
  scrollTop?: number;
  anchorHeight?: number;
  /** Mount the nav inside the scroll root so `root.contains(header)` is true. */
  headerInside?: boolean;
}

function setScrollRange(scrollEl: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: clientHeight });
}

function renderNavOverAnchors(
  ids: string[],
  liveTops?: Record<string, number>,
  layout?: NavAnchorLayout,
) {
  const scrollEl = document.createElement('div');
  // jsdom does not implement scrollTo — stub it so a click-driven jump works.
  scrollEl.scrollTo = vi.fn();
  if (layout?.scrollTop !== undefined) scrollEl.scrollTop = layout.scrollTop;
  if (layout?.rootTop !== undefined || layout?.rootHeight !== undefined) {
    const top = layout.rootTop ?? 0;
    const height = layout.rootHeight ?? 0;
    scrollEl.getBoundingClientRect = vi.fn(() => rect(0, 400, top, height));
  }
  for (const id of ids) {
    const anchor = document.createElement('div');
    anchor.setAttribute('data-anchor', id);
    if (liveTops || layout?.anchorHeight !== undefined) {
      const height = layout?.anchorHeight ?? 24;
      anchor.getBoundingClientRect = vi.fn(() => rect(0, 100, liveTops?.[id] ?? 0, height));
    }
    scrollEl.append(anchor);
  }
  // A React root replaces its container's children, so the nav mounts in a child
  // when it must sit inside the scroll root without wiping the anchors.
  const mountPoint = layout?.headerInside ? document.createElement('div') : null;
  if (mountPoint) scrollEl.append(mountPoint);
  document.body.append(scrollEl);
  mountedScrollContainers.push(scrollEl);
  const scrollRef = { current: scrollEl } as React.RefObject<HTMLElement>;
  const rendered = render(
    <DetailPanelSectionNav
      sections={ids.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
      scrollRef={scrollRef}
    />,
    mountPoint ? { container: mountPoint } : undefined,
  );
  const header = rendered.container.querySelector('[data-testid="detail-panel-section-nav-strip"]');
  if (!header) throw new Error('section nav header not rendered');
  return {
    anchor: (id: string) => scrollEl.querySelector(`[data-anchor="${id}"]`) as HTMLElement,
    scrollEl,
    header: header as HTMLElement,
  };
}

function ScrollBody({ scrollRef }: { scrollRef: { current: HTMLElement | null } }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    scrollRef.current = body;
    if (body) {
      // Strip top and root top are both 0, so the cover is the full overlap.
      body.getBoundingClientRect = () => rect(0, 400, 0, 400);
    }
    return () => {
      scrollRef.current = null;
    };
  }, [scrollRef]);

  return (
    <div ref={bodyRef} data-testid="section-scroll-body">
      <div data-anchor="overview" data-testid="section-anchor" />
    </div>
  );
}

afterEach(() => {
  for (const el of mountedScrollContainers) el.remove();
  mountedScrollContainers.length = 0;
  vi.unstubAllGlobals();
});

describe('DetailPanelSectionNav', () => {
  it.each(['reveal', 'left', 'right'] as const)(
    'uses instant scrolling for the %s path under reduced motion',
    (path) => {
      vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
      render(<DetailPanelSectionNav sections={SECTIONS} />);
      const track = screen.getByTestId('detail-panel-section-nav-track');
      Object.defineProperties(track, {
        clientWidth: { configurable: true, value: 100 },
        scrollWidth: { configurable: true, value: 400 },
        scrollLeft: { configurable: true, writable: true, value: 100 },
      });
      track.getBoundingClientRect = vi.fn(() => rect(0, 100));
      track.scrollBy = vi.fn();
      act(() => window.dispatchEvent(new Event('resize')));
      vi.mocked(track.scrollBy).mockClear();

      if (path === 'reveal') {
        const tab = screen.getByRole('button', { name: 'Body' });
        tab.getBoundingClientRect = vi.fn(() => rect(200, 260));
        fireEvent.click(tab);
        expect(track.scrollBy).toHaveBeenCalledWith({ left: 160, behavior: 'auto' });
      } else {
        fireEvent.click(screen.getByRole('button', {
          name: path === 'left' ? '이전 탭 보기' : '다음 탭 보기',
        }));
        expect(track.scrollBy).toHaveBeenCalledWith({
          left: path === 'left' ? -120 : 120,
          behavior: 'auto',
        });
      }
    },
  );


  it('renders section buttons', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /body/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /severity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /summary/i })).toBeInTheDocument();
  });

  it('shows count badge when provided', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('first section is active by default', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    const overviewBtn = screen.getByRole('button', { name: /overview/i });
    expect(overviewBtn).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /^body$/i })).not.toHaveAttribute('aria-current');
  });

  it('sets active section on click', () => {
    // Create a scroll ref pointing at a div with data-anchor elements
    const scrollEl = document.createElement('div');
    scrollEl.style.overflow = 'auto';
    // jsdom does not implement scrollTo — stub it to prevent errors
    scrollEl.scrollTo = vi.fn();
    for (const s of SECTIONS) {
      const el = document.createElement('div');
      el.setAttribute('data-anchor', s.id);
      scrollEl.appendChild(el);
    }
    document.body.appendChild(scrollEl);

    const scrollRef = { current: scrollEl } as React.RefObject<HTMLElement>;
    render(<DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />);

    const bodyBtn = screen.getByRole('button', { name: /^body$/i });
    fireEvent.click(bodyBtn);

    // After clicking, body button should become active immediately
    expect(bodyBtn).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /overview/i })).not.toHaveAttribute('aria-current');

    document.body.removeChild(scrollEl);
  });

  it('sets the overlap scroll margin after the scroll body ref attaches and updates it after header resize', () => {
    const observer = stubResizeObserver();
    function DetailPanel() {
      const scrollRef = useRef<HTMLElement | null>(null);
      return (
        <>
          <DetailPanelSectionNav
            sections={[{ id: 'overview', label: 'Overview' }]}
            scrollRef={scrollRef}
          />
          <ScrollBody scrollRef={scrollRef} />
        </>
      );
    }

    render(<DetailPanel />);
    const anchor = screen.getByTestId('section-anchor');
    expect(anchor).toHaveStyle({ scrollMarginTop: '24px' });

    observer.setHeaderHeight(40);
    act(() => observer.notify());

    expect(anchor).toHaveStyle({ scrollMarginTop: '40px' });
  });

  it('returns null when sections is empty', () => {
    const { container } = render(<DetailPanelSectionNav sections={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('ignores scroll when sections is empty (no crash)', () => {
    expect(() => {
      render(<DetailPanelSectionNav sections={[]} />);
    }).not.toThrow();
  });

  it('accepts className override', () => {
    const { container } = render(
      <DetailPanelSectionNav sections={SECTIONS} className="my-custom-class" />,
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('places overflow sections in the menu and scrolls to the selected section', () => {
    const scrollEl = document.createElement('div');
    scrollEl.scrollTo = vi.fn();
    const overview = document.createElement('div');
    overview.setAttribute('data-anchor', 'overview');
    const details = document.createElement('div');
    details.setAttribute('data-anchor', 'details');
    scrollEl.append(overview, details);
    document.body.appendChild(scrollEl);

    const scrollRef = { current: scrollEl } as React.RefObject<HTMLElement>;
    render(
      <DetailPanelSectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'details', label: 'Details', overflow: true },
        ]}
        scrollRef={scrollRef}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    // Radix's DropdownMenuTrigger opens on `pointerdown`, which jsdom cannot
    // synthesise convincingly — fireEvent.click leaves aria-expanded="false".
    // Driving it by keyboard matches this repo's established pattern (see
    // apps/frontend/src/lib/layout/__tests__/AppRail.test.tsx openAccountMenu).
    fireEvent.keyDown(screen.getByRole('button', { name: /더보기/ }), { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: 'Details' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Details' }));

    expect(scrollEl.scrollTo).toHaveBeenCalledOnce();
    // The active section is announced by the trigger; its visible label stays fixed.
    const more = screen.getByRole('button', { name: '더보기, 현재 Details' });
    expect(more).toHaveTextContent(/^더보기$/);
    expect(more).not.toHaveAttribute('aria-current');
    expect(more).toHaveClass('border-accent-primary', 'text-text-primary');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    fireEvent.keyDown(more, { key: 'Enter' });
    const currentItem = screen.getByRole('menuitem', { name: 'Details' });
    expect(currentItem).toHaveAttribute('aria-current', 'true');
    expect(currentItem).toHaveClass('font-medium', 'text-text-primary');
    document.body.removeChild(scrollEl);
  });

  it('does not render the overflow trigger when no section is overflowed', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    expect(screen.queryByRole('button', { name: /더보기/ })).toBeNull();
  });

  it('names the overflow trigger for the active overflow section, and 더보기 when none is active', () => {
    const scrollEl = document.createElement('div');
    scrollEl.scrollTo = vi.fn();
    const overview = document.createElement('div');
    overview.setAttribute('data-anchor', 'overview');
    const body = document.createElement('div');
    body.setAttribute('data-anchor', 'body');
    scrollEl.append(overview, body);
    document.body.appendChild(scrollEl);

    const scrollRef = { current: scrollEl } as React.RefObject<HTMLElement>;
    render(
      <DetailPanelSectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'body', label: '본문', overflow: true },
        ]}
        scrollRef={scrollRef}
      />,
    );

    const idle = screen.getByRole('button', { name: '더보기' });
    expect(idle).toHaveTextContent(/^더보기$/);
    expect(idle).toHaveAccessibleName('더보기');

    fireEvent.keyDown(idle, { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: '본문' }));

    const active = screen.getByRole('button', { name: '더보기, 현재 본문' });
    expect(active).toHaveTextContent(/^더보기$/);
    expect(active).toHaveAccessibleName('더보기, 현재 본문');
    expect(active).toHaveClass('border-accent-primary', 'text-text-primary');
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument();
    document.body.removeChild(scrollEl);
  });

  it('exposes the strip as a navigation landmark named 섹션 이동', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    const landmark = screen.getByRole('navigation', { name: '섹션 이동' });
    expect(landmark).toBe(screen.getByTestId('detail-panel-section-nav-strip'));
  });

  it('shows an overflow affordance and scrolls a clipped tab into view', () => {
    render(
      <DetailPanelSectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'decision', label: 'Decision' },
          { id: 'source', label: 'Source' },
          { id: 'properties', label: 'Properties' },
        ]}
      />,
    );
    const track = screen.getByTestId('detail-panel-section-nav-track');
    track.scrollBy = vi.fn();
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
    });
    track.getBoundingClientRect = vi.fn(() => rect(0, 100));

    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByRole('button', { name: '다음 탭 보기' })).toBeVisible();
    const clippedTab = screen.getByRole('button', { name: 'Properties' });
    clippedTab.getBoundingClientRect = vi.fn(() => rect(200, 260));
    fireEvent.click(clippedTab);

    expect(track.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 160, behavior: 'smooth' }),
    );
  });

  it('keeps a body-activated section visible and reveals it again when the track resizes', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const scrollEl = document.createElement('div');
    const anchorTop = new Map([
      ['overview', 100],
      ['decision', 200],
      ['source', 300],
      ['properties', 400],
    ]);
    const anchors = new Map<string, HTMLDivElement>();
    for (const section of [
      { id: 'overview', label: 'Overview' },
      { id: 'decision', label: 'Decision' },
      { id: 'source', label: 'Source' },
      { id: 'properties', label: 'Properties' },
    ]) {
      const anchor = document.createElement('div');
      anchor.setAttribute('data-anchor', section.id);
      anchor.getBoundingClientRect = vi.fn(() => rect(0, 100, anchorTop.get(section.id) ?? 0));
      anchors.set(section.id, anchor);
      scrollEl.append(anchor);
    }
    // Height 100: the default rect height is 24, and 0.66 * this root's width (100)
    // would floor the band at the root top and drop Properties at y=100.
    scrollEl.getBoundingClientRect = vi.fn(() => rect(0, 100, 100, 100));
    document.body.append(scrollEl);

    render(
      <DetailPanelSectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'decision', label: 'Decision' },
          { id: 'source', label: 'Source' },
          { id: 'properties', label: 'Properties' },
        ]}
        scrollRef={{ current: scrollEl }}
      />,
    );

    const track = screen.getByTestId('detail-panel-section-nav-track');
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
    });
    track.getBoundingClientRect = vi.fn(() => rect(0, 100));
    const tabPositions = new Map([
      ['overview', rect(0, 50)],
      ['decision', rect(50, 100)],
      ['source', rect(100, 150)],
      ['properties', rect(150, 200)],
    ]);
    for (const [id, position] of tabPositions) {
      screen.getByRole('button', {
        name: id === 'properties' ? 'Properties' : id.charAt(0).toUpperCase() + id.slice(1),
      }).getBoundingClientRect = vi.fn(() => position);
    }

    act(() => window.dispatchEvent(new Event('resize')));
    anchorTop.set('overview', -200);
    anchorTop.set('decision', -100);
    anchorTop.set('source', 0);
    anchorTop.set('properties', 100);
    act(() => fireEvent.scroll(scrollEl));

    expect(screen.getByRole('button', { name: 'Properties' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(track.scrollBy).toHaveBeenLastCalledWith({ left: 100, behavior: 'smooth' });

    scrollBy.mockClear();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 100, behavior: 'smooth' });
    scrollEl.remove();
  });

  it('activates the topmost section reported intersecting by the first callback', () => {
    const observer = stubIntersectionObserver();
    const { anchor } = renderNavOverAnchors(['alpha', 'beta']);
    anchor('alpha').getBoundingClientRect = vi.fn(() => rect(0, 100, 400));
    anchor('beta').getBoundingClientRect = vi.fn(() => rect(0, 100, 100));

    observer.fire([entry(anchor('alpha'), true, 400), entry(anchor('beta'), true, 100)]);

    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the topmost visible section active when a lower section newly intersects (#861 reflow)', () => {
    const observer = stubIntersectionObserver();
    const { anchor } = renderNavOverAnchors(['alpha', 'beta']);
    let betaTop = 400;
    anchor('alpha').getBoundingClientRect = vi.fn(() => rect(0, 100, 100));
    anchor('beta').getBoundingClientRect = vi.fn(() => rect(0, 100, betaTop));

    observer.fire([entry(anchor('beta'), true, 400), entry(anchor('alpha'), true, 100)]);
    // Real observer delivery: a target emits only when its intersecting state changes, so beta
    // must exit the top zone before it re-enters after the reflow.
    observer.fire([entry(anchor('beta'), false, 50)]);
    betaTop = 150;
    observer.fire([entry(anchor('beta'), true, 150)]);

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('activates the remaining intersecting section when the active one leaves the top zone', () => {
    const observer = stubIntersectionObserver();
    const { anchor } = renderNavOverAnchors(['alpha', 'beta']);

    observer.fire([entry(anchor('beta'), true, 400), entry(anchor('alpha'), true, 100)]);
    observer.fire([entry(anchor('alpha'), false, -100)]);

    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
  });

  it('ranks a still-intersecting anchor by its current position, not its last callback rectangle', () => {
    // Report trace 2: after a manual scroll only beta emits — alpha stays intersecting with no
    // new entry, so alpha's callback top (300) is stale while its live top is -200. Alpha is the
    // upper intersecting section and must win over newly intersecting beta at 200.
    const observer = stubIntersectionObserver();
    const { anchor } = renderNavOverAnchors(['alpha', 'beta']);
    anchor('alpha').getBoundingClientRect = vi.fn(() => rect(0, 100, -200));
    anchor('beta').getBoundingClientRect = vi.fn(() => rect(0, 100, 200));

    observer.fire([entry(anchor('alpha'), true, 300), entry(anchor('beta'), false, 700)]);
    observer.fire([entry(anchor('beta'), true, 200)]);

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('applies entries during a programmatic jump so a section that left cannot win afterwards', () => {
    // Entries arriving inside the jump guard must still update the map. If they are dropped,
    // long-left alpha keeps its stale intersecting flag and beats beta once the guard ends
    // and gamma enters. Beta sits below the root top so the click is not already landed.
    const observer = stubIntersectionObserver();
    const { anchor, scrollEl } = renderNavOverAnchors(['alpha', 'beta', 'gamma'], {
      alpha: -300,
      beta: 180,
      gamma: 200,
    });
    // Target 180 must stay reachable. An unset jsdom range clamps at 0 and the click is already there.
    setScrollRange(scrollEl, 2000, 200);

    observer.fire([
      entry(anchor('alpha'), true, 100),
      entry(anchor('beta'), false, 500),
      entry(anchor('gamma'), false, 800),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    // During the guard alpha exits and beta arrives; neither may be discarded.
    observer.fire([entry(anchor('alpha'), false, -300), entry(anchor('beta'), true, 180)]);
    act(() => {
      fireEvent(scrollEl, new Event('scrollend'));
    });
    observer.fire([entry(anchor('gamma'), true, 200)]);
    // Rank only once the scroll leaves the release position. A dropped in-jump exit would
    // leave alpha intersecting and let it win here.
    scrollEl.scrollTop = 40;
    act(() => {
      fireEvent.scroll(scrollEl);
    });

    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Gamma' })).not.toHaveAttribute('aria-current');
  });

  it('labels both scroll controls in Korean and scrolls the track in both directions', async () => {
    const user = userEvent.setup();
    render(
      <DetailPanelSectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'decision', label: 'Decision' },
          { id: 'source', label: 'Source' },
          { id: 'properties', label: 'Properties' },
        ]}
      />,
    );

    const track = screen.getByTestId('detail-panel-section-nav-track');
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    track.scrollBy = vi.fn((options: ScrollToOptions) => {
      track.scrollLeft += options.left ?? 0;
      track.dispatchEvent(new Event('scroll'));
    }) as unknown as typeof track.scrollBy;
    act(() => window.dispatchEvent(new Event('resize')));

    const right = screen.getByRole('button', { name: '다음 탭 보기' });
    expect(right.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.hover(right);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('다음 탭 보기');
    await user.click(right);
    expect(track.scrollBy).toHaveBeenLastCalledWith({ left: 120, behavior: 'smooth' });

    const left = screen.getByRole('button', { name: '이전 탭 보기' });
    expect(left.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.hover(left);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('이전 탭 보기');
    await user.click(left);
    expect(track.scrollBy).toHaveBeenLastCalledWith({ left: -120, behavior: 'smooth' });
  });

  // Hand-computed from the boxes, not from the offset helper:
  // clear:    20 + 180 - 80 - 0 = 120 (33px header sits above the root)
  // overlap:  10 + 140 - 40 - 13 = 97 (header bottom 53, root top 40)
  // inside:   40 + 200 - 0 - 33 = 207 (the height, not the 45px overlap)
  it.each([
    {
      placement: 'outside the scroll root and clear of it',
      headerInside: false,
      headerTop: 0,
      headerHeight: 33,
      rootTop: 80,
      rootHeight: 400,
      scrollTop: 20,
      anchorTop: 180,
      expectedTop: 120,
      expectedMargin: '0px',
    },
    {
      placement: 'outside the scroll root and overlapping it',
      headerInside: false,
      headerTop: 20,
      headerHeight: 33,
      rootTop: 40,
      rootHeight: 400,
      scrollTop: 10,
      anchorTop: 140,
      expectedTop: 97,
      expectedMargin: '13px',
    },
    {
      placement: 'inside the scroll root',
      headerInside: true,
      headerTop: 12,
      headerHeight: 33,
      rootTop: 0,
      rootHeight: 500,
      scrollTop: 40,
      anchorTop: 200,
      expectedTop: 207,
      expectedMargin: '33px',
    },
  ])('scrolls a tab to the anchor minus the sticky cover when the header is $placement', (row) => {
    const { anchor, scrollEl, header } = renderNavOverAnchors(
      ['overview', 'body'],
      { overview: 0, body: row.anchorTop },
      {
        rootTop: row.rootTop,
        rootHeight: row.rootHeight,
        scrollTop: row.scrollTop,
        headerInside: row.headerInside,
      },
    );
    header.getBoundingClientRect = vi.fn(() => rect(0, 300, row.headerTop, row.headerHeight));
    act(() => window.dispatchEvent(new Event('resize')));
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));

    expect(scrollEl.scrollTo).toHaveBeenCalledOnce();
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: row.expectedTop, behavior: 'smooth' });
    expect(anchor('body').style.scrollMarginTop).toBe(row.expectedMargin);
  });

  it('recomputes the topmost intersecting anchor on the first scroll after a jump', () => {
    const observer = stubIntersectionObserver();
    const { anchor, scrollEl } = renderNavOverAnchors(['alpha', 'beta'], {
      alpha: 12,
      beta: 180,
    });
    // Target 180 must stay reachable. An unset jsdom range clamps at 0 and the click is already there.
    setScrollRange(scrollEl, 2000, 200);

    observer.fire([entry(anchor('alpha'), true, 12), entry(anchor('beta'), false, 400)]);
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    // The short landing leaves alpha intersecting. The guard must keep beta selected.
    observer.fire([entry(anchor('beta'), true, 180)]);
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    act(() => {
      fireEvent(scrollEl, new Event('scrollend'));
    });
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    // Staying at the release position is still the jump's own event. Leaving it re-ranks.
    scrollEl.scrollTop = 40;
    act(() => fireEvent.scroll(scrollEl));
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the clicked section through the landing pulse and the observer delivery in that frame', () => {
    // Max is 260, target is 900. 259 is within 1px and releases. The finishing pulse to 260
    // and that frame's observer entry must not replace Beta; the next scroll that leaves does.
    const observer = stubIntersectionObserver();
    const { anchor, scrollEl } = renderNavOverAnchors(
      ['alpha', 'beta'],
      { alpha: 12, beta: 900 },
      { rootTop: 0, rootHeight: 200, scrollTop: 0 },
    );
    setScrollRange(scrollEl, 460, 200);

    observer.fire([entry(anchor('alpha'), true, 12), entry(anchor('beta'), false, 900)]);
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));

    scrollEl.scrollTop = 259;
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    scrollEl.scrollTop = 260;
    act(() => {
      fireEvent.scroll(scrollEl);
      observer.deliver([entry(anchor('alpha'), true, 12), entry(anchor('beta'), true, 900)]);
    });
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-current');

    scrollEl.scrollTop = 200;
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('does not re-rank when an instant jump reports its scroll event after the release', () => {
    // The browser applies scrollTo before the scroll event. That event, about 950ms later and
    // still on the landing position, must not replace the clicked section.
    vi.useFakeTimers();
    try {
      const observer = stubIntersectionObserver();
      const { anchor, scrollEl } = renderNavOverAnchors(
        ['alpha', 'beta'],
        { alpha: 12, beta: 400 },
        { rootTop: 0, rootHeight: 200, scrollTop: 0 },
      );
      setScrollRange(scrollEl, 2000, 200);
      scrollEl.scrollTo = vi.fn((options?: ScrollToOptions) => {
        const top = options?.top;
        if (typeof top !== 'number') return;
        const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
        scrollEl.scrollTop = Math.min(Math.max(0, top), max);
      }) as typeof scrollEl.scrollTo;

      observer.fire([entry(anchor('alpha'), true, 12), entry(anchor('beta'), false, 400)]);
      fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
      expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

      act(() => {
        vi.advanceTimersByTime(950);
      });
      act(() => {
        fireEvent.scroll(scrollEl);
      });
      observer.fire([entry(anchor('alpha'), true, 12), entry(anchor('beta'), true, 400)]);
      expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-current');

      scrollEl.scrollTop = 340;
      act(() => {
        fireEvent.scroll(scrollEl);
      });
      expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases an already-clamped jump without an observer and re-ranks only after leaving it', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { scrollEl } = renderNavOverAnchors(
      ['alpha', 'beta'],
      { alpha: 20, beta: 400 },
      { rootTop: 0, rootHeight: 800, scrollTop: 260, anchorHeight: 24 },
    );
    setScrollRange(scrollEl, 460, 200);

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');

    scrollEl.scrollTop = 200;
    act(() => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it.each([
    {
      // Root is 400 wide by 1000 tall. A percentage rootMargin uses the width, so the
      // band ends at 1000 - 0.66 * 400 = 736, not at 34% of the height (340). alpha
      // (top -40, height 80) and beta (top 30, height 80) both overlap that band.
      // abs(top - rootTop) picks beta (30 < 40); the topmost in-band anchor is alpha.
      tops: { alpha: -40, beta: 30 },
      layout: { rootTop: 0, rootHeight: 1000, anchorHeight: 80 },
      expected: 'Alpha',
    },
    {
      // 400 × 1000. Height × 34% ends at 340; rootBottom - 0.66 × width ends at 736.
      // Alpha at 400 is between those bottoms. Beta at 760 is below both. Beta is
      // listed first, so a missed ranking would leave it current.
      tops: { beta: 760, alpha: 400 },
      layout: { rootTop: 0, rootHeight: 1000 },
      expected: 'Alpha',
    },
  ])('ranks the no-observer fallback by the width-based top band', ({ tops, layout, expected }) => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const ids = Object.keys(tops);
    renderNavOverAnchors(ids, tops, layout);
    expect(screen.getByRole('button', { name: expected })).toHaveAttribute('aria-current', 'true');
    for (const id of ids) {
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      if (name === expected) continue;
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-current');
    }
  });
});
