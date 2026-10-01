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
      if (target.classList.contains('sticky')) {
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

function ScrollBody({ scrollRef }: { scrollRef: { current: HTMLElement | null } }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scrollRef.current = bodyRef.current;
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
  vi.unstubAllGlobals();
});

describe('DetailPanelSectionNav', () => {
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
    // Active section has accent border class
    expect(overviewBtn.className).toMatch(/border-accent-primary/);
  });

  it('sets active section on click', () => {
    // Create a scroll ref pointing at a div with data-anchor elements
    const scrollEl = document.createElement('div');
    scrollEl.style.overflow = 'auto';
    // jsdom does not implement scrollTo — stub it to prevent errors
    scrollEl.scrollTo = vi.fn();
    SECTIONS.forEach((s) => {
      const el = document.createElement('div');
      el.setAttribute('data-anchor', s.id);
      scrollEl.appendChild(el);
    });
    document.body.appendChild(scrollEl);

    const scrollRef = { current: scrollEl } as React.RefObject<HTMLElement>;
    render(<DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />);

    const bodyBtn = screen.getByRole('button', { name: /^body$/i });
    fireEvent.click(bodyBtn);

    // After clicking, body button should become active immediately
    expect(bodyBtn.className).toMatch(/border-accent-primary/);

    document.body.removeChild(scrollEl);
  });

  it('keeps a section heading below the sticky navigation after a jump', () => {
    const scrollEl = document.createElement('div');
    scrollEl.scrollTop = 10;
    scrollEl.getBoundingClientRect = vi.fn(() => rect(0, 120, 30));
    scrollEl.scrollTo = vi.fn();
    const overview = document.createElement('div');
    overview.setAttribute('data-anchor', 'overview');
    overview.getBoundingClientRect = vi.fn(() => rect(0, 120, 130));
    scrollEl.append(overview);
    document.body.append(scrollEl);

    const { container } = render(
      <DetailPanelSectionNav
        sections={[{ id: 'overview', label: 'Overview' }]}
        scrollRef={{ current: scrollEl }}
      />,
    );
    const stickyNav = container.firstElementChild as HTMLDivElement;
    stickyNav.getBoundingClientRect = vi.fn(() => rect(0, 120));

    act(() => window.dispatchEvent(new Event('resize')));
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(overview.style.scrollMarginTop).toBe('24px');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 86, behavior: 'smooth' });
    scrollEl.remove();
  });

  it('sets anchor scroll margins after the scroll body ref attaches and updates them after header resize', () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Details' }));

    expect(scrollEl.scrollTo).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /더보기/ }).className).toMatch(
      /border-accent-primary/,
    );
    document.body.removeChild(scrollEl);
  });

  it('does not render the overflow trigger when no section is overflowed', () => {
    render(<DetailPanelSectionNav sections={SECTIONS} />);
    expect(screen.queryByRole('button', { name: /더보기/ })).toBeNull();
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
    scrollEl.getBoundingClientRect = vi.fn(() => rect(0, 100, 100));
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

    expect(screen.getByRole('button', { name: 'Properties' })).toHaveClass('border-accent-primary');
    expect(track.scrollBy).toHaveBeenLastCalledWith({ left: 100, behavior: 'smooth' });

    scrollBy.mockClear();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 100, behavior: 'smooth' });
    scrollEl.remove();
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
});
