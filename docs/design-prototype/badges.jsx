// ============================================================
// FeedbackOps — Status badges, pills, chips, coverage indicators
// ============================================================

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
    lime: { color: 'var(--color-neon-lime)', bg: 'rgba(20, 40, 160,0.1)' },
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
// Severity left indicator
// ============================================================
function SeverityIndicator({ severity }) {
  return <span className={`severity-indicator severity-${severity}`} title={severity} />;
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

// Expose
Object.assign(window, {
  ReporterStatusBadge, InternalTaskBadge, SeverityBadge, ConfidenceBadge,
  FindingStatusBadge, TaskRequestBadge, ManagedSystemPill,
  ClusterStatusBadge, SurveyStatusBadge,
  CoverageBar, SeverityIndicator, OutlineBadge,
  SentimentChip, ImportanceChip,
  SENTIMENT_META, IMPORTANCE_META,
});
