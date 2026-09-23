// ============================================================
// FeedbackOps — Detail panel scaffolding
// ============================================================

// Aliased hook destructures: a second `const { useState } = React` in a
// classic script would redeclare globals already defined by app.jsx.
const { useState: usePanelState, useRef: usePanelRef, useEffect: usePanelEffect } = React;

// ============================================================
// Field row (for detail panels)
// ============================================================
function FieldRow({ label, children }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div className="field-value">{children}</div>
    </div>
  );
}

// ============================================================
// Panel section header
// ============================================================
function PanelSectionTitle({ children, action }) {
  return (
    <div className="hstack" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
      <span className="panel-section-title" style={{ margin: 0 }}>{children}</span>
      {action}
    </div>
  );
}

function DetailPanelSectionNav({ sections, scrollRef }) {
  const firstSection = sections?.[0]?.id || '';
  const [activeSection, setActiveSection] = usePanelState(firstSection);
  const programmaticRef = usePanelRef(false);
  const sectionKey = (sections || []).map(s => s.id).join('|');

  usePanelEffect(() => {
    setActiveSection(firstSection);
  }, [firstSection, sectionKey]);

  usePanelEffect(() => {
    const root = scrollRef?.current;
    if (!root || !sections?.length) return;
    const anchors = sections
      .map(s => root.querySelector(`[data-anchor="${s.id}"]`))
      .filter(Boolean);
    if (!anchors.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      const updateActiveSection = () => {
        if (programmaticRef.current) return;
        const rootRect = root.getBoundingClientRect();
        const active = anchors
          .map(a => ({
            id: a.getAttribute('data-anchor'),
            top: Math.abs(a.getBoundingClientRect().top - rootRect.top),
          }))
          .sort((a, b) => a.top - b.top)[0];
        if (active?.id) setActiveSection(active.id);
      };
      root.addEventListener('scroll', updateActiveSection, { passive: true });
      updateActiveSection();
      return () => root.removeEventListener('scroll', updateActiveSection);
    }

    const observer = new IntersectionObserver((entries) => {
      if (programmaticRef.current) return;
      const visible = entries
        .filter(e => e.isIntersecting)
        .map(e => ({ id: e.target.getAttribute('data-anchor'), top: e.boundingClientRect.top }))
        .sort((a, b) => a.top - b.top);
      if (visible.length > 0) setActiveSection(visible[0].id);
    }, {
      root,
      rootMargin: '0px 0px -66% 0px',
      threshold: 0,
    });
    anchors.forEach(a => observer.observe(a));
    return () => observer.disconnect();
  }, [scrollRef, sectionKey]);

  const scrollTo = (id) => {
    const root = scrollRef?.current;
    const el = root?.querySelector(`[data-anchor="${id}"]`);
    if (!root || !el) return;
    programmaticRef.current = true;
    setActiveSection(id);
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    root.scrollTo({
      top: root.scrollTop + elRect.top - rootRect.top,
      behavior: 'smooth',
    });
    setTimeout(() => { programmaticRef.current = false; }, 700);
  };

  if (!sections?.length) return null;
  return (
    <div className="panel-section-nav">
      {sections.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => scrollTo(s.id)}
          className={`panel-section-nav-button ${activeSection === s.id ? 'active' : ''}`}>
          {s.label}
          {s.count !== undefined && (
            <span className="panel-section-nav-count mono">{s.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Detail panel scaffolding
// — used by 7+ panels (VOC, Finding, Task, Task Request, Cluster, Triage, Survey)
// ============================================================
const DETAIL_PANEL_KINDS = {
  voc:       { label: 'VOC',          color: 'var(--color-aether-blue)',  bg: 'rgba(94,106,210,0.15)' },
  cluster:   { label: 'Cluster',      color: 'var(--color-aether-blue)',  bg: 'rgba(94,106,210,0.15)' },
  finding:   { label: 'Finding',      color: 'var(--color-neon-lime)',    bg: 'rgba(20, 40, 160,0.15)' },
  task:      { label: 'Task',         color: 'var(--color-emerald)',      bg: 'rgba(39,166,68,0.15)' },
  request:   { label: 'Task Request', color: 'var(--color-amber)',        bg: 'rgba(242,196,109,0.15)' },
  triage:    { label: 'Triage',       color: 'var(--color-amber)',        bg: 'rgba(242,196,109,0.15)' },
  survey:    { label: 'Survey',       color: 'var(--color-amethyst)',     bg: 'rgba(139,92,246,0.15)' },
  milestone: { label: 'Milestone',    color: 'var(--color-amber)',        bg: 'rgba(242,196,109,0.15)' },
  evidence:  { label: 'Evidence',     color: '#02b8cc',                   bg: 'rgba(2,184,204,0.15)' },
  permission:{ label: 'Permission',   color: 'var(--color-amethyst)',     bg: 'rgba(139,92,246,0.15)' },
};

function DetailPanelHeader({ kind, label, id, onClose, extras }) {
  const k = DETAIL_PANEL_KINDS[kind] || DETAIL_PANEL_KINDS.voc;
  const handleClose = () => {
    const shell = document.querySelector('.app-shell');
    if (shell?.classList.contains('panel-fullscreen')) {
      shell.classList.remove('panel-fullscreen');
      window.dispatchEvent(new CustomEvent('__panel-fullscreen-changed', { detail: false }));
    }
    onClose?.();
  };
  return (
    <div className="panel-header">
      <span className="badge" style={{ background: k.bg, color: k.color }}>
        <span className="badge-dot" />{label || k.label}
      </span>
      <span className="panel-id mono">{id}</span>
      <div className="panel-header-actions">
        {extras}
        {onClose && <Button variant="ghost" size="sm" icon="close" onClick={handleClose} title="Close panel" />}
      </div>
    </div>
  );
}

function PanelTitleBlock({ title, children }) {
  return (
    <div className="panel-title-block">
      <h2 className="panel-title">{title}</h2>
      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

// ============================================================
// NestedTextBlock — readable text card on pitch-black bg
// Used in panel descriptions / summaries / rationales (5+ places)
// ============================================================
function NestedTextBlock({ children, padding = 12, style }) {
  return (
    <div style={{
      fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text-secondary)',
      padding, background: 'var(--color-pitch-black)',
      borderRadius: 6, boxShadow: 'var(--shadow-subtle)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ============================================================
// UserChip — avatar + name inline (8+ uses)
// ============================================================
function UserChip({ user, size = 'sm', sub }) {
  if (!user) return null;
  return (
    <span className="hstack" style={{ gap: 6 }}>
      <Avatar user={user} size={size} />
      <span>{user.name}</span>
      {sub && <span className="text-xs muted">· {sub}</span>}
    </span>
  );
}

// ============================================================
// Callout — tinted alert box with optional title
// ============================================================
const CALLOUT_TONES = {
  amber:  { bg: 'rgba(242,196,109,0.08)', ring: 'rgba(242,196,109,0.3)', color: 'var(--color-amber)',        text: 'var(--text-warning)' },
  red:    { bg: 'rgba(235,87,87,0.06)',   ring: 'rgba(235,87,87,0.2)',   color: 'var(--color-warning-red)',  text: 'var(--text-danger)' },
  blue:   { bg: 'rgba(94,106,210,0.04)',  ring: 'rgba(94,106,210,0.2)',  color: 'var(--color-aether-blue)',  text: 'var(--text-secondary)' },
  cyan:   { bg: 'rgba(2,184,204,0.06)',   ring: 'rgba(2,184,204,0.2)',   color: 'var(--color-cyan-spark)',   text: 'var(--text-secondary)' },
};

function Callout({ tone = 'amber', icon = 'alert', title, action, children }) {
  const t = CALLOUT_TONES[tone] || CALLOUT_TONES.amber;
  return (
    <div style={{
      padding: 12, borderRadius: 6,
      background: t.bg, boxShadow: `${t.ring} 0 0 0 1px inset`,
      color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', lineHeight: 1.55,
    }}>
      {title ? (
        <>
          <div className="hstack" style={{ gap: 8, marginBottom: 6 }}>
            <Icon name={icon} size={13} style={{ color: t.color }} />
            <strong className="text-sm" style={{ color: t.text }}>{title}</strong>
          </div>
          <div>{children}</div>
          {action && <div style={{ marginTop: 8 }}>{action}</div>}
        </>
      ) : (
        <span>
          <Icon name={icon} size={11} style={{ color: t.color, marginRight: 6, verticalAlign: '-1px' }} />
          {children}
          {action}
        </span>
      )}
    </div>
  );
}

// ============================================================
// PermissionBlockedPanel — used inline anywhere a linked entity or
// action is blocked by permission. The frontend NEVER infers what's
// blocked from local state; it renders whatever the backend marked as
// blocked_requestable / blocked_not_requestable / hidden / denied /
// summary_visible (see docs/frontend/interaction-patterns.md).
// ============================================================
function PermissionBlockedPanel({
  state = 'request_access',  // 'request_access' | 'denied' | 'blocked_not_requestable' | 'summary_visible'
  category,                  // human-readable access category, e.g. "Out-of-scope VOC"
  reason,                    // safe reason copy (provided by backend; do not invent)
  requiredScope,             // array of scope hints, e.g. ['powerbi']
  summary,                   // safe summary fields (only used when state === 'summary_visible')
  onRequest,
}) {
  if (state === 'summary_visible') {
    return (
      <div style={{
        padding: 12, borderRadius: 6,
        background: 'rgba(94,106,210,0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(94,106,210,0.2)',
      }}>
        <div className="hstack" style={{ gap: 8, marginBottom: 6 }}>
          <Icon name="shield" size={12} style={{ color: 'var(--color-aether-blue)' }} />
          <span className="text-xs" style={{ color: 'var(--color-aether-blue)', fontWeight: 600 }}>
            Summary-visible only
          </span>
        </div>
        {summary || (
          <span className="text-xs muted">전체 내용 대신 백엔드가 허용한 안전 요약만 표시됩니다.</span>
        )}
      </div>
    );
  }

  const isDenied = state === 'denied' || state === 'blocked_not_requestable';
  const tone = isDenied ? 'red' : 'amber';
  const TONE = isDenied
    ? { bg: 'rgba(235,87,87,0.06)', ring: 'rgba(235,87,87,0.2)', color: 'var(--color-warning-red)' }
    : { bg: 'rgba(242,196,109,0.08)', ring: 'rgba(242,196,109,0.3)', color: 'var(--color-amber)' };

  return (
    <div style={{
      padding: 14, borderRadius: 6,
      background: TONE.bg,
      boxShadow: `inset 0 0 0 1px ${TONE.ring}`,
    }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
        <Icon name={isDenied ? 'shield' : 'alert'} size={14} style={{ color: TONE.color, marginTop: 2 }} />
        <div className="vstack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <span className="text-sm" style={{ color: TONE.color, fontWeight: 600 }}>
            {category || (isDenied ? '권한이 거부되었습니다' : '권한이 필요합니다')}
          </span>
          {reason && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{reason}</span>
          )}
          {requiredScope && requiredScope.length > 0 && (
            <div className="hstack" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              <span className="text-xs muted">Required scope:</span>
              {requiredScope.map(s => <ManagedSystemPill key={s} id={s} />)}
            </div>
          )}
        </div>
      </div>
      {state === 'request_access' && (
        <Button variant="primary" size="sm" onClick={onRequest}>
          <Icon name="shield" size={11} />Request access
        </Button>
      )}
      {isDenied && (
        <div className="text-xs muted" style={{ marginTop: 6 }}>
          {state === 'denied'
            ? '명시 거부 상태입니다. policy 가 appeal 을 허용하지 않으면 다시 요청할 수 없습니다.'
            : '이 액션은 요청 대상이 아닙니다.'}
        </div>
      )}
    </div>
  );
}

// Expose
Object.assign(window, {
  FieldRow, PanelSectionTitle, DetailPanelSectionNav,
  DETAIL_PANEL_KINDS, DetailPanelHeader, PanelTitleBlock, NestedTextBlock,
  UserChip, Callout, PermissionBlockedPanel,
});
