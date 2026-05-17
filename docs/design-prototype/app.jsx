// ============================================================
// FeedbackOps — Main App (routing, scope, AppShell)
// ============================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "screen": "voc",
  "vocView": "inbox",
  "taskView": "board",
  "scope": "all",
  "accent": "#e4f222",
  "panelOpen": true,
  "role": "admin"
}/*EDITMODE-END*/;

const ALL_SCOPE = { id: 'all', name: 'All Managed Systems', mark: '∗', color: 'var(--color-neon-lime)' };

const FEEDBACKOPS_STATE_KEY = '__feedbackops_preview_state_v2';

function isOpenDesignSrcdocPreview() {
  try {
    return (
      window.location.protocol === 'about:' ||
      window.location.origin === 'null' ||
      window.location.href === 'about:srcdoc'
    );
  } catch (error) {
    return true;
  }
}

function readHashState() {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return {
      route:  params.get('route'),
      view:   params.get('view'),
      scope:  params.get('scope'),
      param:  params.get('param'),
    };
  } catch (error) {
    return {};
  }
}

function readPreviewState() {
  const fallback = {};
  try {
    const raw = window.name || '';
    if (raw.startsWith(`${FEEDBACKOPS_STATE_KEY}:`)) {
      return JSON.parse(raw.slice(FEEDBACKOPS_STATE_KEY.length + 1)) || fallback;
    }
  } catch (error) {
    // Ignore invalid cross-run window.name values.
  }

  try {
    const raw = window.sessionStorage?.getItem(FEEDBACKOPS_STATE_KEY);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writePreviewState(nextState) {
  const serializable = {
    route: nextState.route || 'voc',
    view: nextState.view || null,
    scope: nextState.scope || 'all',
    param: nextState.param || null,
    accent: nextState.accent || TWEAK_DEFAULTS.accent,
    role: nextState.role || TWEAK_DEFAULTS.role,
  };
  const payload = JSON.stringify(serializable);

  try {
    window.name = `${FEEDBACKOPS_STATE_KEY}:${payload}`;
  } catch (error) {
    // window.name is best-effort in embedded previews.
  }

  try {
    window.sessionStorage?.setItem(FEEDBACKOPS_STATE_KEY, payload);
  } catch (error) {
    // Storage is commonly blocked for origin:null srcdoc documents.
  }
}

function getInitialAppState() {
  const defaults = {
    route: TWEAK_DEFAULTS.screen || 'voc',
    view: TWEAK_DEFAULTS.vocView || null,
    scope: TWEAK_DEFAULTS.scope || 'all',
    param: null,
    accent: TWEAK_DEFAULTS.accent,
    role: TWEAK_DEFAULTS.role || 'admin',
  };

  const previewState = readPreviewState();
  const hashState = isOpenDesignSrcdocPreview() ? {} : readHashState();

  return {
    ...defaults,
    ...previewState,
    ...Object.fromEntries(Object.entries(hashState).filter(([, value]) => value != null)),
  };
}

function safelyReplaceHash(nextHash) {
  if (isOpenDesignSrcdocPreview()) return;

  try {
    if (window.location.hash === nextHash) return;
    window.history.replaceState(null, '', nextHash);
  } catch (error) {
    // In normal browser/file previews, fall back to hash assignment if the
    // History API is unavailable.
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }
}

function postToParent(message) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  } catch (error) {
    // Host messaging is optional; never let it affect the prototype.
  }
}

class FeedbackOpsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('FeedbackOps render error', error, info);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.stack || this.state.error?.message || String(this.state.error);
      return (
        <div className="runtime-fallback" role="alert">
          <div className="runtime-fallback__eyebrow">FeedbackOps render error</div>
          <h1>화면을 렌더링하지 못했습니다</h1>
          <p>컴포넌트 예외가 잡혔습니다. 아래 메시지를 기준으로 원인을 좁힐 수 있습니다.</p>
          <pre>{message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // In normal browsers, URL hash remains the source for deep links. In Open
  // Design's srcdoc preview, hash writes are blocked or reload the iframe, so
  // state restores from a small preview-safe cache instead.
  const initialState = useMemo(() => getInitialAppState(), []);

  const [route, setRoute] = useState(initialState.route || 'voc');
  const [view, setView] = useState(initialState.view || null);
  const [selectedParam, setSelectedParam] = useState(initialState.param || null); // generic url-state param
  const [scopeId, setScopeId] = useState(initialState.scope || 'all');
  const [accent, setAccent] = useState(initialState.accent || TWEAK_DEFAULTS.accent);
  const [role, setRole] = useState(initialState.role || 'admin');

  // Pack 8 — Effective Managed System scope.
  //
  // `scopeId === 'all'` means different things by role:
  //   - Admin   → workspace-wide (every MS).
  //   - Dev     → union of the developer's granted Managed Systems.
  //                (NOT a workspace bypass; it's `workspace ∩ grants`.)
  //   - User    → own VOCs only (no scoped backstage).
  //
  // `scope.members` is the canonical filterable set every screen uses.
  // `scope.isUnion` flags the dev-with-multiple-grants case so the
  // sidebar can hint that `all` is bounded by the actor's grants.
  const scope = useMemo(() => {
    const effective = window.effectiveScopeFor(role);
    if (scopeId === 'all') {
      return {
        ...ALL_SCOPE,
        members: effective,
        isUnion: role !== 'admin' && effective.length < window.WORKSPACE_MS_IDS.length,
        assignedScopes: effective,
        role,
      };
    }
    const ms = window.msById(scopeId);
    if (!ms) {
      return { ...ALL_SCOPE, members: effective, isUnion: role !== 'admin', assignedScopes: effective, role };
    }
    // Single-MS pick — still bounded by the actor's grants; if they
    // pick a system outside their grants, members ends up empty so the
    // list shows nothing (backend would 403 the request entirely).
    const inScope = effective.includes(ms.id);
    return {
      ...ms,
      members: inScope ? [ms.id] : [],
      isUnion: false,
      assignedScopes: effective,
      role,
      outOfGrants: !inScope,
    };
  }, [scopeId, role]);

  // Apply accent
  useEffect(() => {
    document.documentElement.style.setProperty('--color-neon-lime', accent);
  }, [accent]);

  // Persist navigation state to URL hash so refresh + back/forward + sharable
  // links work. Hash format: #route=voc&view=triage&scope=tableau&param=SRV-21
  // Routes-and-layout.md §URL State Rules.
  useEffect(() => {
    writePreviewState({ route, view, scope: scopeId, param: selectedParam, accent, role });

    const params = new URLSearchParams();
    params.set('route', route);
    if (view) params.set('view', view);
    if (scopeId && scopeId !== 'all') params.set('scope', scopeId);
    if (selectedParam) params.set('param', selectedParam);
    const next = `#${params.toString()}`;
    // replaceState avoids pushing a new entry on every state change. Inside the
    // Open Design srcdoc preview, safelyReplaceHash skips URL writes entirely.
    safelyReplaceHash(next);
  }, [route, view, scopeId, selectedParam, accent, role]);

  // Browser back/forward — sync URL changes back into state.
  useEffect(() => {
    if (isOpenDesignSrcdocPreview()) return undefined;
    const onHashChange = () => {
      const { route: r, view: v, scope: s, param: p } = readHashState();
      if (r && r !== route) setRoute(r);
      if (v !== view) setView(v || null);
      if ((s || 'all') !== scopeId) setScopeId(s || 'all');
      if ((p || null) !== selectedParam) setSelectedParam(p || null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [route, view, scopeId, selectedParam]);

  // If the actor's role doesn't grant access to the current rail, snap to a
  // safe default — emulates backend redirects on permission downgrade.
  useEffect(() => {
    const railOfRoute = (r) => {
      if (r === 'home' || r === 'my-work') return 'home';
      if (r.startsWith('voc')) return 'voc';
      if (r.startsWith('findings')) return 'findings';
      if (r.startsWith('tasks')) return 'tasks';
      if (r.startsWith('integration')) return 'integration';
      if (r.startsWith('survey')) return 'surveys';
      if (r.startsWith('admin')) return 'admin';
      return 'home';
    };
    const allowed = {
      user:  ['home', 'voc', 'surveys'],
      dev:   ['home', 'voc', 'findings', 'tasks', 'integration', 'surveys'],
      admin: ['home', 'voc', 'findings', 'tasks', 'integration', 'surveys', 'admin'],
    }[role] || [];
    if (!allowed.includes(railOfRoute(route))) {
      // Pick a sensible default per role
      const fallback = role === 'user' ? 'voc' : 'home';
      setRoute(fallback);
      setView(fallback === 'voc' ? 'my' : null);
    }
  }, [role]);

  // Pack 12 — if the user navigates while the panel is fullscreen,
  // collapse it so the next route lands in the normal 4-col layout.
  useEffect(() => {
    const shell = document.querySelector('.app-shell');
    if (shell?.classList.contains('panel-fullscreen')) {
      shell.classList.remove('panel-fullscreen');
      window.dispatchEvent(new CustomEvent('__panel-fullscreen-changed', { detail: false }));
    }
  }, [route, view]);

  const navigate = useCallback((nextRoute, nextView, nextParam) => {
    setRoute(nextRoute);
    // survey-result uses nextView as the selected survey id (e.g. SRV-21).
    // For other routes, keep the existing view semantics.
    if (nextRoute === 'survey-result' || nextRoute === 'survey-builder') {
      setSelectedParam(nextView || null);
      setView(null);
      return;
    }
    setSelectedParam(nextParam || null);
    if (nextView !== undefined) {
      setView(nextView);
    } else if (nextRoute === 'voc') {
      setView('inbox');
    } else if (nextRoute === 'tasks') {
      setView('board');
    } else {
      setView(null);
    }
  }, []);

  // Expose navigate globally so primitives like EntityHoverPreview that
  // can't easily receive it via props can fall back to it. Cleanup is not
  // needed — App is a singleton.
  useEffect(() => {
    window.__feedbackOpsNavigate = navigate;
  }, [navigate]);

  const onScopeChange = (m) => setScopeId(m.id);

  // breadcrumb
  const breadcrumb = useMemo(() => {
    const map = {
      home: ['Home'],
      'my-work': ['My Work'],
      voc: ['VOC', view === 'triage' ? 'Triage' : view === 'my' ? 'My VOCs' : 'Inbox'],
      'voc-clusters': ['VOC', 'Clusters'],
      'voc-new': ['VOC', 'New VOC'],
      findings: ['Integration', 'Findings'],
      tasks: ['Tasks', view === 'requests' ? 'Task requests' : view === 'backlog' ? 'Backlog' : view === 'milestones' ? 'Milestones' : view === 'roadmap' ? 'Roadmap' : view === 'my' ? 'My Tasks' : view === 'inbox' ? 'Inbox' : 'Board'],
      integration: ['Integration', 'Action dashboard'],
      'integration-evidence': ['Integration', 'Evidence'],
      'integration-coverage': ['Integration', 'Coverage'],
      'integration-links': ['Integration', 'Entity links'],
      surveys: ['Surveys'],
      'survey-result': ['Surveys', selectedParam || '', 'Results'].filter(Boolean),
      'survey-builder': ['Surveys', selectedParam || '', 'Builder'].filter(Boolean),
      admin: ['Admin', 'Managed systems'],
      'admin-areas': ['Admin', 'Analytics areas'],
      'admin-permissions': ['Admin', 'Permission requests'],
      'admin-settings': ['Admin', 'Workspace settings'],
    };
    return map[route] || ['Home'];
  }, [route, view, selectedParam]);

  // determine if there is a right detail panel for the route
  const tasksHasPanel = route === 'tasks'; // board, requests, milestones, backlog
  const hasPanelByRoute = ['voc', 'voc-clusters', 'findings', 'surveys', 'integration-evidence', 'integration-links', 'admin-permissions'].includes(route) || tasksHasPanel;

  // Tweaks bridge
  const setTweak = (k, v) => {
    if (typeof k === 'object') {
      Object.entries(k).forEach(([kk, vv]) => postToParent({ type: '__edit_mode_set_keys', edits: { [kk]: vv } }));
    } else {
      postToParent({ type: '__edit_mode_set_keys', edits: { [k]: v } });
    }
  };

  // listen for tweaks panel toggle
  const [tweaksOpen, setTweaksOpen] = useState(false);
  // Command menu state
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // Global ⌘K / Ctrl+K to open the command menu (Linear/Spotlight standard).
  // Also closes on Esc inside the menu.
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.altKey) {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const type = e.data?.type;
      if (type === '__activate_edit_mode') {
        document.documentElement.dataset.feedbackopsEditMode = 'true';
        setTweaksOpen(true);
      }
      if (type === '__deactivate_edit_mode') {
        delete document.documentElement.dataset.feedbackopsEditMode;
        setTweaksOpen(false);
      }
    };
    window.addEventListener('message', handler);
    // tell host edit mode is available
    postToParent({ type: '__edit_mode_available' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // page content
  let content;
  if (route === 'home' || route === 'my-work') {
    content = <HomeScreen onNavigate={navigate} />;
  } else if (route === 'voc-clusters') {
    content = <ClustersScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'voc-new') {
    content = <CreateVocScreen onNavigate={navigate} scope={scope} />;
  } else if (route === 'voc' && view === 'triage') {
    content = <TriageScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'voc') {
    content = <VocScreen view={view || 'inbox'} selectedParam={selectedParam} onNavigate={navigate} scope={scope} />;
  } else if (route === 'findings') {
    content = <FindingsScreen scope={scope} selectedParam={selectedParam} onNavigate={navigate} />;
  } else if (route === 'tasks' && view === 'milestones') {
    content = <MilestonesScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'tasks' && view === 'roadmap') {
    content = <TasksRoadmapScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'tasks') {
    content = <TasksScreen view={view || 'board'} selectedParam={selectedParam} scope={scope} onNavigate={navigate} />;
  } else if (route === 'integration-evidence') {
    content = <EvidenceScreen scope={scope} selectedParam={selectedParam} onNavigate={navigate} />;
  } else if (route === 'integration-coverage') {
    content = <CoverageScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'integration-links') {
    content = <EntityLinksScreen scope={scope} onNavigate={navigate} />;
  } else if (route === 'integration') {
    content = <IntegrationScreen onNavigate={navigate} scope={scope} />;
  } else if (route === 'surveys') {
    content = <SurveysScreen scope={scope} selectedParam={selectedParam} onNavigate={navigate} />;
  } else if (route === 'survey-result') {
    content = <SurveyResultScreen surveyId={selectedParam} scope={scope} onNavigate={navigate} />;
  } else if (route === 'survey-builder') {
    content = <SurveyBuilderScreen surveyId={selectedParam} onNavigate={navigate} />;
  } else if (route === 'admin') {
    content = <AdminScreen onNavigate={navigate} />;
  } else if (route === 'admin-areas') {
    content = <AdminAreasScreen onNavigate={navigate} />;
  } else if (route === 'admin-settings') {
    content = <AdminSettingsScreen onNavigate={navigate} />;
  } else if (route === 'admin-permissions') {
    content = <PermissionRequestsScreen onNavigate={navigate} />;
  } else {
    content = <HomeScreen onNavigate={navigate} />;
  }

  // Topbar actions per route
  const topActions = useMemo(() => {
    if (route === 'home' || route === 'my-work' || route === 'integration') return null;
    return null;
  }, [route]);

  // determine shell layout (panel-aware)
  const shellClass = hasPanelByRoute ? 'app-shell with-panel' : 'app-shell';

  return (
    <>
      <div className={shellClass} data-screen-label={breadcrumb.join(' / ')}>
        <GlobalRail activeRoute={route} onNavigate={navigate} role={role} />
        <Sidebar
          activeRoute={route}
          activeView={view}
          onNavigate={navigate}
          scope={scope}
          onScopeChange={onScopeChange}
          onCommandMenu={() => setCmdkOpen(true)}
          role={role}
        />
        {/* Right side of grid: if panel exists, content takes col 3, panel col 4.
            Each screen returns <main-region> + optional <detail-panel> directly. */}
        {content}
      </div>

      {/* Command menu (⌘K) */}
      <CommandMenu
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNavigate={navigate}
        onScopeChange={onScopeChange}
      />

      {/* Global toast host (Pack 12) */}
      <ToastHost />

      {/* Tweaks panel */}
      {tweaksOpen && (
        <TweaksPanel
          route={route} view={view} scopeId={scopeId} accent={accent} role={role}
          onChange={(updates) => {
            if (updates.screen !== undefined) navigate(updates.screen, updates.vocView ?? updates.taskView);
            if (updates.vocView !== undefined && route === 'voc') setView(updates.vocView);
            if (updates.taskView !== undefined && route === 'tasks') setView(updates.taskView);
            if (updates.scope !== undefined) setScopeId(updates.scope);
            if (updates.accent !== undefined) setAccent(updates.accent);
            if (updates.role !== undefined) setRole(updates.role);
            Object.entries(updates).forEach(([k, v]) => setTweak(k, v));
          }}
          onClose={() => { setTweaksOpen(false); postToParent({ type: '__edit_mode_dismissed' }); }}
        />
      )}
    </>
  );
}

function TweaksPanel({ route, view, scopeId, accent, role, onChange, onClose }) {
  const screens = [
    { id: 'home', label: 'Home' },
    { id: 'voc', label: 'VOC' },
    { id: 'findings', label: 'Findings' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'integration', label: 'Integration' },
    { id: 'surveys', label: 'Surveys' },
    { id: 'admin', label: 'Admin' },
  ];
  const accents = ['#e4f222', '#5e6ad2', '#02b8cc', '#8b5cf6', '#27a644'];
  const roles = [
    { id: 'admin', label: 'Admin' },
    { id: 'dev',   label: 'Developer' },
    { id: 'user',  label: 'User' },
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, width: 260,
      background: 'var(--surface-popover)', borderRadius: 8,
      boxShadow: 'var(--shadow-xl)', zIndex: 200,
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Icon name="settings" size={13} />
        <strong className="text-sm">Tweaks</strong>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Screen</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {screens.map(s => (
              <button key={s.id}
                className={`btn btn-${route === s.id ? 'primary' : 'subtle'} btn-sm`}
                onClick={() => onChange({ screen: s.id })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {route === 'voc' && (
          <div>
            <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>VOC view</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {['inbox', 'triage', 'my'].map(v => (
                <button key={v}
                  className={`btn btn-${view === v ? 'primary' : 'subtle'} btn-sm`}
                  style={{ flex: 1, textTransform: 'capitalize' }}
                  onClick={() => onChange({ vocView: v })}>{v}</button>
              ))}
            </div>
          </div>
        )}

        {route === 'tasks' && (
          <div>
            <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tasks view</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['board', 'inbox', 'my', 'requests', 'backlog', 'milestones', 'roadmap'].map(v => (
                <button key={v}
                  className={`btn btn-${view === v ? 'primary' : 'subtle'} btn-sm`}
                  style={{ flex: 1, textTransform: 'capitalize' }}
                  onClick={() => onChange({ taskView: v })}>{v}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Managed system scope</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {[{ id: 'all', name: 'All' }, ...window.ManagedSystems].map(m => (
              <button key={m.id}
                className={`btn btn-${scopeId === m.id ? 'primary' : 'subtle'} btn-sm`}
                onClick={() => onChange({ scope: m.id })}>{m.name}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role level</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {roles.map(r => (
              <button key={r.id}
                className={`btn btn-${role === r.id ? 'primary' : 'subtle'} btn-sm`}
                onClick={() => onChange({ role: r.id })}>{r.label}</button>
            ))}
          </div>
          <div className="text-xs muted" style={{ marginTop: 6, lineHeight: 1.4 }}>
            Navigation only · 백엔드 권한 검사는 별도
          </div>
        </div>

        <div>
          <label className="text-xs muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Accent</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {accents.map(c => (
              <button key={c} onClick={() => onChange({ accent: c })}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: c,
                  boxShadow: accent === c ? `0 0 0 2px var(--color-pitch-black), 0 0 0 4px ${c}` : 'var(--shadow-subtle)',
                  border: 'none', cursor: 'pointer',
                }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

try {
  window.__feedbackOpsReactOwner = true;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <FeedbackOpsErrorBoundary>
      <App />
    </FeedbackOpsErrorBoundary>
  );
} catch (error) {
  window.__feedbackOpsShowBootError?.(error);
}
