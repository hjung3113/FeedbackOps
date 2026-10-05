/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { ManagedSystemPill } from '../ManagedSystemPill.js';
import { managedSystemMarkColor, managedSystemMarkToken } from '../managed-system-mark.js';

describe('ManagedSystemPill', () => {
  it('renders the name', () => {
    render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders the identity color when mark is provided', () => {
    const { container } = render(<ManagedSystemPill name="Tableau" mark="#5e6ad2" />);
    // The caller-provided identity color stays in data-mark and a CSS custom property.
    const mark = container.querySelector<HTMLElement>('[data-mark="#5e6ad2"]');
    expect(mark).not.toBeNull();
    expect(mark?.parentElement?.style.getPropertyValue('--managed-system-pill-mark-color')).toBe(
      '#5e6ad2',
    );
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
    expect(mark).toHaveClass('size-1.5', 'rounded-pill');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
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
    expect(mark).toHaveClass('rounded-pill');
    expect(pill).toHaveClass('opacity-60');
  });

  it('sets data-archived="false" when archived=false', () => {
    const { container } = render(
      <ManagedSystemPill name="Active" mark="#5e6ad2" archived={false} />,
    );
    expect(container.querySelector('[data-archived="false"]')).not.toBeNull();
  });

  it('renders muted when no mark is provided (unknown ms pattern)', () => {
    const { container } = render(<ManagedSystemPill name="Unknown MS" />);
    expect(container.querySelector('[data-archived="false"]')).toHaveClass(
      'border-border-subtle',
      'text-text-muted',
      'opacity-60',
    );
    expect(container.querySelector('[data-mark]')).toBeNull();
  });
});
