// ============================================================
// FeedbackOps — Milestone / Task Gantt visualization
// ============================================================
// Pure visualization atoms split out of `screen-milestones.jsx` to keep
// the screen file under the line-count budget. Loaded BEFORE
// `screen-milestones.jsx` in FeedbackOps.html so the screen can reference
// `MilestoneMiniTimeline`, `TaskGantt`, and `milestoneTaskRows` directly.
//
// Components / data:
//   - TASK_SCHEDULES         mock { start, end } per task id
//   - TASK_BAR_COLORS        status → bar fill/track/label palette
//   - TASK_GANTT_TODAY       "today" anchor (prototype-only)
//   - milestoneTaskRows(m)   joins window.Tasks + plannedTasks + schedules
//   - MilestoneMiniTimeline  thin 200px per-row scan affordance
//   - TaskGantt              full per-milestone Gantt rendered inside
//                            the Milestone Detail Timeline section

// ------------------------------------------------------------
// Task schedules — mocked start/end for tasks linked to milestones
// ------------------------------------------------------------
const TASK_SCHEDULES = {
  'TASK-902': { start: '2026-05-10', end: '2026-06-05' },
  'TASK-901': { start: '2026-05-04', end: '2026-05-25' },
  'TASK-900': { start: '2026-05-12', end: '2026-05-20' },
  'TASK-899': { start: '2026-05-22', end: '2026-06-15' },
  'TASK-898': { start: '2026-06-10', end: '2026-07-04' },
  'TASK-880': { start: '2026-04-18', end: '2026-04-30' },
  'TASK-879': { start: '2026-04-08', end: '2026-04-22' },
};

const TASK_BAR_COLORS = {
  backlog:  { fill: 'var(--text-muted)',          track: 'rgba(138,143,152,0.16)', label: 'var(--text-primary)' },
  todo:     { fill: 'var(--color-storm-cloud)',   track: 'rgba(138,143,152,0.18)', label: 'var(--text-primary)' },
  doing:    { fill: 'var(--color-aether-blue)',   track: 'rgba(94,106,210,0.18)',  label: 'white' },
  review:   { fill: 'var(--color-amber)',         track: 'rgba(242,196,109,0.18)', label: 'var(--color-pitch-black)' },
  done:     { fill: 'var(--color-emerald)',       track: 'rgba(39,166,68,0.18)',   label: 'white' },
  released: { fill: 'var(--color-emerald)',       track: 'rgba(39,166,68,0.18)',   label: 'white' },
  reopened: { fill: 'var(--color-warning-red)',   track: 'rgba(235,87,87,0.18)',   label: 'white' },
  planned:  { fill: 'transparent',                track: 'rgba(138,143,152,0.08)', label: 'var(--text-muted)' },
};

// Prototype "today" anchor. Move to a shared clock helper once any
// other date-aware screen is added (see HANDOFF §13 known follow-up).
const TASK_GANTT_TODAY = new Date('2026-05-15');

// ------------------------------------------------------------
// Join helper — produces uniform task rows for both the mini-timeline
// and the full TaskGantt. Planned tasks (un-created) appear as dashed
// outline bars.
// ------------------------------------------------------------
function milestoneTaskRows(m) {
  const real = (m.taskIds || []).map(id => {
    const t = window.taskById(id);
    if (!t) return null;
    const s = TASK_SCHEDULES[id] || { start: m.startDate, end: m.target };
    return { ...t, startDate: s.start, endDate: s.end, isPlanned: false };
  }).filter(Boolean);
  const planned = (m.plannedTasks || []).map(p => ({
    ...p, status: 'planned', priority: 'medium', estimate: '—',
    updatedAt: '—', assignee: null, isPlanned: true,
  }));
  return [...real, ...planned].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

// ------------------------------------------------------------
// Milestone mini-timeline — used in the list row.
// "compact list rows with a mini timeline for schedule risk scanning"
//   — docs/frontend/routes-and-layout.md · interaction-patterns.md
// Renders milestone date range + each task as a thin bar + today line.
// Lanes: up to 3 stacked so overlapping tasks stay visible.
// ------------------------------------------------------------
function MilestoneMiniTimeline({ m }) {
  const start = new Date(m.startDate);
  const end   = new Date(m.target);
  const totalMs = end - start;
  const todayPct = ((TASK_GANTT_TODAY - start) / totalMs) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;
  const pct = (d) => Math.max(0, Math.min(100, ((new Date(d) - start) / totalMs) * 100));
  const rows = milestoneTaskRows(m);

  const lanes = [[]];
  rows.forEach(t => {
    const lane = lanes.find(l => l.every(b => new Date(b.endDate) <= new Date(t.startDate)));
    if (lane) lane.push(t);
    else if (lanes.length < 3) lanes.push([t]);
    else lanes[lanes.length - 1].push(t);
  });
  while (lanes.length < 2) lanes.push([]);

  return (
    <div
      title={`${m.startDate} → ${m.target} · ${rows.length} tasks`}
      style={{
        width: 200, minWidth: 200, position: 'relative',
        background: 'var(--color-pitch-black)',
        borderRadius: 4, boxShadow: 'var(--shadow-subtle)',
        padding: '6px 8px', alignSelf: 'center',
      }}>
      <div className="hstack" style={{
        justifyContent: 'space-between',
        fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        marginBottom: 4,
      }}>
        <span>{m.startDate.slice(5)}</span>
        <span>{m.target.slice(5)}</span>
      </div>

      <div className="vstack" style={{ gap: 2, position: 'relative' }}>
        {showToday && (
          <span style={{
            position: 'absolute', left: `${todayPct}%`, top: -2, bottom: -2,
            width: 1.5, background: 'var(--color-neon-lime)', opacity: 0.75,
            transform: 'translateX(-0.75px)', zIndex: 1,
          }} />
        )}
        {lanes.map((lane, li) => (
          <div key={li} style={{ position: 'relative', height: 6 }}>
            {lane.map((t, i) => {
              const left = pct(t.startDate);
              const right = pct(t.endDate);
              const width = Math.max(1.5, right - left);
              const c = TASK_BAR_COLORS[t.status] || TASK_BAR_COLORS.backlog;
              const isPlanned = t.isPlanned;
              return (
                <span key={`${li}-${i}`}
                  title={`${t.id} · ${t.title} · ${t.status}`}
                  style={{
                    position: 'absolute', left: `${left}%`, width: `${width}%`,
                    top: 0, bottom: 0, borderRadius: 2,
                    background: isPlanned ? 'transparent' : c.fill,
                    border: isPlanned ? `1px dashed var(--text-muted)` : 'none',
                    opacity: isPlanned ? 0.7 : 0.9,
                  }} />
              );
            })}
            {lane.length === 0 && (
              <span style={{
                position: 'absolute', inset: 0,
                background: 'rgba(138,143,152,0.06)', borderRadius: 2,
              }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// TaskGantt — full per-milestone Gantt rendered inside the Milestone
// Detail Timeline section. Auto-scales the date axis to the milestone's
// `startDate → target` range with weekly ticks; today line; status-colored
// bars with progress fill; dashed outline for planned (un-created) tasks.
// ------------------------------------------------------------
function TaskGantt({ milestone, rows }) {
  // Padded range — 1 day before start, 1 day after target
  const start = new Date(new Date(milestone.startDate).getTime() - 86400000);
  const end   = new Date(new Date(milestone.target).getTime() + 86400000);
  const totalMs = end - start;
  const todayPct = ((TASK_GANTT_TODAY - start) / totalMs) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  const pct = (d) => Math.max(0, Math.min(100, ((new Date(d) - start) / totalMs) * 100));

  // Build a date axis — every 7 days between start and end
  const ticks = [];
  const cur = new Date(start);
  while (cur <= end) {
    ticks.push(new Date(cur));
    cur.setTime(cur.getTime() + 7 * 86400000);
  }
  if (ticks[ticks.length - 1] < end) ticks.push(new Date(end));

  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div style={{
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-subtle)',
      padding: 12,
    }}>
      <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="text-xs muted mono">{milestone.startDate} → {milestone.target}</span>
        {showToday && (
          <span className="text-xs" style={{ color: 'var(--color-neon-lime)', fontWeight: 600 }}>
            Today
          </span>
        )}
      </div>

      <div style={{ position: 'relative', height: 22, marginBottom: 6 }}>
        {ticks.map((t, i) => {
          const l = pct(t);
          return (
            <span key={i} className="hstack">
              <span style={{
                position: 'absolute', left: `${l}%`, top: 12, bottom: 0,
                width: 1, background: 'var(--border-subtle)', opacity: 0.6,
              }} />
              {(ticks.length <= 7 || i % 2 === 0) && (
                <span style={{
                  position: 'absolute', left: `${l}%`,
                  transform: 'translateX(-50%)',
                  top: 0, fontSize: 10, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                }}>
                  {fmt(t)}
                </span>
              )}
            </span>
          );
        })}
        {showToday && (
          <span style={{
            position: 'absolute', left: `${todayPct}%`,
            top: 0, bottom: -2, width: 2,
            background: 'var(--color-neon-lime)', opacity: 0.7,
            transform: 'translateX(-1px)',
          }} />
        )}
      </div>

      <div className="vstack" style={{ gap: 8 }}>
        {rows.length === 0 && (
          <div className="text-xs muted" style={{ padding: '12px 0', textAlign: 'center' }}>
            아직 연결된 Task 가 없습니다.
          </div>
        )}
        {rows.map((t, i) => {
          const left = pct(t.startDate);
          const right = pct(t.endDate);
          const width = Math.max(2, right - left);
          const c = TASK_BAR_COLORS[t.status] || TASK_BAR_COLORS.backlog;
          const isPlanned = t.isPlanned;
          const isDone = t.status === 'released' || t.status === 'done';
          let fillPct;
          if (isDone) fillPct = 100;
          else if (isPlanned) fillPct = 0;
          else {
            const tStart = new Date(t.startDate).getTime();
            const tEnd = new Date(t.endDate).getTime();
            const today = TASK_GANTT_TODAY.getTime();
            fillPct = today <= tStart ? 0 : today >= tEnd ? 100 : Math.round(((today - tStart) / (tEnd - tStart)) * 100);
          }
          const showLabelInside = width > 28;
          const assignee = t.assignee ? window.userById(t.assignee) : null;

          return (
            <div key={t.id || i} style={{ position: 'relative', height: 40 }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                background: 'var(--color-pitch-black)',
                borderRadius: 6, boxShadow: 'var(--shadow-subtle)',
              }} />
              {showToday && (
                <span style={{
                  position: 'absolute', left: `${todayPct}%`,
                  top: 4, bottom: 4, width: 1,
                  background: 'var(--color-neon-lime)', opacity: 0.35,
                }} />
              )}
              <div
                title={`${t.id || ''} · ${t.startDate} → ${t.endDate}`}
                style={{
                  position: 'absolute',
                  left: `${left}%`, width: `${width}%`,
                  top: 4, bottom: 4,
                  background: c.track,
                  borderRadius: 5,
                  boxShadow: isPlanned
                    ? `var(--text-muted) 0 0 0 1px inset`
                    : `${c.fill} 0 0 0 1px inset`,
                  borderStyle: isPlanned ? 'dashed' : 'solid',
                  borderWidth: isPlanned ? 1 : 0,
                  borderColor: 'var(--text-muted)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${fillPct}%`,
                  background: c.fill, opacity: 0.85,
                }} />
                {showLabelInside && (
                  <span className="hstack" style={{
                    position: 'relative', zIndex: 1, gap: 6,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    width: '100%',
                  }}>
                    <span className="mono" style={{
                      fontSize: 10, fontWeight: 600,
                      color: isPlanned ? 'var(--text-muted)' : c.label,
                      flexShrink: 0,
                    }}>{t.id}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: isPlanned ? 'var(--text-muted)' : c.label,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      flex: 1, minWidth: 0,
                    }}>{t.title}</span>
                    {!isPlanned && assignee && (
                      <Avatar user={assignee} size="sm" />
                    )}
                  </span>
                )}
              </div>
              {!showLabelInside && (
                <span style={{
                  position: 'absolute',
                  left: `calc(${right}% + 6px)`,
                  top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}>
                  <span className="mono" style={{ marginRight: 6 }}>{t.id}</span>{t.title}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="hstack" style={{
        marginTop: 10, paddingTop: 10, gap: 12,
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap',
      }}>
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--color-aether-blue)' }} />Doing
        </span>
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--color-amber)' }} />Review
        </span>
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--color-emerald)' }} />Done/Released
        </span>
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--text-muted)' }} />Todo/Backlog
        </span>
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 10, height: 6, borderRadius: 2, border: '1px dashed var(--text-muted)', background: 'transparent' }} />Planned
        </span>
      </div>
    </div>
  );
}

Object.assign(window, {
  TASK_SCHEDULES, TASK_BAR_COLORS, TASK_GANTT_TODAY,
  milestoneTaskRows, MilestoneMiniTimeline, TaskGantt,
});
