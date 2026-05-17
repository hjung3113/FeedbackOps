// ============================================================
// FeedbackOps — Tasks · Roadmap
// Route: tasks (view: roadmap)
// ============================================================
// Multi-milestone TaskGantt — stacks the per-milestone Gantt rows from
// `screen-milestone-gantt.jsx` into a single horizontally-shared
// timeline so ops can scan cross-milestone schedule risk in one view.
//
// Spec sources:
//   - docs/design/06-task-project-system.md  (FR-TASK-005 Cross-MS roadmap)
//   - docs/frontend/routes-and-layout.md      (/tasks/roadmap)
//
// Pack 10 — built on top of the same atoms used inside the per-milestone
// Timeline section (`milestoneTaskRows`, `TASK_BAR_COLORS`, `TASK_GANTT_TODAY`)
// so visual vocabulary doesn't fork.
// ============================================================

const {
  milestoneTaskRows: _rowsForMilestone,
  TASK_BAR_COLORS: ROADMAP_BAR_COLORS,
  TASK_GANTT_TODAY: ROADMAP_TODAY,
} = window;

// Group color for the milestone header strip — keyed by status.  Matches
// MILESTONE_STATUS_META in screen-milestones.jsx (kept inline rather than
// imported to avoid load-order coupling).
const ROADMAP_STATUS_META = {
  planning:    { color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.12)' },
  in_progress: { color: 'var(--color-aether-blue)', bg: 'rgba(94,106,210,0.12)' },
  blocked:     { color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)' },
  released:    { color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.12)' },
};

// ------------------------------------------------------------
// Pure helpers — compute the shared roadmap range + weekly tick axis.
// ------------------------------------------------------------
function roadmapRange(milestones) {
  if (milestones.length === 0) {
    return { start: ROADMAP_TODAY, end: new Date(ROADMAP_TODAY.getTime() + 30 * 86400000) };
  }
  const starts = milestones.map(m => new Date(m.startDate).getTime());
  const ends   = milestones.map(m => new Date(m.target).getTime());
  // 7-day pad so labels at the edges don't crash into the axis.
  return {
    start: new Date(Math.min(...starts) - 7 * 86400000),
    end:   new Date(Math.max(...ends)   + 7 * 86400000),
  };
}

function weeklyTicks(start, end) {
  const ticks = [];
  const cur = new Date(start);
  // Snap to Monday so the axis reads consistently
  while (cur.getDay() !== 1) cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    ticks.push(new Date(cur));
    cur.setTime(cur.getTime() + 7 * 86400000);
  }
  return ticks;
}

// ------------------------------------------------------------
// Roadmap row — one milestone laid against the shared axis.
// Renders the milestone band (start→target) plus its task bars
// stacked into lanes.  Up to 3 lanes per milestone before tasks
// overflow into the last lane (same lane-packing rule as the
// per-row mini-timeline).
// ------------------------------------------------------------
function RoadmapRow({ m, axisStart, axisEnd, onSelect, selected }) {
  const status = ROADMAP_STATUS_META[m.status] || ROADMAP_STATUS_META.planning;
  const owner = m.owner ? window.userById(m.owner) : null;
  const area = m.analyticsArea ? window.areaById(m.analyticsArea) : null;
  const rows = _rowsForMilestone(m);
  const total = axisEnd - axisStart;
  const pct = (d) => Math.max(0, Math.min(100, ((new Date(d) - axisStart) / total) * 100));

  // Lane-pack
  const lanes = [[]];
  rows.forEach(t => {
    const lane = lanes.find(l => l.every(b => new Date(b.endDate) <= new Date(t.startDate)));
    if (lane) lane.push(t);
    else if (lanes.length < 3) lanes.push([t]);
    else lanes[lanes.length - 1].push(t);
  });
  while (lanes.length < 2) lanes.push([]);

  const msLeft  = pct(m.startDate);
  const msWidth = Math.max(2, pct(m.target) - msLeft);
  const todayPct = ((ROADMAP_TODAY - axisStart) / total) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  return (
    <div
      onClick={() => onSelect && onSelect(m)}
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        gap: 0,
        borderBottom: '1px solid var(--border-subtle)',
        background: selected ? 'var(--surface-row-selected)' : 'transparent',
        cursor: onSelect ? 'pointer' : 'default',
      }}>
      {/* Left rail — milestone label + meta */}
      <div className="vstack" style={{
        padding: '12px 16px', gap: 4,
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--surface-canvas)',
        minWidth: 0,
      }}>
        <div className="hstack" style={{ gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
          <Icon name="flag" size={12} style={{ color: status.color, flexShrink: 0 }} />
          <span className="row-id" style={{ whiteSpace: 'nowrap' }}>{m.id}</span>
        </div>
        <span className="text-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{m.title}</span>
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: status.bg, color: status.color }}>
            <span className="badge-dot" />{m.status.replace('_', ' ')}
          </span>
          <ManagedSystemPill id={m.managedSystem} />
        </div>
        <div className="row-meta" style={{ gap: 8 }}>
          {area && <OutlineBadge>{area.name}</OutlineBadge>}
          {owner && <UserChip user={owner} size="sm" />}
        </div>
      </div>

      {/* Right — bars laid against shared axis */}
      <div style={{
        position: 'relative',
        padding: '12px 8px',
        minHeight: 80,
      }}>
        {/* Milestone band — soft band marking the date range */}
        <div title={`${m.startDate} → ${m.target}`}
          style={{
            position: 'absolute',
            left: `${msLeft}%`, width: `${msWidth}%`,
            top: 6, bottom: 6,
            background: status.bg,
            borderRadius: 6,
            boxShadow: `inset 0 0 0 1px ${status.color}40`,
          }} />

        {/* Today line */}
        {showToday && (
          <span style={{
            position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
            width: 1.5, background: 'var(--color-neon-lime)',
            opacity: 0.55, transform: 'translateX(-0.75px)',
            zIndex: 2,
          }} />
        )}

        {/* Task lanes */}
        <div className="vstack" style={{
          position: 'relative', gap: 4, zIndex: 1, height: '100%',
          justifyContent: 'center',
        }}>
          {lanes.map((lane, li) => (
            <div key={li} style={{ position: 'relative', height: 12 }}>
              {lane.map((t, i) => {
                const left = pct(t.startDate);
                const right = pct(t.endDate);
                const width = Math.max(0.6, right - left);
                const c = ROADMAP_BAR_COLORS[t.status] || ROADMAP_BAR_COLORS.backlog;
                const isPlanned = t.isPlanned;
                const isDone = t.status === 'released' || t.status === 'done';
                let fillPct;
                if (isDone) fillPct = 100;
                else if (isPlanned) fillPct = 0;
                else {
                  const tStart = new Date(t.startDate).getTime();
                  const tEnd = new Date(t.endDate).getTime();
                  const today = ROADMAP_TODAY.getTime();
                  fillPct = today <= tStart ? 0 : today >= tEnd ? 100
                    : Math.round(((today - tStart) / (tEnd - tStart)) * 100);
                }
                const showLabelInside = width > 8;
                return (
                  <span key={`${li}-${i}`}
                    title={`${t.id} · ${t.title || ''} · ${t.startDate} → ${t.endDate}`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`, width: `${width}%`,
                      top: 0, bottom: 0,
                      background: c.track,
                      borderRadius: 4,
                      boxShadow: isPlanned
                        ? `var(--text-muted) 0 0 0 1px inset`
                        : `${c.fill} 0 0 0 1px inset`,
                      borderStyle: isPlanned ? 'dashed' : 'solid',
                      borderWidth: isPlanned ? 1 : 0,
                      borderColor: 'var(--text-muted)',
                      overflow: 'hidden',
                      display: 'flex', alignItems: 'center',
                      padding: '0 6px',
                    }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${fillPct}%`, background: c.fill, opacity: 0.85,
                    }} />
                    {showLabelInside && (
                      <span className="mono" style={{
                        position: 'relative', zIndex: 1,
                        fontSize: 9, fontWeight: 600,
                        color: isPlanned ? 'var(--text-muted)' : c.label,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{t.id}</span>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// TasksRoadmapScreen — wraps the shared-axis Gantt + grouping/filter
// controls.  We keep this in its own route rather than embedding in
// the Milestones list so the wide horizontal axis gets real estate.
// ------------------------------------------------------------
function TasksRoadmapScreen({ scope, onNavigate }) {
  const all = window.Milestones || [];
  const filtered = all.filter(m => scope.members.includes(m.managedSystem));

  const [grouping, setGrouping] = useState('managed-system'); // 'managed-system' | 'status' | 'none'
  const [hideReleased, setHideReleased] = useState(false);
  // Pack 11 — in-place milestone detail via slide-over.  Production
  // should keep this state in URL (`?milestone=<id>`) so back-button
  // closes the panel; prototype keeps it local.
  const [selectedMilestone, setSelectedMilestone] = useState(null);

  const shown = hideReleased ? filtered.filter(m => m.status !== 'released') : filtered;
  const { start: axisStart, end: axisEnd } = roadmapRange(shown);
  const ticks = weeklyTicks(axisStart, axisEnd);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const todayPct = ((ROADMAP_TODAY - axisStart) / (axisEnd - axisStart)) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  // Grouping → list of [groupKey, label, milestones]
  const groups = useMemo(() => {
    if (grouping === 'none') return [[null, null, shown]];
    if (grouping === 'managed-system') {
      const map = new Map();
      shown.forEach(m => {
        const k = m.managedSystem;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(m);
      });
      return [...map.entries()].map(([k, ms]) => {
        const meta = window.msById(k);
        return [k, meta?.name || k, ms];
      });
    }
    if (grouping === 'status') {
      const order = ['in_progress', 'planning', 'blocked', 'released'];
      const map = new Map();
      shown.forEach(m => {
        const k = m.status;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(m);
      });
      return order.filter(k => map.has(k)).map(k => [k, k.replace('_', ' '), map.get(k)]);
    }
    return [[null, null, shown]];
  }, [grouping, shown]);

  // Aggregate counts for header
  const counts = {
    total: filtered.length,
    inFlight: filtered.filter(m => m.status === 'in_progress').length,
    released: filtered.filter(m => m.status === 'released').length,
    plannedTasks: filtered.reduce((a, m) => a + (m.plannedTasks?.length || 0), 0),
  };

  return (
    <>
    <PageShell
      title="Roadmap"
      subtitle="모든 Milestone 의 Task 일정을 한 축으로 비교합니다. Milestone Detail 의 Timeline 과 같은 시각 어휘를 쓰며, 가로 scroll 없이 cross-MS 일정 충돌을 스캔할 수 있어야 합니다."
      back={<Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => onNavigate('tasks', 'milestones')}>Milestones</Button>}
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate('tasks', 'milestones')}>
          New milestone
        </Button>
      </>}
      fluid>

      {/* Toolbar */}
      <div className="hstack" style={{
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
        padding: '12px 14px',
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-subtle)',
      }}>
        <div className="hstack" style={{ gap: 4 }}>
          <span className="text-xs muted" style={{ marginRight: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Group by</span>
          {[
            { key: 'managed-system', label: 'Managed system' },
            { key: 'status',         label: 'Status' },
            { key: 'none',           label: 'None' },
          ].map(opt => (
            <button key={opt.key}
              onClick={() => setGrouping(opt.key)}
              className={`btn btn-${grouping === opt.key ? 'primary' : 'subtle'} btn-sm`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: 'var(--border-subtle)' }} />
        <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideReleased}
            onChange={(e) => setHideReleased(e.target.checked)}
            style={{ accentColor: 'var(--color-neon-lime)' }} />
          <span className="text-xs">Released 숨기기</span>
        </label>
        <div style={{ flex: 1 }} />
        <span className="text-xs muted">
          <strong style={{ color: 'var(--text-secondary)' }}>{counts.total}</strong> milestones ·
          <strong style={{ color: 'var(--color-aether-blue)', marginLeft: 6 }}>{counts.inFlight}</strong> in flight ·
          <strong style={{ color: 'var(--color-emerald)',     marginLeft: 6 }}>{counts.released}</strong> released ·
          <strong style={{ color: 'var(--text-muted)',        marginLeft: 6 }}>{counts.plannedTasks}</strong> planned tasks
        </span>
      </div>

      {/* Roadmap chart */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Date-axis header — sticky so it survives long lists.  Two columns
            mirroring the row grid: left rail label space + shared axis. */}
        <div style={{
          display: 'grid', gridTemplateColumns: '260px 1fr',
          gap: 0,
          position: 'sticky', top: 0, zIndex: 5,
          background: 'var(--surface-canvas)',
          borderBottom: '1px solid var(--border-strong)',
        }}>
          <div className="hstack" style={{
            padding: '8px 16px', gap: 6,
            borderRight: '1px solid var(--border-subtle)',
          }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Milestone
            </span>
          </div>
          <div style={{ position: 'relative', height: 32, padding: '6px 8px' }}>
            {ticks.map((t, i) => {
              const l = ((t - axisStart) / (axisEnd - axisStart)) * 100;
              return (
                <span key={i}>
                  <span style={{
                    position: 'absolute', left: `${l}%`, top: 14, bottom: 0,
                    width: 1, background: 'var(--border-subtle)', opacity: 0.6,
                  }} />
                  {(ticks.length <= 10 || i % 2 === 0) && (
                    <span style={{
                      position: 'absolute', left: `${l}%`,
                      transform: 'translateX(-50%)', top: 4,
                      fontSize: 10, color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                    }}>{fmt(t)}</span>
                  )}
                </span>
              );
            })}
            {showToday && (
              <span style={{
                position: 'absolute', left: `${todayPct}%`,
                top: 0, bottom: -1, width: 2,
                background: 'var(--color-neon-lime)', opacity: 0.7,
                transform: 'translateX(-1px)',
              }} />
            )}
            {showToday && (
              <span style={{
                position: 'absolute',
                left: `calc(${todayPct}% + 4px)`,
                top: 4,
                fontSize: 10, color: 'var(--color-neon-lime)',
                fontWeight: 600, letterSpacing: '0.04em',
              }}>TODAY</span>
            )}
          </div>
        </div>

        {/* Grouped rows */}
        {groups.map(([key, label, ms]) => (
          <div key={key || 'none'}>
            {label && (
              <div className="hstack" style={{
                padding: '8px 16px', gap: 8,
                background: 'var(--color-pitch-black)',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                {grouping === 'managed-system' && <ManagedSystemPill id={key} />}
                {grouping === 'status' && (
                  <span className="badge" style={{
                    background: (ROADMAP_STATUS_META[key] || ROADMAP_STATUS_META.planning).bg,
                    color:      (ROADMAP_STATUS_META[key] || ROADMAP_STATUS_META.planning).color,
                  }}>
                    <span className="badge-dot" />{label}
                  </span>
                )}
                <span className="text-xs muted">· {ms.length} {ms.length === 1 ? 'milestone' : 'milestones'}</span>
              </div>
            )}
            {ms.map(m => (
              <RoadmapRow key={m.id} m={m}
                axisStart={axisStart} axisEnd={axisEnd}
                selected={selectedMilestone?.id === m.id}
                onSelect={setSelectedMilestone} />
            ))}
          </div>
        ))}

        {shown.length === 0 && (
          <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>
            표시할 milestone 이 없습니다. Filter 또는 scope 를 조정해보세요.
          </div>
        )}

        {/* Legend — same vocabulary as TaskGantt */}
        <div className="hstack" style={{
          padding: '10px 16px', gap: 14, flexWrap: 'wrap',
          background: 'var(--surface-canvas)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 10, color: 'var(--text-muted)',
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
          <span className="hstack" style={{ gap: 5 }}>
            <span style={{ width: 2, height: 12, background: 'var(--color-neon-lime)', opacity: 0.7 }} />Today
          </span>
        </div>
      </div>
    </PageShell>
    {selectedMilestone && (
      <MilestoneRoadmapSlideOver
        milestone={selectedMilestone}
        onClose={() => setSelectedMilestone(null)}
        onNavigate={onNavigate}
      />
    )}
    </>
  );
}

// ------------------------------------------------------------
// MilestoneRoadmapSlideOver — opens MilestoneDetailPanel as a fixed
// overlay so the user can dive into a milestone from the roadmap
// without losing roadmap context.  The MilestoneDetailPanel render
// (the `<aside class="detail-panel">`) is style-agnostic to its
// container, so we just constrain width here and let the panel handle
// its own internal layout.  Pack 11.
// ------------------------------------------------------------
function MilestoneRoadmapSlideOver({ milestone, onClose, onNavigate }) {
  // Esc-to-close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8,9,10,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 400,
        display: 'grid',
        gridTemplateColumns: '1fr min(640px, 60vw)',
      }}>
      <div />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-detail)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column',
          animation: 'cmdk-rise 140ms ease-out',
          overflow: 'hidden',
        }}>
        <window.MilestoneDetailPanel
          m={milestone}
          onClose={onClose}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

Object.assign(window, { TasksRoadmapScreen });
