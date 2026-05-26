import { fireEvent, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppSidebar } from '../AppSidebar';

const entries = [
  { id: 'inbox', label: 'Inbox', href: '/inbox', icon: <Inbox className="h-4 w-4" /> },
  { id: 'my', label: 'My', href: '/my', active: true },
];

beforeEach(() => {
  localStorage.removeItem('appSidebarCollapsed');
});

describe('AppSidebar', () => {
  it('renders nav entries with correct aria-current on active', () => {
    render(<AppSidebar entries={entries} />);
    expect(screen.getByTestId('sidebar-nav-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-nav-my').getAttribute('aria-current')).toBe('page');
  });

  it('collapse toggle persists to localStorage', () => {
    render(<AppSidebar entries={entries} />);
    expect(screen.getByTestId('app-sidebar').getAttribute('data-collapsed')).toBe('false');
    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));
    expect(screen.getByTestId('app-sidebar').getAttribute('data-collapsed')).toBe('true');
    expect(localStorage.getItem('appSidebarCollapsed')).toBe('1');
  });

  it('reads initial collapsed state from localStorage (SSR-safe)', () => {
    localStorage.setItem('appSidebarCollapsed', '1');
    render(<AppSidebar entries={entries} />);
    expect(screen.getByTestId('app-sidebar').getAttribute('data-collapsed')).toBe('true');
  });

  it('renders icon when icon prop is provided (expanded)', () => {
    render(<AppSidebar entries={entries} />);
    // The svg inside the Inbox icon should be in the document
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    expect(navLink.querySelector('svg')).not.toBeNull();
  });

  it('icon remains visible when sidebar is collapsed', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);
    expect(screen.getByTestId('app-sidebar').getAttribute('data-collapsed')).toBe('true');
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    // Icon (svg) is still rendered in collapsed state
    expect(navLink.querySelector('svg')).not.toBeNull();
  });

  it('collapsed icon nav link has accessible title and aria-label', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    expect(navLink.getAttribute('title')).toBe('Inbox');
    expect(navLink.getAttribute('aria-label')).toBe('Inbox');
  });

  it('collapsed icon nav link has correct href and is clickable', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    expect(navLink.getAttribute('href')).toBe('/inbox');
    // Link is an <a> element and is present in the DOM — navigation works
    expect(navLink.tagName).toBe('A');
  });

  it('hides label text in collapsed state', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);
    // Label text element is not rendered when collapsed
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    const labelSpan = Array.from(navLink.querySelectorAll('span')).find(
      (el) => el.textContent === 'Inbox',
    );
    expect(labelSpan).toBeUndefined();
  });

  it('shows label text in expanded state', () => {
    render(<AppSidebar entries={entries} />);
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    const labelSpan = Array.from(navLink.querySelectorAll('span')).find(
      (el) => el.textContent === 'Inbox',
    );
    expect(labelSpan).toBeDefined();
  });

  it('expanded state does not set title/aria-label (label is visible)', () => {
    render(<AppSidebar entries={entries} />);
    const navLink = screen.getByTestId('sidebar-nav-inbox');
    expect(navLink.getAttribute('title')).toBeNull();
    expect(navLink.getAttribute('aria-label')).toBeNull();
  });
});
