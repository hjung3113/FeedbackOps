import { allowedPlatformReturnHref } from '@/lib/router/platform-return';
import { NAV_TREE } from '@/routes/_authed';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Database, Inbox, Plus } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '../AppSidebar';

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

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  localStorage.removeItem('appSidebarCollapsed');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppSidebar platform return link', () => {
  it.each(['https:a.example/path', 'https:/a.example/path', 'https:\\a.example/path'])(
    'resolves the validated %s to the allowlisted origin, never a relative link',
    (raw) => {
      const href = allowedPlatformReturnHref(raw, ['https://a.example']);
      render(<AppSidebar entries={entries} platformReturnUrl={href as string} />);
      const link = screen.getByRole('link', { name: '플랫폼으로 돌아가기' }) as HTMLAnchorElement;
      expect(new URL(link.href).origin).toBe('https://a.example');
    },
  );

  it('renders a same-tab link to the given URL with the fixed label', () => {
    render(
      <AppSidebar
        entries={entries}
        platformReturnUrl="https://platform.example.com/analytics?x=1"
      />,
    );
    const link = screen.getByRole('link', { name: '플랫폼으로 돌아가기' });
    expect(link).toHaveAttribute('href', 'https://platform.example.com/analytics?x=1');
    expect(link).not.toHaveAttribute('target');
  });

  it('renders nothing without a platformReturnUrl', () => {
    render(<AppSidebar entries={entries} />);
    expect(screen.queryByRole('link', { name: '플랫폼으로 돌아가기' })).not.toBeInTheDocument();
  });
});

describe('AppSidebar', () => {
  it('groups triage tabs under the Korean triage section and keeps No link in Inbox', () => {
    const triageViews = NAV_TREE.voc.filter((entry) => entry.section === 'Triage 보기');
    expect(
      triageViews.map(({ id, label, href, countKey }) => ({ id, label, href, countKey })),
    ).toEqual([
      {
        id: 'high-severity',
        label: '높음',
        href: '/vocs?view=triage&tab=high',
        countKey: 'voc.tab.high',
      },
      {
        id: 'unassigned',
        label: '미배정',
        href: '/vocs?view=triage&tab=unassigned',
        countKey: 'voc.tab.unassigned',
      },
    ]);

    const noLink = NAV_TREE.voc.find((entry) => entry.id === 'no-link');
    expect(noLink).toMatchObject({
      label: '연결 없음',
      href: '/vocs?view=inbox&tab=no-link',
      section: '보기',
      countKey: 'voc.inbox.no-link',
    });
    expect(noLink?.parentId).toBe('inbox');
  });

  it('uses the neutral tone for an urgent zero count', () => {
    render(<AppSidebar entries={NAV_TREE.voc} counts={{ 'voc.tab.unassigned': 0 }} />);

    const badge = screen.getByTestId('sidebar-count-unassigned');
    expect(badge).toHaveTextContent('0');
    expect(badge.className).toContain('bg-surface-row-selected');
    expect(badge.className).not.toContain('text-accent-danger');
  });

  it('renders nav entries with correct aria-current on active', () => {
    render(<AppSidebar entries={entries} />);
    expect(screen.getByTestId('sidebar-nav-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-nav-my').getAttribute('aria-current')).toBe('page');
  });

  it('does not render a footer wrapper for a non-admin actor', () => {
    render(<AppSidebar entries={entries} />);

    expect(screen.queryByTestId('sidebar-footer')).not.toBeInTheDocument();
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

  // #1179: long queue labels truncate at 1440; the span itself keeps the full
  // label discoverable on hover, the same guarantee as scope-name.
  it('expanded nav label span carries the full label as its title', () => {
    const label = '후속 조치 없는 부정 성과 Survey';
    render(
      <AppSidebar entries={[{ id: 'queue', label, href: '/integration', section: '연동' }]} />,
    );
    const navLink = screen.getByTestId('sidebar-nav-queue');
    const labelSpan = Array.from(navLink.querySelectorAll('span')).find(
      (el) => el.textContent === label,
    );
    expect(labelSpan).toBeDefined();
    expect(labelSpan).toHaveClass('truncate');
    expect(labelSpan).toHaveAttribute('title', label);
    // The link itself stays title-free when expanded (label is visible).
    expect(navLink.getAttribute('title')).toBeNull();
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

  // #679 FIX2: renamed section headers must keep their develop-era Latin test ids.
  it('keeps Latin sidebar-section test ids for every renamed section header', () => {
    render(
      <AppSidebar
        entries={[
          { id: 'queue-unassigned-voc', label: '미배정 VOC', href: '/vocs', section: '액션 큐' },
          ...NAV_TREE.findings,
          ...NAV_TREE.tasks,
          ...NAV_TREE.surveys,
          ...NAV_TREE.integration,
          ...NAV_TREE.admin,
        ]}
      />,
    );

    for (const testId of [
      'sidebar-section-action-queues',
      'sidebar-section-findings',
      'sidebar-section-tasks',
      'sidebar-section-surveys',
      'sidebar-section-integration',
      'sidebar-section-admin',
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it('hides section labels when collapsed', () => {
    render(<AppSidebar entries={entries} defaultCollapsed={true} />);

    expect(screen.queryByTestId('sidebar-section-voc')).not.toBeInTheDocument();
    expect(screen.queryByText('VOC')).not.toBeInTheDocument();
  });

  it('renders, applies, saves, and deletes private saved views without badges', () => {
    const apply = vi.fn();
    const save = vi.fn();
    const remove = vi.fn();
    render(
      <AppSidebar
        entries={entries}
        savedViews={[{ id: 'view-1', name: 'High priority' }]}
        canSaveView
        onApplySavedView={apply}
        onSaveView={save}
        onDeleteSavedView={remove}
      />,
    );
    expect(screen.getByTestId('saved-views-section')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-count-view-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('saved-view-apply-view-1'));
    expect(apply).toHaveBeenCalledWith('view-1');
    fireEvent.change(screen.getByLabelText('저장된 보기 이름'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByTestId('saved-view-save'));
    expect(save).toHaveBeenCalledWith('Mine');
    fireEvent.click(screen.getByTestId('saved-view-delete-view-1'));
    expect(remove).toHaveBeenCalledWith('view-1');
  });

  it.each([true, false])('hides Invite member for isAdmin=%s', (isAdmin) => {
    render(<AppSidebar entries={entries} isAdmin={isAdmin} />);

    expect(screen.queryByTestId('sidebar-footer-invite-member')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite member')).not.toBeInTheDocument();
  });

  it('renders Milestones without a badge when nav counts have no milestone key', () => {
    const counts = {
      'voc.inbox': 5,
      'voc.triage': 3,
      'voc.my': 2,
      'voc.tab.high': 1,
      'voc.tab.unassigned': 1,
      'voc.inbox.no-link': 2,
      'voc.clusters': 4,
      'findings.all': 7,
      'surveys.all': 0,
    };
    const milestoneEntry = NAV_TREE.tasks.find((entry) => entry.label === 'Milestones');

    expect(milestoneEntry).toBeDefined();
    expect(milestoneEntry?.countKey).toBeUndefined();

    render(<AppSidebar entries={NAV_TREE.tasks} counts={counts} />);

    const milestonesLink = screen.getByTestId('sidebar-nav-milestones');
    expect(milestonesLink).toHaveAttribute('href', '/tasks?view=milestones');
    expect(milestonesLink).toHaveTextContent('Milestones');
    expect(screen.queryByTestId('sidebar-count-milestones')).not.toBeInTheDocument();
    expect(milestonesLink).not.toHaveTextContent('0');
  });

  it('keeps the Triage unassigned sidebar count neutral', () => {
    render(<AppSidebar entries={NAV_TREE.voc} counts={{ 'voc.tab.unassigned': 3 }} />);

    const badge = screen.getByTestId('sidebar-count-unassigned');
    expect(badge).toHaveTextContent('3');
    expect(badge.className).toContain('bg-surface-row-selected');
    expect(badge.className).not.toContain('text-accent-danger');
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

  it('AC-E5b keeps every out-of-grant Managed System name visible in the scope list', () => {
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
    expect(screen.getByLabelText('범위 밖')).toBeVisible();
  });

  it('AC-E5a shows granted and total counts without claiming zero systems', () => {
    render(
      <AppSidebar
        entries={entries}
        isAdmin={false}
        managedSystems={[
          { id: 'identity', name: 'Identity Platform', granted: false },
          { id: 'finance', name: 'Finance Analytics', granted: false },
          { id: 'sales', name: 'Sales Workspace', granted: false },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('scope-selector'));
    const allScope = screen.getByTestId('scope-option-all');
    expect(allScope).toHaveTextContent('내 담당 0 / 3');
    expect(allScope).not.toHaveTextContent('0 systems');
    // The note lives outside the option buttons so it never becomes part of an
    // option's accessible name.
    expect(screen.getByTestId('scope-name-visibility-note')).toHaveTextContent(
      '이름은 워크스페이스 전체에 공개되며, 접근하려면 권한을 요청하세요.',
    );
    expect(allScope).not.toHaveTextContent('이름은 워크스페이스 전체에 공개되며');
    expect(screen.getByTestId('scope-option-identity')).toHaveTextContent('Identity Platform');
    expect(screen.getByTestId('scope-option-finance')).toHaveTextContent('Finance Analytics');
    expect(screen.getByTestId('scope-option-sales')).toHaveTextContent('Sales Workspace');
  });

  it('labels non-admin all scope with the assigned systems on an unobstructed second line', () => {
    render(
      <AppSidebar
        entries={entries}
        isAdmin={false}
        managedSystems={[
          { id: 'tableau', name: 'Tableau', granted: true },
          { id: 'powerbi', name: 'Power BI', granted: true },
        ]}
      />,
    );
    const selector = screen.getByTestId('scope-selector');
    const scopeName = screen.getByTestId('scope-name');
    expect(scopeName).toHaveTextContent('전체 Managed System');
    expect(selector).toHaveTextContent('내 담당: Tableau · Power BI');
    expect(selector).toHaveAccessibleName('전체 Managed System, 내 담당 범위');
    expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();
    expect(Array.from(scopeName.parentElement?.children ?? [])).toHaveLength(1);

    fireEvent.click(selector);
    expect(screen.getByTestId('scope-option-all')).toHaveTextContent('전체 Managed System');
  });

  it('labels Admin all scope without a second line or qualifier', () => {
    render(
      <AppSidebar
        entries={entries}
        isAdmin={true}
        managedSystems={[{ id: 'one', name: 'Identity', granted: true }]}
      />,
    );
    expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
    expect(screen.getByTestId('scope-selector')).not.toHaveTextContent('내 담당:');
    expect(screen.getByTestId('scope-selector')).toHaveAccessibleName('전체 Managed System');
    expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('scope-selector'));
    expect(screen.getByTestId('scope-option-all')).toHaveTextContent('워크스페이스 전체');
  });

  it('keeps scope qualifiers visible and exposes a long system name accessibly', () => {
    const name = 'Finance Analytics and Global Revenue Operations';
    render(
      <AppSidebar
        entries={entries}
        isAdmin={false}
        managedSystems={[{ id: 'outside', name, granted: false }]}
        selectedManagedSystemId="outside"
      />,
    );

    const selector = screen.getByTestId('scope-selector');
    expect(selector).toHaveAccessibleName(`${name}, 범위 밖`);
    expect(selector).toHaveAttribute('title', name);
    expect(screen.getByTestId('scope-name')).toHaveTextContent(name);
    expect(screen.getByTestId('scope-name')).toHaveClass('truncate');
    expect(screen.getByTestId('scope-out-of-scope-badge')).toHaveTextContent('범위 밖');
    expect(screen.getByTestId('scope-out-of-scope-badge')).toBeVisible();
  });

  it('replaces prior-rail items when the sidebar tree changes', () => {
    const { rerender } = render(<AppSidebar entries={NAV_TREE.voc} />);
    expect(screen.getByTestId('sidebar-nav-inbox')).toBeInTheDocument();

    rerender(<AppSidebar entries={NAV_TREE.tasks} />);
    expect(screen.queryByTestId('sidebar-nav-inbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-nav-tasks-board')).toBeInTheDocument();
  });

  const savedView = (id: string) => ({ id, name: `보기 ${id}` });

  // #972: jsdom has no layout engine, so the clip itself can only be pinned by
  // class; the title attribute is the observable discoverability guarantee.
  it('truncates a long saved-view name in the apply button and keeps it discoverable', () => {
    const name = '가'.repeat(200);
    render(<AppSidebar entries={entries} savedViews={[{ id: 'view-1', name }]} />);

    const button = screen.getByTestId('saved-view-apply-view-1');
    expect(button).toHaveAttribute('title', name);
    expect(button.querySelector('span')).toHaveClass('block', 'truncate');
    expect(button).toHaveClass('min-w-0', 'flex-1');
  });

  it.each([
    {
      scenario: 'first of three → next view',
      initial: ['view-1', 'view-2', 'view-3'],
      deleteId: 'view-1',
      remaining: ['view-2', 'view-3'],
      targetTestId: 'saved-view-apply-view-2',
      canSave: false,
    },
    {
      scenario: 'last of three → previous view',
      initial: ['view-1', 'view-2', 'view-3'],
      deleteId: 'view-3',
      remaining: ['view-1', 'view-2'],
      targetTestId: 'saved-view-apply-view-2',
      canSave: false,
    },
    {
      scenario: 'only view → save-name input',
      initial: ['view-1'],
      deleteId: 'view-1',
      remaining: [],
      targetTestId: null,
      canSave: true,
    },
  ])(
    '#972 delete focus: $scenario',
    async ({ initial, deleteId, remaining, targetTestId, canSave }) => {
      const remove = vi.fn();
      const { rerender } = render(
        <AppSidebar
          entries={entries}
          savedViews={initial.map(savedView)}
          canSaveView={canSave}
          onDeleteSavedView={remove}
        />,
      );

      const user = userEvent.setup();
      await user.click(screen.getByTestId(`saved-view-delete-${deleteId}`));
      expect(remove).toHaveBeenCalledWith(deleteId);
      // AppFrame refetches and passes the reduced list back down as a new prop.
      rerender(
        <AppSidebar
          entries={entries}
          savedViews={remaining.map(savedView)}
          canSaveView={canSave}
          onDeleteSavedView={remove}
        />,
      );

      const target =
        targetTestId === null
          ? screen.getByLabelText('저장된 보기 이름')
          : screen.getByTestId(targetTestId);
      await waitFor(() => expect(target).toHaveFocus());
    },
  );

  it('#972 keeps focus on the delete button when a delete fails and the list is unchanged', async () => {
    render(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('view-1'), savedView('view-2')]}
        onDeleteSavedView={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const deleteButton = screen.getByTestId('saved-view-delete-view-1');
    await user.click(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  // #972 FIX1: a delete whose promise rejects must never arm focus recovery —
  // neither a later list from another surface nor an unrelated refresh on the
  // same surface may steal focus while the user works elsewhere.
  it('#972 FIX1 a rejected delete leaves focus where the test put it', async () => {
    const remove = vi.fn(() => Promise.reject(new Error('delete rejected')));
    const { rerender } = render(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('view-1'), savedView('view-2')]}
        canSaveView
        savedViewSurface="voc"
        onDeleteSavedView={remove}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('saved-view-delete-view-1'));
    expect(screen.getByTestId('saved-view-delete-view-1')).toHaveFocus();

    // Park focus outside the section; recovery must not move it.
    screen.getByTestId('sidebar-nav-my').focus();

    // Unrelated refresh on the same surface omits the id — no focus move.
    rerender(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('view-2')]}
        canSaveView
        savedViewSurface="voc"
        onDeleteSavedView={remove}
      />,
    );
    expect(screen.getByTestId('sidebar-nav-my')).toHaveFocus();

    // Another surface's list arrives (save form shown) — no focus move.
    rerender(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('other-surface-view')]}
        canSaveView
        savedViewSurface="tasks"
        onDeleteSavedView={remove}
      />,
    );
    expect(screen.getByTestId('sidebar-nav-my')).toHaveFocus();
  });

  // #972 FIX1: recovery is armed only once the delete promise fulfils, and the
  // target is chosen then, skipping views that are themselves being deleted —
  // so [A, B, C] minus C and B always ends on A, whichever settles first.
  it.each([
    { scenario: 'C settles before B', settle: ['c', 'b'], afterFirstRefetch: ['a', 'b'] },
    { scenario: 'B settles before C', settle: ['b', 'c'], afterFirstRefetch: ['a', 'c'] },
  ])(
    '#972 FIX1 concurrent deletes ($scenario) end focus on the surviving neighbour',
    async ({ settle, afterFirstRefetch }) => {
      const resolvers = new Map<string, () => void>();
      const remove = vi.fn(
        (id: string) =>
          new Promise<void>((resolve) => {
            resolvers.set(id, resolve);
          }),
      );
      const { rerender } = render(
        <AppSidebar
          entries={entries}
          savedViews={['a', 'b', 'c'].map(savedView)}
          onDeleteSavedView={remove}
        />,
      );

      const user = userEvent.setup();
      await user.click(screen.getByTestId('saved-view-delete-c'));
      await user.click(screen.getByTestId('saved-view-delete-b'));
      expect(remove).toHaveBeenNthCalledWith(1, 'c');
      expect(remove).toHaveBeenNthCalledWith(2, 'b');

      // Both delete promises fulfil (in the parameterised order); the refetches
      // then land one at a time.
      await act(async () => {
        for (const id of settle) resolvers.get(id)?.();
      });

      rerender(
        <AppSidebar
          entries={entries}
          savedViews={afterFirstRefetch.map(savedView)}
          onDeleteSavedView={remove}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('saved-view-apply-a')).toHaveFocus());

      rerender(
        <AppSidebar entries={entries} savedViews={[savedView('a')]} onDeleteSavedView={remove} />,
      );
      await waitFor(() => expect(screen.getByTestId('saved-view-apply-a')).toHaveFocus());
    },
  );

  // #972 FIX1: a fulfilled delete whose row has not left the list yet must not
  // follow the user across a surface change — pending recovery is dropped.
  it('#972 FIX1 navigating to another surface drops pending recovery from a fulfilled delete', async () => {
    const remove = vi.fn();
    const { rerender } = render(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('view-1')]}
        canSaveView
        savedViewSurface="voc"
        onDeleteSavedView={remove}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('saved-view-delete-view-1'));
    screen.getByTestId('sidebar-nav-my').focus();

    rerender(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('other-surface-view')]}
        canSaveView
        savedViewSurface="tasks"
        onDeleteSavedView={remove}
      />,
    );
    expect(screen.getByTestId('sidebar-nav-my')).toHaveFocus();
  });

  // #972 FIX2: a delete still pending across a surface switch must not steal
  // focus from main content the user has already focused when its promise
  // fulfils on the destination surface.
  it('#972 FIX2 a late delete fulfilment after a surface switch leaves outside focus alone', async () => {
    const resolvers = new Map<string, () => void>();
    const remove = vi.fn(
      (id: string) =>
        new Promise<void>((resolve) => {
          resolvers.set(id, resolve);
        }),
    );
    const { rerender } = render(
      <>
        <AppSidebar
          entries={entries}
          savedViews={['task-1', 'task-2'].map(savedView)}
          savedViewSurface="tasks"
          onDeleteSavedView={remove}
        />
        <input data-testid="main-content-input" aria-label="메인 콘텐츠 입력" />
      </>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('saved-view-delete-task-1'));

    // Navigate to VOC: cached [voc-1, voc-2], save form shown.
    rerender(
      <>
        <AppSidebar
          entries={entries}
          savedViews={['voc-1', 'voc-2'].map(savedView)}
          canSaveView
          savedViewSurface="voc"
          onDeleteSavedView={remove}
        />
        <input data-testid="main-content-input" aria-label="메인 콘텐츠 입력" />
      </>,
    );
    const outsideInput = screen.getByTestId('main-content-input');
    outsideInput.focus();
    expect(outsideInput).toHaveFocus();

    // The old Task delete promise fulfils after the user focused the input.
    await act(async () => {
      resolvers.get('task-1')?.();
    });
    expect(outsideInput).toHaveFocus();
  });

  it.each(['body', 'VOC apply button'] as const)(
    'a late delete after navigation preserves destination focus on %s',
    async (destinationFocus) => {
      let resolveDelete!: () => void;
      const remove = () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        });
      const { rerender } = render(
        <AppSidebar
          entries={entries}
          savedViews={['task-1', 'task-2'].map(savedView)}
          savedViewSurface="tasks"
          onDeleteSavedView={remove}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('saved-view-delete-task-1'));

      rerender(
        <AppSidebar
          entries={entries}
          savedViews={['voc-1', 'voc-2'].map(savedView)}
          canSaveView
          savedViewSurface="voc"
          onDeleteSavedView={remove}
        />,
      );
      const destination =
        destinationFocus === 'body' ? document.body : screen.getByTestId('saved-view-apply-voc-1');
      if (destination === document.body) {
        (document.activeElement as HTMLElement | null)?.blur();
      } else {
        destination.focus();
      }
      expect(destination).toHaveFocus();

      await act(async () => {
        resolveDelete();
      });
      expect(destination).toHaveFocus();
    },
  );

  it('discards a late delete after navigating away and back to the same surface', async () => {
    let resolveDelete!: () => void;
    const remove = () =>
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
    const tasks = (
      <AppSidebar
        entries={entries}
        savedViews={['task-1', 'task-2'].map(savedView)}
        savedViewSurface="tasks"
        onDeleteSavedView={remove}
      />
    );
    const { rerender } = render(tasks);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('saved-view-delete-task-1'));

    rerender(
      <AppSidebar
        entries={entries}
        savedViews={['voc-1', 'voc-2'].map(savedView)}
        canSaveView
        savedViewSurface="voc"
        onDeleteSavedView={remove}
      />,
    );
    rerender(tasks);
    screen.getByTestId('saved-view-apply-task-2').focus();
    screen.getByTestId('saved-view-apply-task-2').blur();
    expect(document.body).toHaveFocus();

    await act(async () => {
      resolveDelete();
    });
    rerender(
      <AppSidebar
        entries={entries}
        savedViews={[savedView('task-2')]}
        savedViewSurface="tasks"
        onDeleteSavedView={remove}
      />,
    );
    expect(document.body).toHaveFocus();
  });

  // #972 FIX2: with a single delete, focus the user moved outside the section
  // while the refetch was in flight survives the recovery pass.
  it('#972 FIX2 same-surface delete leaves focus the user moved outside the section', async () => {
    const resolvers = new Map<string, () => void>();
    const remove = vi.fn(
      (id: string) =>
        new Promise<void>((resolve) => {
          resolvers.set(id, resolve);
        }),
    );
    const { rerender } = render(
      <>
        <AppSidebar
          entries={entries}
          savedViews={[savedView('view-1'), savedView('view-2')]}
          savedViewSurface="voc"
          onDeleteSavedView={remove}
        />
        <input data-testid="main-content-input" aria-label="메인 콘텐츠 입력" />
      </>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('saved-view-delete-view-1'));
    const outsideInput = screen.getByTestId('main-content-input');
    outsideInput.focus();
    expect(outsideInput).toHaveFocus();

    // Refetch lands with the reduced list while the delete promise is pending.
    rerender(
      <>
        <AppSidebar
          entries={entries}
          savedViews={[savedView('view-2')]}
          savedViewSurface="voc"
          onDeleteSavedView={remove}
        />
        <input data-testid="main-content-input" aria-label="메인 콘텐츠 입력" />
      </>,
    );
    expect(outsideInput).toHaveFocus();

    await act(async () => {
      resolvers.get('view-1')?.();
    });
    expect(outsideInput).toHaveFocus();
  });
});
