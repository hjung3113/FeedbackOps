/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ManagedSystemPill } from '../ManagedSystemPill.js';

describe('ManagedSystemPill', () => {
  it('renders the name', () => {
    render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders the color mark square when mark is provided', () => {
    const { container } = render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    // Verify the mark square exists via the data-mark attribute (jsdom normalises
    // hex values in style.backgroundColor to rgb, so we assert via the attribute).
    const mark = container.querySelector('[data-mark="#5e6ad2"]');
    expect(mark).not.toBeNull();
  });

  it('does not render a mark square when mark is omitted', () => {
    const { container } = render(<ManagedSystemPill name="Unknown MS" />);
    expect(container.querySelector('[data-mark]')).toBeNull();
  });

  it('sets data-archived="true" and muted style when archived=true', () => {
    const { container } = render(<ManagedSystemPill name="Old System" mark="#aaa" archived={true} />);
    const pill = container.querySelector('[data-archived="true"]');
    expect(pill).not.toBeNull();
    expect((pill as HTMLElement).style.opacity).toBe('0.6');
  });

  it('sets data-archived="false" when archived=false', () => {
    const { container } = render(<ManagedSystemPill name="Active" mark="#5e6ad2" archived={false} />);
    expect(container.querySelector('[data-archived="false"]')).not.toBeNull();
  });

  it('renders muted when no mark is provided (unknown ms pattern)', () => {
    const { container } = render(<ManagedSystemPill name="Unknown MS" />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.style.opacity).toBe('0.6');
  });
});
