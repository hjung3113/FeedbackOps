// ============================================================
// FeedbackOps — Shared primitives: Icon, Avatar, Button, inputs
// ============================================================

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
// Helpers
// ============================================================
function priorityToSeverity(priority) {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high' || priority === 'medium' || priority === 'low') return priority;
  return 'low';
}

// Expose
Object.assign(window, {
  Icon, Avatar, Button, SearchInput, HelpTip, priorityToSeverity,
});
