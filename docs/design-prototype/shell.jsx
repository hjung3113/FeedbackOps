// ============================================================
// FeedbackOps — AppShell (rail + sidebar + topbar)
// ============================================================
const { useState: useStateShell } = React;

// Per-role visibility for rail systems & sidebar items.
// Source: docs/frontend/routes-and-layout.md §Role Level Navigation Contract
//   User      — Submit VOC, My VOCs, Surveys (+ user-safe Home)
//   Developer — Home, My Work, VOC Triage, Tasks (intake/board), Integration, Surveys
//   Admin     — Adds Admin (Managed Systems, Analytics Areas, Permissions, Settings)
// Items without `roles` are visible to everyone. Backend permission checks
// remain authoritative — this filter is presentation-only.
const ROLE_RAIL_VISIBILITY = {
  user:  ['home', 'voc', 'surveys'],
  dev:   ['home', 'voc', 'findings', 'tasks', 'integration', 'surveys'],
  admin: ['home', 'voc', 'findings', 'tasks', 'integration', 'surveys', 'admin'],
};
const ROLE_SIDEBAR_HIDE = {
  // sidebar item keys to hide per role under each rail. Cleaner than
  // tagging every item individually with a roles array.
  user: {
    voc:   ['inbox', 'triage', 'clusters', 'v-untriaged', 'v-high', 'v-unassigned', 'v-similar', 'v-no-followup', 'v-public'],
    home:  ['q-unassigned', 'q-followup', 'q-public', 'q-outcome'],
  },
  dev: {
    voc: [], // Developer sees full VOC sub-nav
  },
  admin: {},
};

const NAV_TREE = {
  home: {
    primary: [
      { key: 'home', label: 'Home', icon: 'home', route: 'home' },
      { key: 'my-work', label: 'My Work', icon: 'inbox', route: 'my-work', count: 6 },
      { key: 'cmd', label: 'Command', icon: 'command', kbd: '⌘K' },
    ],
    sections: [
      {
        title: 'Action queues',
        items: [
          { key: 'q-unassigned', label: 'Unassigned VOC', count: 12, urgent: true, route: 'voc' },
          { key: 'q-followup', label: 'Configured follow-up', count: 8, route: 'integration' },
          { key: 'q-public', label: 'Public update review', count: 5, route: 'voc' },
          { key: 'q-outcome', label: 'Outcome follow-up', count: 3, urgent: true, route: 'integration' },
        ],
      },
      {
        title: 'Recent',
        items: [
          { key: 'r1', label: 'FIN-181 SSO 재인증', icon: 'finding', route: 'findings' },
          { key: 'r2', label: 'VOC-2814 사이드 메뉴', icon: 'voc', route: 'voc' },
          { key: 'r3', label: 'TASK-901 쿼리 플랜', icon: 'task', route: 'tasks' },
        ],
      },
    ],
  },
  voc: {
    primary: [
      { key: 'inbox', label: 'Inbox', icon: 'inbox', route: 'voc', view: 'inbox' },
      { key: 'triage', label: 'Triage', icon: 'flag', route: 'voc', view: 'triage', count: 6, accent: true },
      { key: 'my-voc', label: 'My VOCs', icon: 'user', route: 'voc', view: 'my', count: 8 },
      { key: 'clusters', label: 'Clusters', icon: 'layers', route: 'voc-clusters', count: 12 },
      { key: 'new-voc', label: 'New VOC', icon: 'plus', route: 'voc-new', accent: true, kbd: 'C' },
    ],
    sections: [
      {
        title: 'Views',
        items: [
          { key: 'v-untriaged', label: 'Untriaged', count: 9, route: 'voc', view: 'triage' },
          { key: 'v-high', label: 'High severity', count: 7, route: 'voc', view: 'triage' },
          { key: 'v-unassigned', label: 'Unassigned', count: 12, urgent: true, route: 'voc', view: 'triage' },
          { key: 'v-similar', label: 'Similar suggested', count: 4, route: 'voc', view: 'triage' },
          { key: 'v-no-followup', label: 'No follow-up', count: 5, route: 'voc', view: 'triage' },
          { key: 'v-public', label: 'Public update needed', count: 5, route: 'voc', view: 'triage' },
        ],
      },
      {
        title: 'Managed systems',
        items: window.ManagedSystems.map(m => ({
          key: `ms-${m.id}`, label: m.name, count: ({ tableau: 18, powerbi: 14, looker: 8, metabase: 7 }[m.id]),
        })),
      },
    ],
  },
  findings: {
    primary: [
      { key: 'all', label: 'All findings', icon: 'finding', route: 'findings', count: 31 },
      { key: 'evidence', label: 'Evidence highlights', icon: 'doc', route: 'integration-evidence', count: 86 },
      { key: 'converted', label: 'Converted', icon: 'check', route: 'findings' },
    ],
    sections: [
      {
        title: 'Status',
        items: [
          { key: 's-draft', label: 'Draft', count: 6, route: 'findings' },
          { key: 's-active', label: 'Active', count: 14, accent: true, route: 'findings' },
          { key: 's-not-act', label: 'Not actionable', count: 4, route: 'findings' },
          { key: 's-archived', label: 'Archived', count: 7, route: 'findings' },
        ],
      },
      {
        title: 'Source',
        items: [
          { key: 'src-voc', label: 'From VOC', count: 18, route: 'findings' },
          { key: 'src-survey', label: 'From Survey', count: 7, route: 'findings' },
          { key: 'src-manual', label: 'From note', count: 6, route: 'findings' },
        ],
      },
    ],
  },
  tasks: {
    primary: [
      { key: 'inbox', label: 'Inbox', icon: 'inbox', route: 'tasks', view: 'inbox', count: 5, accent: true },
      { key: 'my', label: 'My Tasks', icon: 'user', route: 'tasks', view: 'my', count: 4 },
      { key: 'board', label: 'Board', icon: 'task', route: 'tasks', view: 'board' },
      { key: 'requests', label: 'Task requests', icon: 'inbox', route: 'tasks', view: 'requests', count: 11, accent: true },
      { key: 'backlog', label: 'Backlog', icon: 'layers', route: 'tasks', view: 'backlog', count: 124 },
      { key: 'milestones', label: 'Milestones', icon: 'flag', route: 'tasks', view: 'milestones', count: 8 },
      { key: 'roadmap', label: 'Roadmap', icon: 'pulse', route: 'tasks', view: 'roadmap' },
    ],
    sections: [
      {
        title: 'Intake',
        items: [
          { key: 'i-pending', label: 'Pending review', count: 8, accent: true, route: 'tasks', view: 'requests' },
          { key: 'i-evidence', label: 'Needs evidence', count: 2, route: 'tasks', view: 'requests' },
          { key: 'i-approved', label: 'Approved', count: 14, route: 'tasks', view: 'requests' },
          { key: 'i-rejected', label: 'Rejected', count: 5, route: 'tasks', view: 'requests' },
        ],
      },
      {
        title: 'My work',
        items: [
          { key: 't-assigned', label: 'Assigned to me', count: 4, route: 'tasks', view: 'board' },
          { key: 't-doing', label: 'Doing', count: 2, route: 'tasks', view: 'board' },
          { key: 't-review', label: 'In review', count: 3, route: 'tasks', view: 'board' },
        ],
      },
    ],
  },
  integration: {
    primary: [
      { key: 'dash', label: 'Action dashboard', icon: 'pulse', route: 'integration' },
      { key: 'findings-i', label: 'Findings', icon: 'finding', route: 'findings' },
      { key: 'evidence-i', label: 'Evidence', icon: 'doc', route: 'integration-evidence' },
      { key: 'coverage-i', label: 'Coverage', icon: 'layers', route: 'integration-coverage' },
      { key: 'links-i', label: 'Entity links', icon: 'link', route: 'integration-links' },
    ],
    sections: [
      {
        title: 'Recovery queues',
        items: [
          { key: 'r-unassigned', label: 'Unassigned VOC', count: 12, urgent: true, route: 'voc' },
          { key: 'r-followup', label: 'Configured follow-up gap', count: 8, route: 'integration' },
          { key: 'r-public', label: 'Public update review', count: 5, route: 'voc' },
          { key: 'r-outcome', label: 'Outcome follow-up', count: 3, urgent: true, route: 'integration' },
          { key: 'r-stale', label: 'Stale entity link', count: 4, route: 'integration-links' },
        ],
      },
      {
        title: 'Coverage',
        items: [
          { key: 'c-voc-task', label: 'VOC → Task', count: '18%', route: 'integration-coverage' },
          { key: 'c-milestone', label: 'Milestone validated', count: '26%', route: 'integration-coverage' },
        ],
      },
    ],
  },
  surveys: {
    primary: [
      { key: 'all-s', label: 'All surveys', icon: 'survey', route: 'surveys', count: 14 },
      { key: 'discovery', label: 'Discovery', icon: 'finding', route: 'surveys' },
      { key: 'validation', label: 'Validation', icon: 'check', route: 'surveys' },
      { key: 'outcome', label: 'Outcome', icon: 'pulse', route: 'surveys' },
    ],
    sections: [],
  },
  admin: {
    primary: [
      { key: 'managed', label: 'Managed systems', icon: 'database', route: 'admin' },
      { key: 'areas', label: 'Analytics areas', icon: 'layers', route: 'admin-areas' },
      { key: 'permissions', label: 'Permission requests', icon: 'shield', route: 'admin-permissions', count: 3, urgent: true },
      { key: 'settings', label: 'Workspace settings', icon: 'settings', route: 'admin-settings' },
    ],
    sections: [],
  },
};

const RAIL_ITEMS = [
  { key: 'home', label: 'Home', short: 'Hm', icon: 'home', route: 'home' },
  { key: 'voc', label: 'VOC', short: 'VC', icon: 'voc', route: 'voc' },
  { key: 'findings', label: 'Findings', short: 'Fn', icon: 'finding', route: 'findings' },
  { key: 'tasks', label: 'Tasks', short: 'Tk', icon: 'task', route: 'tasks' },
  { key: 'integration', label: 'Integration', short: 'In', icon: 'integration', route: 'integration' },
  { key: 'surveys', label: 'Surveys', short: 'Sv', icon: 'survey', route: 'surveys' },
  { key: 'admin', label: 'Admin', short: 'Ad', icon: 'admin', route: 'admin' },
];

// ============================================================
// Global rail (system selector)
// ============================================================
function GlobalRail({ activeRoute, onNavigate, role = 'admin' }) {
  // map route → rail
  const activeKey = useMemo(() => {
    if (activeRoute === 'home' || activeRoute === 'my-work') return 'home';
    if (activeRoute.startsWith('voc')) return 'voc';
    if (activeRoute.startsWith('findings')) return 'findings';
    if (activeRoute.startsWith('tasks')) return 'tasks';
    if (activeRoute.startsWith('integration')) return 'integration';
    if (activeRoute.startsWith('survey')) return 'surveys';
    if (activeRoute.startsWith('admin')) return 'admin';
    return 'home';
  }, [activeRoute]);

  const allowed = ROLE_RAIL_VISIBILITY[role] || ROLE_RAIL_VISIBILITY.admin;
  const visibleRail = RAIL_ITEMS.filter(item => allowed.includes(item.key));
  const head = visibleRail.filter(item => item.key !== 'admin');
  const tail = visibleRail.filter(item => item.key === 'admin');

  return (
    <aside className="global-rail" aria-label="System selector">
      <div className="rail-logo" title="FeedbackOps">F</div>
      {head.map(item => (
        <button
          key={item.key}
          className={`rail-item ${activeKey === item.key ? 'active' : ''}`}
          onClick={() => onNavigate(item.route)}
          title={item.label}>
          <Icon name={item.icon} size={16} />
        </button>
      ))}
      {tail.length > 0 && <div className="rail-divider" />}
      {tail.map(item => (
        <button
          key={item.key}
          className={`rail-item ${activeKey === item.key ? 'active' : ''}`}
          onClick={() => onNavigate(item.route)}
          title={item.label}>
          <Icon name={item.icon} size={16} />
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-item" title="Notifications"><Icon name="bell" size={15} /></button>
      <div className="rail-avatar" title={`${role === 'admin' ? '김지원 · Admin' : role === 'dev' ? '김지원 · Developer' : '김지원 · User'}`}>김</div>
    </aside>
  );
}

// ============================================================
// Sidebar
// ============================================================
function Sidebar({ activeRoute, activeView, onNavigate, scope, onScopeChange, onCommandMenu, role = 'admin' }) {
  const [mobileOpen, setMobileOpen] = useStateShell(false);
  const railKey = useMemo(() => {
    if (activeRoute === 'home' || activeRoute === 'my-work') return 'home';
    if (activeRoute.startsWith('voc')) return 'voc';
    if (activeRoute.startsWith('findings')) return 'findings';
    if (activeRoute.startsWith('tasks')) return 'tasks';
    if (activeRoute.startsWith('integration')) return 'integration';
    if (activeRoute.startsWith('survey')) return 'surveys';
    if (activeRoute.startsWith('admin')) return 'admin';
    return 'home';
  }, [activeRoute]);

  const tree = NAV_TREE[railKey] || NAV_TREE.home;
  // Apply role-based hide list. Production should drive this from backend-
  // returned navigation envelope per actor — this map is presentation-only.
  const hideKeys = new Set((ROLE_SIDEBAR_HIDE[role]?.[railKey]) || []);
  const filteredPrimary = tree.primary.filter(item => !hideKeys.has(item.key));
  const filteredSections = tree.sections.map(section => ({
    ...section,
    items: section.items.filter(item => !hideKeys.has(item.key)),
  })).filter(section => section.items.length > 0);
  const [scopeOpen, setScopeOpen] = useState(false);
  const sectionTitle = {
    home: 'FeedbackOps',
    voc: 'VOC',
    findings: 'Findings',
    tasks: 'Tasks',
    integration: 'Integration',
    surveys: 'Surveys',
    admin: 'Admin',
  }[railKey];
  const systemMeta = {
    home: { label: 'Home', icon: 'home', sub: '오늘의 운영 갭' },
    voc: { label: 'VOC', icon: 'voc', sub: 'Voice of Customer' },
    findings: { label: 'Findings', icon: 'finding', sub: 'Evidence → Execution' },
    tasks: { label: 'Tasks', icon: 'task', sub: 'Execution' },
    integration: { label: 'Integration', icon: 'integration', sub: 'Coverage & Recovery' },
    surveys: { label: 'Surveys', icon: 'survey', sub: 'Discovery · Validation · Outcome' },
    admin: { label: 'Admin', icon: 'admin', sub: 'Workspace' },
  }[railKey];
  const navigateAndClose = (route, view) => {
    onNavigate(route, view);
    setMobileOpen(false);
  };

  return (
    <>
    <button
      className="mobile-nav-toggle"
      type="button"
      aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      aria-expanded={mobileOpen}
      onClick={() => setMobileOpen(!mobileOpen)}>
      {mobileOpen ? <Icon name="close" size={18} /> : <span className="mobile-nav-bars" aria-hidden="true" />}
    </button>
    {mobileOpen && (
      <button
        className="mobile-nav-backdrop"
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />
    )}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-system">
        <div className="sidebar-system-icon">
          <Icon name={systemMeta.icon} size={15} />
        </div>
        <div className="sidebar-system-text">
          <div className="sidebar-system-label">{systemMeta.label}</div>
          <div className="sidebar-system-sub">{systemMeta.sub}</div>
        </div>
      </div>
      <div className="sidebar-scope">
        <button className="scope-switcher" onClick={() => setScopeOpen(!scopeOpen)}>
          <div className="scope-mark" style={{ background: scope.id === 'all' ? 'var(--color-neon-lime)' : scope.color, color: scope.id === 'all' ? 'var(--color-pitch-black)' : 'white' }}>
            {scope.id === 'all' ? '∗' : scope.mark}
          </div>
          <div className="scope-name" style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {scope.id === 'all' ? 'All Managed Systems' : scope.name}
              {/* Pack 8 — flag bounded "all" so dev/user actors see that
                  the workspace isn't actually all four MS. */}
              {scope.id === 'all' && scope.isUnion && (
                <span className="badge" title="Bounded by your granted Managed Systems"
                  style={{ background: 'rgba(94,106,210,0.16)', color: 'var(--color-aether-blue)', fontSize: 10, padding: '1px 6px' }}>
                  <Icon name="shield" size={9} />union
                </span>
              )}
              {scope.outOfGrants && (
                <span className="badge" title="This Managed System is outside your grants"
                  style={{ background: 'rgba(235,87,87,0.14)', color: 'var(--color-warning-red)', fontSize: 10, padding: '1px 6px' }}>
                  <Icon name="alert" size={9} />out of scope
                </span>
              )}
            </span>
            {scope.id === 'all' && scope.isUnion && (
              <span className="text-xs muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
                {scope.assignedScopes.map(id => window.msById(id)?.name).join(' · ')}
              </span>
            )}
          </div>
          <Icon name="chevronDown" size={11} className="scope-caret" />
        </button>
        {scopeOpen && (
          <div style={{
            position: 'absolute', marginTop: 4, padding: 4, width: 244,
            background: 'var(--surface-popover)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xl)', zIndex: 50,
          }}>
            {/* All Managed Systems — clarify what `all` resolves to per role */}
            <button className="nav-item" onClick={() => { onScopeChange({ id: 'all' }); setScopeOpen(false); }} style={{ marginBottom: 2 }}>
              <div className="scope-mark" style={{ width: 18, height: 18, background: 'var(--color-neon-lime)', color: 'var(--color-pitch-black)' }}>∗</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, alignItems: 'flex-start' }}>
                <span className="nav-label">All Managed Systems</span>
                <span className="text-xs muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
                  {role === 'admin' ? 'workspace-wide' : `union · ${scope.assignedScopes.length} system${scope.assignedScopes.length > 1 ? 's' : ''}`}
                </span>
              </div>
            </button>
            {window.ManagedSystems.map(m => {
              const granted = scope.assignedScopes.includes(m.id);
              return (
                <button key={m.id} className="nav-item" onClick={() => { onScopeChange(m); setScopeOpen(false); }} style={{ marginBottom: 2, opacity: granted ? 1 : 0.55 }}>
                  <div className="scope-mark" style={{ width: 18, height: 18, background: m.color, color: 'white' }}>{m.mark}</div>
                  <span className="nav-label" style={{ flex: 1 }}>{m.name}</span>
                  {!granted && <Icon name="shield" size={10} className="muted" title="Outside your grants" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sidebar-scroll">
        <div className="nav-section">{sectionTitle}</div>
        {filteredPrimary.map(item => {
          const isActive = (item.route === activeRoute) && (!item.view || item.view === activeView);
          // Command menu item has no route — it opens the ⌘K overlay
          const isCommand = item.key === 'cmd';
          return (
            <button key={item.key} className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (isCommand) {
                  onCommandMenu && onCommandMenu();
                  setMobileOpen(false);
                } else if (item.route) {
                  navigateAndClose(item.route, item.view);
                }
              }}>
              {item.icon && <span className="nav-icon"><Icon name={item.icon} size={14} /></span>}
              <span className="nav-label">{item.label}</span>
              {item.kbd && <span className="kbd">{item.kbd}</span>}
              {item.count != null && (
                <span className={`nav-count ${item.urgent ? 'urgent' : item.accent ? 'accent' : ''}`}>{item.count}</span>
              )}
            </button>
          );
        })}

        {filteredSections.map(section => (
          <div key={section.title}>
            <div className="nav-section">{section.title}</div>
            {section.items.map(item => (
              <button key={item.key} className="nav-item"
                onClick={() => item.route && navigateAndClose(item.route, item.view)}>
                {item.icon && <span className="nav-icon"><Icon name={item.icon} size={14} /></span>}
                {!item.icon && <span className="nav-icon" />}
                <span className="nav-label">{item.label}</span>
                {item.count != null && (
                  <span className={`nav-count ${item.urgent ? 'urgent' : item.accent ? 'accent' : ''}`}>{item.count}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="nav-item">
          <span className="nav-icon"><Icon name="plus" size={14} /></span>
          <span className="nav-label">Invite member</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon"><Icon name="settings" size={14} /></span>
          <span className="nav-label">Workspace settings</span>
        </button>
      </div>
    </aside>
    </>
  );
}

// ============================================================
// Topbar
// ============================================================
function Topbar({ breadcrumb, actions, kbd, search }) {
  return (
    <div className="topbar">
      <div className="topbar-breadcrumb">
        {breadcrumb.map((b, i) => (
          <span key={i} className="hstack" style={{ gap: 6 }}>
            {i > 0 && <Icon name="chevronRight" size={10} />}
            <span className={i === breadcrumb.length - 1 ? 'crumb-active' : ''}>{b}</span>
          </span>
        ))}
      </div>
      <div className="topbar-actions">
        {search && <SearchInput placeholder="Search workspace..." />}
        {kbd && (
          <button className="btn btn-subtle btn-sm" title="Command menu">
            <Icon name="command" size={12} />
            <span className="kbd">⌘K</span>
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

Object.assign(window, { GlobalRail, Sidebar, Topbar, NAV_TREE });
