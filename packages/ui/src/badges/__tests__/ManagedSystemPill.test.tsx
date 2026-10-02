/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { ManagedSystemPill } from '../ManagedSystemPill.js';
import { managedSystemMarkColor, managedSystemMarkToken } from '../managed-system-mark.js';

describe('ManagedSystemPill', () => {
  it('renders the name', () => {
    render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders a 6px round dot with the identity color when mark is provided', () => {
    const { container } = render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    // Verify the mark via the data-mark attribute and inline style (jsdom normalises
    // hex values in style.backgroundColor to rgb, so the color is asserted via the attribute).
    const mark = container.querySelector<HTMLElement>('[data-mark="#5e6ad2"]');
    expect(mark).not.toBeNull();
    expect(mark?.style.width).toBe('6px');
    expect(mark?.style.height).toBe('6px');
    expect(mark?.style.borderRadius).toBe('9999px');
  });

  it.each([
    ['tableau', '--managed-system-tableau'],
    ['power-bi', '--managed-system-power-bi'],
    ['looker', '--managed-system-looker'],
    ['metabase', '--managed-system-metabase'],
  ])('maps the %s slug to its identity token', (slug, token) => {
    expect(managedSystemMarkToken(slug)).toBe(token);
  });

  it.each(['salesforce', undefined, 'constructor', 'toString', '__proto__'])(
    'uses a neutral token and CSS color for unknown slug %s',
    (slug) => {
      expect(managedSystemMarkToken(slug)).toBe('--managed-system-default');
      expect(managedSystemMarkColor(slug)).toBe('rgb(var(--managed-system-default) / 1)');
    },
  );

  it('renders the system name beside a mark using its slug token', () => {
    const { container } = render(
      <ManagedSystemPill name="Tableau" mark={managedSystemMarkColor('tableau')} />,
    );
    const mark = container.querySelector('[data-mark]');
    expect(screen.getByText('Tableau')).toBeInTheDocument();
    expect(mark).toHaveAttribute('data-mark', 'rgb(var(--managed-system-tableau) / 1)');
    expect(mark?.parentElement).toHaveTextContent('Tableau');
  });

  it('does not render a mark dot when mark is omitted', () => {
    const { container } = render(<ManagedSystemPill name="Unknown MS" />);
    expect(container.querySelector('[data-mark]')).toBeNull();
  });

  it('renders a dot and muted style when archived=true', () => {
    const { container } = render(
      <ManagedSystemPill name="Old System" mark="#aaa" archived={true} />,
    );
    const mark = container.querySelector<HTMLElement>('[data-mark]');
    const pill = container.querySelector<HTMLElement>('[data-archived="true"]');
    expect(mark).not.toBeNull();
    expect(pill).not.toBeNull();
    expect(mark?.parentElement).toBe(pill);
    expect(pill?.style.opacity).toBe('0.6');
  });

  it('sets data-archived="false" when archived=false', () => {
    const { container } = render(
      <ManagedSystemPill name="Active" mark="#5e6ad2" archived={false} />,
    );
    expect(container.querySelector('[data-archived="false"]')).not.toBeNull();
  });

  it('renders muted when no mark is provided (unknown ms pattern)', () => {
    const { container } = render(<ManagedSystemPill name="Unknown MS" />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.style.opacity).toBe('0.6');
  });
});
