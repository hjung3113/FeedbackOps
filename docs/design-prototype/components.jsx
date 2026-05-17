// ============================================================
// FeedbackOps — Shared primitive components
// ============================================================
const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;

// ============================================================
// PageShell — unified content layout for non-list pages
// (Home, Integration, Surveys, Admin, Create VOC ...)
// ============================================================
function PageShell({ title, subtitle, eyebrow, actions, back, children, fluid = false }) {
  return (
    <div className="main-scroll">
      <div className={`main-padded ${fluid ? '' : 'constrained'}`}>
        {(title || actions || back) && (
          <div className="page-header hstack" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
            <div className="vstack" style={{ gap: 6, minWidth: 0 }}>
              {(eyebrow || back) && (
                <div className="hstack" style={{ gap: 8 }}>
                  {back}
                  {eyebrow}
                </div>
              )}
              {title && <h1 className="page-title">{title}</h1>}
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="hstack" style={{ gap: 8, flexShrink: 0 }}>{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Icons (inline SVG, stroke-based)
// ============================================================
const ICON_PATHS = {
  home: 'M3 11l9-8 9 8M5 9.5V20h4v-6h6v6h4V9.5',
  inbox: 'M3 13h4.5l1.5 3h6l1.5-3H21M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8z',
  voc: 'M4 6h16v9H10l-4 4v-4H4z',
  finding: 'M11 4a7 7 0 1 1-7 7M21 21l-4.3-4.3M11 8v6M8 11h6',
  task: 'M5 12l4 4 10-10M5 19h14',
  survey: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5',
  integration: 'M10 4L6 8l4 4M14 12l4 4-4 4M3 12h18',
  admin: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
  search: 'M11 4a7 7 0 1 1-7 7M21 21l-4.3-4.3',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-4v2m0 12v2m8-8h-2M6 12H4m12.95-5.05l-1.42 1.42M7.47 16.53l-1.42 1.42m12.9 0l-1.42-1.42M7.47 7.47L6.05 6.05',
  bell: 'M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3V8zM9 19a3 3 0 0 0 6 0',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M6 18L18 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  filter: 'M3 5h18l-7 9v6l-4-2v-4z',
  sort: 'M3 7h14M3 12h10M3 17h6M17 7v10l3-3M17 17l3-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  expand: 'M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5',
  collapse: 'M9 4v5H4M15 20v-5h5M9 20v-5H4M15 4v5h5',
  link: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  refresh: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  alert: 'M12 4l10 17H2L12 4zm0 6v5m0 3v.01',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  megaphone: 'M3 11v2a3 3 0 0 0 3 3v3l4-3h7l4 3V8L17 11H6a3 3 0 0 0-3 3z',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  shield: 'M12 3l8 3v6c0 5-4 9-8 10-4-1-8-5-8-10V6l8-3z',
  user: 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12m-2 0a2 2 0 1 1 4 0a2 2 0 1 1 -4 0',
  doc: 'M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
  flag: 'M4 4v16M4 4h12l-2 4 2 4H4',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  arrowUpRight: 'M7 17L17 7M9 7h8v8',
  zap: 'M13 3L4 14h7l-1 7 9-11h-7l1-7z',
  layers: 'M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  command: 'M9 5a2 2 0 1 1-2 2h10a2 2 0 1 1-2-2v10a2 2 0 1 1 2-2H7a2 2 0 1 1 2 2V5z',
  bold: 'M6 5h6a3 3 0 0 1 0 6H6V5zm0 6h7a3 3 0 0 1 0 6H6v-6z',
  italic: 'M10 4h7M7 20h7M14 4L10 20',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  attach: 'M16 11l-5 5a4 4 0 1 1-6-6l8-8a3 3 0 1 1 4 4L9 16',
  underline: 'M6 4v8a6 6 0 0 0 12 0V4M5 20h14',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  warn: 'M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  help: 'M9.5 9a2.5 2.5 0 1 1 5 0c0 1.6-1.8 1.9-2.5 3v1M12 17h.01',
};

function Icon({ name, size = 16, stroke = 1.6, className, style }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ============================================================
// Avatar
// ============================================================
function Avatar({ user, size = 'md' }) {
  if (!user) {
    return <div className={`avatar avatar-${size}`} style={{ background: 'var(--color-charcoal-grey)', color: 'var(--text-muted)' }}>?</div>;
  }
  return (
    <div className={`avatar avatar-${size}`} style={{ background: user.color }}>
      {user.initials}
    </div>
  );
}

// ============================================================
// Button
// ============================================================
function Button({ variant = 'secondary', size, icon, children, className = '', ...rest }) {
  const classes = ['btn', `btn-${variant}`];
  if (size) classes.push(`btn-${size}`);
  if (!children) classes.push('btn-icon');
  classes.push(className);
  return (
    <button className={classes.join(' ')} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

// ============================================================
// Badges
// ============================================================
function ReporterStatusBadge({ status }) {
  const info = window.ReporterStatusLabels[status];
  if (!info) return null;
  return (
    <span className="badge badge-reporter" style={{ color: `var(--status-reporter-${info.token})` }}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

function InternalTaskBadge({ status }) {
  const info = window.InternalTaskStatusLabels[status];
  if (!info) return null;
  return (
    <span className="badge badge-internal" style={{ color: `var(--status-internal-${info.token})` }}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

function SeverityBadge({ severity }) {
  return (
    <span className={`badge badge-severity severity-${severity}`}>
      <span className="badge-dot" />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  return (
    <span className={`badge badge-confidence confidence-${confidence}`} style={{ background: 'transparent', boxShadow: 'var(--shadow-subtle)' }}>
      Confidence · <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{confidence}</span>
    </span>
  );
}

function FindingStatusBadge({ status }) {
  const info = window.FindingStatusLabels[status];
  if (!info) return <span className="badge">{status}</span>;
  const colorMap = {
    lime: { color: 'var(--color-neon-lime)', bg: 'rgba(228,242,34,0.1)' },
    cyan: { color: 'var(--color-cyan-spark)', bg: 'rgba(2,184,204,0.1)' },
    muted: { color: 'var(--text-muted)', bg: 'rgba(138,143,152,0.1)' },
  };
  const c = colorMap[info.color] || colorMap.muted;
  return (
    <span className="badge" style={{ color: c.color, background: c.bg }}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

function TaskRequestBadge({ status }) {
  const info = window.TaskRequestStatusLabels[status];
  if (!info) return null;
  const colorMap = {
    amber: { color: 'var(--color-amber)', bg: 'rgba(242,196,109,0.1)' },
    emerald: { color: 'var(--color-emerald)', bg: 'rgba(39,166,68,0.1)' },
    cyan: { color: 'var(--color-cyan-spark)', bg: 'rgba(2,184,204,0.1)' },
    red: { color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.1)' },
  };
  const c = colorMap[info.color] || colorMap.amber;
  return (
    <span className="badge" style={{ color: c.color, background: c.bg }}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

function ManagedSystemPill({ id }) {
  const ms = window.msById(id);
  if (!ms) return null;
  return (
    <span className="badge" style={{ background: 'transparent', boxShadow: 'var(--shadow-subtle)', color: 'var(--text-secondary)' }}>
      <span className="badge-dot" style={{ background: ms.color }} />
      {ms.name}
    </span>
  );
}

function ClusterStatusBadge({ status }) {
  const map = {
    confirmed: { color: 'var(--color-aether-blue)', bg: 'rgba(94,106,210,0.12)' },
    suggested: { color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.12)' },
  };
  const c = map[status] || map.suggested;
  return (
    <span className="badge" style={{ background: c.bg, color: c.color }}>
      <span className="badge-dot" />{status}
    </span>
  );
}

function SurveyStatusBadge({ status }) {
  const map = {
    live:   { color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.1)' },
    draft:  { color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)' },
    closed: { color: 'var(--color-aether-blue)', bg: 'rgba(94,106,210,0.1)' },
  };
  const c = map[status] || map.draft;
  return (
    <span className="badge" style={{ background: c.bg, color: c.color }}>
      <span className="badge-dot" />{status}
    </span>
  );
}

// ============================================================
// Coverage bar
// ============================================================
function CoverageBar({ percent, status = 'good' }) {
  return (
    <div className="coverage-bar">
      <div className={`coverage-bar-fill ${status}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

// ============================================================
// Search input
// ============================================================
function SearchInput({ placeholder = 'Search...', value, onChange }) {
  return (
    <div className="search-input">
      <Icon name="search" size={13} />
      <input value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

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

// ============================================================
// Linked Entity Trail
// ============================================================
function EntityNode({ type, title, meta, placeholder, action, selected, onClick }) {
  const typeMap = {
    voc: { label: 'V', color: '#5e6ad2' },
    evidence: { label: 'E', color: '#02b8cc' },
    finding: { label: 'F', color: '#e4f222', text: '#08090a' },
    request: { label: 'R', color: '#f2c46d', text: '#08090a' },
    task: { label: 'T', color: '#27a644' },
    survey: { label: 'S', color: '#8b5cf6' },
    outcome: { label: 'O', color: '#8b5cf6' },
  };
  const t = typeMap[type] || { label: '?', color: 'var(--color-charcoal-grey)' };
  return (
    <div
      className={`entity-node ${placeholder ? 'placeholder-node' : ''} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      } : undefined}
      style={onClick ? {
        cursor: 'pointer',
        boxShadow: selected ? 'inset 0 0 0 1px var(--border-selected)' : undefined,
      } : undefined}>
      <div className="entity-node-icon" style={!placeholder ? { background: t.color, color: t.text || 'white' } : {}}>
        {t.label}
      </div>
      <div className="entity-node-body">
        <div className="entity-node-title">{title}</div>
        {meta && <div className="entity-node-meta">{meta}</div>}
      </div>
      {action && <span className="badge" style={{ background: 'transparent' }}>{action}</span>}
    </div>
  );
}

function LinkedEntityTrail({ nodes, selectedKey, onNodeClick }) {
  return (
    <div className="entity-trail">
      {nodes.map((n, i) => (
        <div key={n.key || i}>
          {i > 0 && <div className="entity-trail-connector" />}
          <EntityNode
            {...n}
            selected={selectedKey === (n.key || `${n.type}-${i}`)}
            onClick={onNodeClick && (n.placeholder || n.action) ? () => onNodeClick(n, i) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Severity left indicator
// ============================================================
function SeverityIndicator({ severity }) {
  return <span className={`severity-indicator severity-${severity}`} title={severity} />;
}

// ============================================================
// Detail panel scaffolding
// — used by 7+ panels (VOC, Finding, Task, Task Request, Cluster, Triage, Survey)
// ============================================================
const DETAIL_PANEL_KINDS = {
  voc:       { label: 'VOC',          color: 'var(--color-aether-blue)',  bg: 'rgba(94,106,210,0.15)' },
  cluster:   { label: 'Cluster',      color: 'var(--color-aether-blue)',  bg: 'rgba(94,106,210,0.15)' },
  finding:   { label: 'Finding',      color: 'var(--color-neon-lime)',    bg: 'rgba(228,242,34,0.15)' },
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
// OutlineBadge — transparent bg + subtle ring badge (10+ uses)
// ============================================================
function OutlineBadge({ children, color, style, ...rest }) {
  return (
    <span className="badge" {...rest} style={{
      background: 'transparent',
      boxShadow: 'var(--shadow-subtle)',
      ...(color ? { color } : {}),
      ...style,
    }}>
      {children}
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
// ListToolbar — tabs + flexible right slot (6+ uses)
// ============================================================
function ListToolbar({ tabs, activeTab, onTabChange, action, children }) {
  // `action` renders pinned to the right edge (position: sticky) so the
  // primary CTA stays clickable even when the toolbar overflows because
  // the detail panel is open. Falls back to plain `children` slot when
  // a caller doesn't separate primary action from secondary controls.
  return (
    <div className="toolbar">
      {tabs && (
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.key}
              className={`tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => onTabChange && onTabChange(t.key)}
              title={t.tip}>
              {t.icon && <Icon name={t.icon} size={12} />}
              {t.label}
              {t.count != null && <span className={`tab-count ${t.urgent ? 'urgent' : ''}`}>{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-spacer" />
      {children}
      {action && <div className="toolbar-action">{action}</div>}
    </div>
  );
}

// ============================================================
// EntityIconBadge — colored letter icon (V/F/T/R/E/S/O)
// Used in entity-trail, recent-links, sample VOCs (3+ uses)
// ============================================================
const ENTITY_ICON_MAP = {
  voc:      { letter: 'V', bg: '#5e6ad2', color: 'white' },
  evidence: { letter: 'E', bg: '#02b8cc', color: 'white' },
  finding:  { letter: 'F', bg: '#e4f222', color: '#08090a' },
  request:  { letter: 'R', bg: '#f2c46d', color: '#08090a' },
  task:     { letter: 'T', bg: '#27a644', color: 'white' },
  survey:   { letter: 'S', bg: '#8b5cf6', color: 'white' },
  outcome:  { letter: 'O', bg: '#8b5cf6', color: 'white' },
};

function EntityIconBadge({ type, size = 22 }) {
  const e = ENTITY_ICON_MAP[type] || { letter: '?', bg: 'var(--color-charcoal-grey)', color: 'white' };
  return (
    <span className="entity-node-icon" style={{
      width: size, height: size,
      fontSize: Math.max(8, Math.round(size * 0.45)),
      background: e.bg, color: e.color,
      borderRadius: size <= 18 ? 4 : 6,
    }}>
      {e.letter}
    </span>
  );
}

// ============================================================
// SourceTypeIcon — colored letter icon for evidence-style source refs
// (V/S/N).  Promoted from screen-evidence.jsx in Pack 10 so the
// Milestone Detail's Evidence section, Cluster member rows, and
// Survey Result evidence excerpts can all consume the same atom.
// ============================================================
const SOURCE_TYPE_META = {
  voc:             { letter: 'V', bg: '#5e6ad2', color: 'white',                    label: 'VOC' },
  survey_response: { letter: 'S', bg: '#8b5cf6', color: 'white',                    label: 'Survey' },
  note:            { letter: 'N', bg: 'var(--color-charcoal-grey)', color: 'var(--text-secondary)', label: 'Note' },
};

function SourceTypeIcon({ type, size = 22 }) {
  const m = SOURCE_TYPE_META[type] || SOURCE_TYPE_META.note;
  return (
    <span className="entity-node-icon" style={{
      width: size, height: size,
      fontSize: Math.max(8, Math.round(size * 0.45)),
      background: m.bg, color: m.color,
      borderRadius: size <= 18 ? 4 : 6,
    }}>{m.letter}</span>
  );
}

// ============================================================
// Sentiment / Importance chips — evidence + survey-response classifiers.
// Promoted from screen-evidence.jsx in Pack 10.
// ============================================================
const SENTIMENT_META = {
  positive: { label: 'Positive', color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.1)' },
  neutral:  { label: 'Neutral',  color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)' },
  negative: { label: 'Negative', color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.1)' },
};

const IMPORTANCE_META = {
  high:   { label: 'High',   color: 'var(--color-warning-red)' },
  medium: { label: 'Medium', color: 'var(--color-amber)' },
  low:    { label: 'Low',    color: 'var(--text-muted)' },
};

function SentimentChip({ sentiment }) {
  if (!sentiment) return null;
  const m = SENTIMENT_META[sentiment] || SENTIMENT_META.neutral;
  return (
    <span className="badge" style={{ background: m.bg, color: m.color }}>
      <span className="badge-dot" />{m.label}
    </span>
  );
}

function ImportanceChip({ importance }) {
  if (!importance) return null;
  const m = IMPORTANCE_META[importance];
  return (
    <span className="badge" style={{
      background: 'transparent', boxShadow: 'var(--shadow-subtle)',
      color: m.color,
    }}>
      Importance · <strong style={{ color: 'var(--text-primary)' }}>{m.label}</strong>
    </span>
  );
}

// ============================================================
// EntityRelationRow — generalised from EntityLinkRow + the cluster
// "sample VOC" entity-node pattern.  Two shapes:
//   1) single entity   — left only           (Cluster member row)
//   2) source → target — left + arrow + right (Entity link row)
// Both shapes share icon + id + title + meta + optional trailing badge.
// Pack 10 extraction (HANDOFF §11).
// ============================================================
function EntityRelationRow({
  left, right, relation,
  title, meta,
  trailing, leading,
  selected, onClick,
  compact = false,
  style,
}) {
  const stem = right ? (
    // Two-endpoint shape — source → relation → target
    <div className="hstack" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
      <span className="hstack" style={{ gap: 6 }}>
        <EntityIconBadge type={left.type} size={compact ? 18 : 22} />
        <span className="mono text-sm">{left.id}</span>
      </span>
      <Icon name="arrowRight" size={11} className="muted" />
      <span className="hstack" style={{ gap: 6 }}>
        <EntityIconBadge type={right.type} size={compact ? 18 : 22} />
        <span className="mono text-sm">{right.id}</span>
      </span>
      {relation && <OutlineBadge>{relation}</OutlineBadge>}
    </div>
  ) : (
    // Single-entity shape — icon + title/meta block
    <div className="hstack" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
      <EntityIconBadge type={left.type} size={compact ? 18 : 22} />
      <div className="vstack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
        <div className="text-sm" style={{
          fontWeight: 500, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || left.id}
        </div>
        {meta && <div className="text-xs muted">{meta}</div>}
      </div>
    </div>
  );

  // Clickable variant — flex layout (don't use .entity-node since it
  // imposes a fixed 18px×1fr×auto grid that crams a multi-element stem
  // into a tiny first column).  Replicates the entity-node visual
  // (padding, hover, dashed-placeholder rules) inline.
  return (
    <div
      className={selected ? 'selected' : ''}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-subtle)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 120ms',
        ...(selected ? { boxShadow: 'inset 0 0 0 1px var(--border-selected)' } : {}),
        ...style,
      }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>{stem}</div>
      {trailing && <div className="hstack" style={{ gap: 6, flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
}

// ============================================================
// ObjectCard — generic structured card with id chip + title + status
// + meta line + footer.  Originally the Milestone card pattern; in
// Pack 10 it's exposed so other object types (Findings card view,
// Surveys card view, future grouped lists) get the same rhythm.
// Slots are deliberately minimal — extra content goes in `children`
// between the metadata strip and the footer.
// ============================================================
function ObjectCard({
  id, title, status, statusTone,
  badges, meta, footer, leading, trailing,
  onClick, selected, compact = false, children, style,
}) {
  return (
    <div
      onClick={onClick}
      className={selected ? 'selected' : ''}
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        boxShadow: selected
          ? 'inset 0 0 0 1px var(--border-selected)'
          : 'var(--shadow-subtle)',
        padding: compact ? 12 : 14,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10,
        ...style,
      }}>
      <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
        {leading}
        <div className="vstack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {id && <span className="row-id">{id}</span>}
            <span style={{
              fontWeight: 600, fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
            }}>{title}</span>
            {status}
          </div>
          {badges && <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
        </div>
        {trailing}
      </div>
      {meta && (
        <div className="row-meta" style={{ gap: 8, flexWrap: 'wrap' }}>{meta}</div>
      )}
      {children}
      {footer && (
        <div className="hstack" style={{
          gap: 6, paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
        }}>{footer}</div>
      )}
    </div>
  );
}

// ============================================================
// LiveTimestamp — "Last refreshed at <relative>" pill with a green
// pulse dot.  Drives its own rerender every second so the relative
// string and ping animation stay alive.  Used by Action Dashboard,
// Home KPIs, and Entity Links header.  Production should wire this
// to the real last_refreshed_at from the read model.
// ============================================================
function useTicker(intervalMs = 1000) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}

function relativeFromNow(date) {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 5)  return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function LiveTimestamp({ since, label = 'Live', compact = false }) {
  useTicker(1000);
  const date = since instanceof Date ? since : new Date(since);
  return (
    <span className="hstack" style={{
      gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        position: 'relative', width: 7, height: 7, borderRadius: '50%',
        background: 'var(--color-emerald)',
        boxShadow: '0 0 0 0 rgba(39,166,68,0.6)',
        animation: 'live-ping 1.6s ease-out infinite',
      }} />
      {!compact && <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>}
      <span className="tabular">Last refreshed {relativeFromNow(date)}</span>
    </span>
  );
}

// Compact variant — number that tweens to its current value when
// upstream count changes, paired with a tiny pulse so users know
// the value is live, not cached.  We keep the structure minimal:
// the host component supplies the value; we just animate emphasis.
function LiveCount({ value, color, tone, format = (n) => n }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setBump(true);
      const t = setTimeout(() => setBump(false), 360);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span className="tabular" style={{
      color: color || 'inherit',
      transition: 'transform 240ms ease, color 240ms ease',
      transform: bump ? 'scale(1.06)' : 'scale(1)',
      display: 'inline-block',
    }}>{format(value)}</span>
  );
}

// ============================================================
// Helpers
// ============================================================
function priorityToSeverity(priority) {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high' || priority === 'medium' || priority === 'low') return priority;
  return 'low';
}

// ============================================================
// HelpTip — small (?) button with native title tooltip
// Used in FieldLabel + Triage severity grid (2+ places)
// ============================================================
function HelpTip({ text, size = 10 }) {
  if (!text) return null;
  // Render as <span> (not <button>) so it can safely nest inside other interactive elements.
  return (
    <span
      className="field-help"
      title={text}
      aria-label={text}
      role="img">
      <Icon name="help" size={size} stroke={1.8} />
    </span>
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
  Icon, Avatar, Button, PageShell,
  ReporterStatusBadge, InternalTaskBadge, SeverityBadge, ConfidenceBadge,
  FindingStatusBadge, TaskRequestBadge, ManagedSystemPill,
  ClusterStatusBadge, SurveyStatusBadge,
  CoverageBar, SearchInput, FieldRow, PanelSectionTitle,
  EntityNode, LinkedEntityTrail, SeverityIndicator,
  DetailPanelHeader, PanelTitleBlock, NestedTextBlock,
  UserChip, OutlineBadge, Callout, ListToolbar,
  EntityIconBadge, priorityToSeverity, HelpTip,
  DETAIL_PANEL_KINDS, ENTITY_ICON_MAP,
  PermissionBlockedPanel,
  // Pack 10 — promoted / new primitives
  SourceTypeIcon, SentimentChip, ImportanceChip,
  SOURCE_TYPE_META, SENTIMENT_META, IMPORTANCE_META,
  EntityRelationRow, ObjectCard,
  LiveTimestamp, LiveCount, useTicker, relativeFromNow,
});
