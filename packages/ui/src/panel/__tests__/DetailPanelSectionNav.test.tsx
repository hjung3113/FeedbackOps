import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
