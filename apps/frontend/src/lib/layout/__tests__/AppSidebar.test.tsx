import { fireEvent, render, screen } from '@testing-library/react';
import { Database, Inbox, Plus, Settings } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppSidebar } from '../AppSidebar';
import { NAV_TREE } from '@/routes/_authed';

const entries = [
  {
    id: 'inbox',
    label: 'Inbox',
    href: '/inbox',
    icon: <Inbox className="h-4 w-4" />,
    section: 'VOC',
  },
  { id: 'my', label: 'My', href: '/my', active: true, section: 'VIEWS' },
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

  it('renders section labels in grouping order when expanded', () => {
    render(
      <AppSidebar
        entries={[
          {
            id: 'inbox',
            label: 'Inbox',
            href: '/inbox',
            icon: <Inbox className="h-4 w-4" />,
            section: 'VOC',
          },
          {
            id: 'create',
            label: '+ New VOC',
            href: '/create',
            icon: <Plus className="h-4 w-4" />,
            section: 'VOC',
          },
          { id: 'triage', label: 'Triage', href: '/triage', section: 'VIEWS' },
          { id: 'my', label: 'My VOCs', href: '/my', section: 'VIEWS' },
          {
            id: 'admin-ms',
            label: 'Managed Systems',
            href: '/admin/managed-systems',
            icon: <Database className="h-4 w-4" />,
            section: 'MANAGED SYSTEMS',
          },
        ]}
      />,
    );

    const navItems = [
      screen.getByTestId('sidebar-section-voc'),
      screen.getByTestId('sidebar-nav-inbox'),
      screen.getByTestId('sidebar-nav-create'),
      screen.getByTestId('sidebar-section-views'),
      screen.getByTestId('sidebar-nav-triage'),
      screen.getByTestId('sidebar-nav-my'),
      screen.getByTestId('sidebar-section-managed-systems'),
      screen.getByTestId('sidebar-nav-admin-ms'),
    ];

    expect(navItems.map((node) => node.textContent)).toEqual([
      'VOC',
      'Inbox',
      '+ New VOC',
      'VIEWS',
      'Triage',
      'My VOCs',
      'MANAGED SYSTEMS',
      'Managed Systems',
    ]);
  });

  it('hides section labels when collapsed', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);

    expect(screen.queryByTestId('sidebar-section-voc')).not.toBeInTheDocument();
    expect(screen.queryByText('VOC')).not.toBeInTheDocument();
  });

  it('renders footer items and keeps collapsed icons accessible', () => {
    render(
      <AppSidebar
        entries={entries}
        defaultCollapsed={true}
        footerItems={[
          {
            id: 'workspace-settings',
            label: 'Workspace settings',
            href: '/admin/placeholder',
            icon: <Settings className="h-4 w-4" />,
          },
          {
            id: 'invite-member',
            label: 'Invite member',
            icon: <Plus className="h-4 w-4" />,
            disabled: true,
          },
        ]}
      />,
    );

    const settings = screen.getByTestId('sidebar-footer-workspace-settings');
    const invite = screen.getByTestId('sidebar-footer-invite-member');

    expect(settings).toHaveAttribute('href', '/admin/placeholder');
    expect(settings).toHaveAttribute('title', 'Workspace settings');
    expect(settings).toHaveAttribute('aria-label', 'Workspace settings');
    expect(settings.querySelector('svg')).not.toBeNull();
    expect(settings.textContent).toBe('');

    expect(invite).toHaveAttribute('type', 'button');
    expect(invite).toBeDisabled();
    expect(invite).toHaveAttribute('title', 'Invite member');
    expect(invite).toHaveAttribute('aria-label', 'Invite member');
    expect(invite.querySelector('svg')).not.toBeNull();
    expect(invite.textContent).toBe('');
  });

  it('distinguishes an absent count from an explicit zero count', () => {
    const countEntries = [
      { id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox', countKey: 'voc.inbox' as const },
      { id: 'triage', label: 'Triage', href: '/vocs?view=triage', countKey: 'voc.triage' as const },
    ];
    const { rerender } = render(<AppSidebar entries={countEntries} counts={{ 'voc.inbox': 0 }} />);

    expect(screen.getByTestId('sidebar-count-inbox')).toHaveTextContent('0');
    expect(screen.queryByTestId('sidebar-count-triage')).not.toBeInTheDocument();

    rerender(<AppSidebar entries={countEntries} counts={{ 'voc.inbox': 0, 'voc.triage': 0 }} />);
    expect(screen.getByTestId('sidebar-count-triage')).toHaveTextContent('0');
  });

  it('keeps an out-of-grant Managed System visible in the scope list', () => {
    render(
      <AppSidebar
        entries={entries}
        isAdmin={false}
        managedSystems={[
          { id: 'granted', name: 'Identity', granted: true },
          { id: 'outside', name: 'Finance', granted: false },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('scope-selector'));
    expect(screen.getByTestId('scope-option-outside')).toBeVisible();
    expect(screen.getByLabelText('Outside your grants')).toBeVisible();
  });

  it('labels non-admin all scope as the union of granted Managed Systems only', () => {
    const { rerender } = render(
      <AppSidebar
        entries={entries}
        isAdmin={false}
        managedSystems={[
          { id: 'one', name: 'Identity', granted: true },
          { id: 'two', name: 'Finance', granted: true },
        ]}
      />,
    );
    expect(screen.getByTestId('scope-union-badge')).toBeVisible();
    expect(screen.getByTestId('scope-selector')).toHaveTextContent('Identity · Finance');

    rerender(<AppSidebar entries={entries} isAdmin={true} managedSystems={[{ id: 'one', name: 'Identity', granted: true }]} />);
    expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();
  });

  it('replaces prior-rail items when the sidebar tree changes', () => {
    const { rerender } = render(<AppSidebar entries={NAV_TREE.voc} />);
    expect(screen.getByTestId('sidebar-nav-inbox')).toBeInTheDocument();

    rerender(<AppSidebar entries={NAV_TREE.tasks} />);
    expect(screen.queryByTestId('sidebar-nav-inbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-nav-tasks-board')).toBeInTheDocument();
  });
});
