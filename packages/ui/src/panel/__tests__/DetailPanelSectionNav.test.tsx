import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailPanelSectionNav } from '../DetailPanelSectionNav';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'body', label: 'Body' },
  { id: 'severity', label: 'Severity' },
  { id: 'summary', label: 'Summary', count: 3 },
];

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
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
    });

    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByRole('button', { name: 'Scroll tabs right' })).toBeVisible();
    const clippedTab = screen.getByRole('button', { name: 'Properties' });
    const scrollIntoView = vi.fn();
    clippedTab.scrollIntoView = scrollIntoView;
    fireEvent.click(clippedTab);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'nearest', inline: 'nearest' }),
    );
  });
});
