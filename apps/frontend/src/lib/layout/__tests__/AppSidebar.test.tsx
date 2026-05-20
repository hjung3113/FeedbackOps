import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSidebar } from '../AppSidebar';

const entries = [
  { id: 'inbox', label: 'Inbox', href: '/inbox' },
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
});
