// ============================================================
// FeedbackOps — Live signals: ticker, relative time, live count
// ============================================================

// Aliased hook destructures: a second `const { useState } = React` in a
// classic script would redeclare globals already defined by app.jsx.
const { useState: useLiveState, useEffect: useLiveEffect, useRef: useLiveRef } = React;

// ============================================================
// LiveTimestamp — "Last refreshed at <relative>" pill with a green
// pulse dot.  Drives its own rerender every second so the relative
// string and ping animation stay alive.  Used by Action Dashboard,
// Home KPIs, and Entity Links header.  Production should wire this
// to the real last_refreshed_at from the read model.
// ============================================================
function useTicker(intervalMs = 1000) {
  const [, force] = useLiveState(0);
  useLiveEffect(() => {
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

function LiveCount({ value, color, tone, format = (n) => n }) {
  const prev = useLiveRef(value);
  const [bump, setBump] = useLiveState(false);
  useLiveEffect(() => {
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

// Expose
Object.assign(window, {
  useTicker, relativeFromNow, LiveTimestamp, LiveCount,
});
