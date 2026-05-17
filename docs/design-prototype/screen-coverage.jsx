// ============================================================
// FeedbackOps — Integration · Coverage
// Route: integration-coverage
// ============================================================
// Coverage tracks workflow-link presence between entities. The spec
// is intentionally vague about which links MUST exist; this screen
// surfaces the policy-defined coverage targets (CoverageMetrics) plus
// the "missing-link queries" from FR-LINK-003 so an operator can
// triage gaps. Read FR-LINK-003 + 08-dashboard-system.md before
// changing copy.
//
// Spec sources:
//   - docs/design/11-entity-linking.md  §FR-LINK-003
//   - docs/design/08-dashboard-system.md  (Dashboard groupings)
//   - docs/frontend/routes-and-layout.md  (/integration/coverage)
// ============================================================

// ------------------------------------------------------------
// Mock data — missing-link queries.
// Each row models a policy-defined "records without expected relation".
// `severity` here is the workflow risk, not VOC severity.
// ------------------------------------------------------------
const MISSING_LINK_QUERIES = [
  {
    id: 'mlq-voc-task',
    label: 'VOC missing executing Task',
    desc: 'Active VOC with no entity_link to a Task in any state. Reporter status ≥ assigned.',
    count: 184,
    severity: 'warn',
    targetRoute: 'voc',
  },
  {
    id: 'mlq-finding-task',
    label: 'Active Finding without execution',
    desc: 'Finding in `active` with no linked Task or Task Request.',
    count: 8,
    severity: 'bad',
    targetRoute: 'findings',
  },
  {
    id: 'mlq-task-finding',
    label: 'Standalone Task (no source)',
    desc: 'Task created directly without VOC/Finding evidence. Allowed by policy but flagged for review.',
    count: 12,
    severity: 'warn',
    targetRoute: 'tasks',
  },
  {
    id: 'mlq-milestone-outcome',
    label: 'Released milestone without outcome survey',
    desc: 'Milestone reached release without an Outcome survey result attached.',
    count: 25,
    severity: 'bad',
    targetRoute: 'tasks',
  },
  {
    id: 'mlq-released-unresolved',
    label: 'Released Task with unresolved VOC',
    desc: 'Task released but linked VOC reporter-facing status is not resolved.',
    count: 3,
    severity: 'bad',
    targetRoute: 'tasks',
  },
  {
    id: 'mlq-stale-link',
    label: 'Stale entity links',
    desc: 'entity_link not touched in 90+ days while both endpoints are still active.',
    count: 17,
    severity: 'warn',
    targetRoute: 'integration-links',
  },
];

function MissingLinkRow({ q, onAct }) {
  const sevColor =
    q.severity === 'bad' ? 'var(--color-warning-red)' :
    q.severity === 'warn' ? 'var(--color-amber)' :
    'var(--text-muted)';
  return (
    <div className="object-row" style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
      <span className="hstack" style={{
        width: 28, height: 28, borderRadius: 6,
        background: `color-mix(in oklab, ${sevColor} 12%, transparent)`,
        color: sevColor,
        justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={q.severity === 'bad' ? 'alert' : 'pulse'} size={13} />
      </span>
      <div className="row-body">
        <div className="row-title">
          <span>{q.label}</span>
        </div>
        <div className="row-meta">
          <span style={{ lineHeight: 1.5 }}>{q.desc}</span>
        </div>
      </div>
      <div className="row-trailing vstack" style={{ gap: 0, alignItems: 'flex-end' }}>
        <span className="text-lg tabular" style={{ fontWeight: 600, color: sevColor }}>{q.count}</span>
        <span className="text-xs muted">records</span>
      </div>
      <div className="row-trailing">
        <Button variant="subtle" size="sm" onClick={() => onAct && onAct(q.targetRoute)}>
          <Icon name="arrowRight" size={11} />Open
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Threshold edit modal — opens from the per-policy Edit button.
// Lets an admin adjust the good/warn cutoffs for a coverage metric.
// Pure mock; live state goes back to a parent useState.
// ------------------------------------------------------------
function ThresholdEditModal({ metric, onClose, onSave }) {
  const initial = window.COVERAGE_THRESHOLDS?.[metric.id] || { good: 65, warn: 45 };
  const [good, setGood] = useState(initial.good);
  const [warn, setWarn] = useState(initial.warn);
  const valid = good > warn && good <= 100 && warn >= 0;

  const handleSave = () => {
    if (!valid) return;
    onSave(metric.id, { good, warn });
    onClose();
  };

  // Preview band visualization at the current good/warn cutoffs
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      zIndex: 200,
      display: 'grid', placeItems: 'center',
      padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="vstack" style={{
        width: 'min(520px, 100%)',
        background: 'var(--surface-popover)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-xl)',
        padding: 0, gap: 0,
      }}>
        <div className="hstack" style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 10, alignItems: 'center',
        }}>
          <span className="hstack" style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'rgba(2,184,204,0.12)', color: 'var(--color-cyan-spark)',
            justifyContent: 'center',
          }}>
            <Icon name="settings" size={13} />
          </span>
          <div className="vstack" style={{ gap: 0, flex: 1 }}>
            <span className="text-sm" style={{ fontWeight: 600 }}>Edit thresholds</span>
            <span className="text-xs muted">{metric.label}</span>
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
        </div>

        <div className="vstack" style={{ padding: 18, gap: 16 }}>
          <div className="text-xs muted" style={{ lineHeight: 1.5 }}>
            현재 값 <strong style={{ color: 'var(--text-primary)' }}>{metric.percent}%</strong>
            ({metric.value.toLocaleString()} / {metric.total.toLocaleString()}) ·
            policy <span className="mono" style={{ color: 'var(--text-secondary)' }}>{metric.id}</span>
          </div>

          {/* Visual band */}
          <div style={{
            position: 'relative',
            height: 28, borderRadius: 4,
            background: 'linear-gradient(90deg, var(--color-warning-red) 0%, var(--color-warning-red) ' + warn + '%, var(--color-amber) ' + warn + '%, var(--color-amber) ' + good + '%, var(--color-emerald) ' + good + '%, var(--color-emerald) 100%)',
          }}>
            <div style={{
              position: 'absolute',
              left: `${metric.percent}%`,
              top: -2, bottom: -2,
              width: 2,
              background: 'var(--text-primary)',
              boxShadow: '0 0 0 2px var(--surface-popover)',
            }} />
          </div>
          <div className="hstack text-xs muted" style={{ justifyContent: 'space-between' }}>
            <span>0%</span>
            <span>현재 {metric.percent}%</span>
            <span>100%</span>
          </div>

          {/* Inputs */}
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="vstack" style={{ gap: 4 }}>
              <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Warn cutoff
              </span>
              <div className="hstack" style={{ gap: 6 }}>
                <input type="number" min={0} max={100} value={warn}
                  onChange={(e) => setWarn(Number(e.target.value))}
                  style={modalInputStyle} />
                <span className="text-sm muted">%</span>
              </div>
              <span className="text-xs muted">이 값 미만이면 <strong style={{ color: 'var(--color-warning-red)' }}>bad</strong> 로 분류.</span>
            </div>
            <div className="vstack" style={{ gap: 4 }}>
              <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Good cutoff
              </span>
              <div className="hstack" style={{ gap: 6 }}>
                <input type="number" min={0} max={100} value={good}
                  onChange={(e) => setGood(Number(e.target.value))}
                  style={modalInputStyle} />
                <span className="text-sm muted">%</span>
              </div>
              <span className="text-xs muted">이 값 이상이면 <strong style={{ color: 'var(--color-emerald)' }}>good</strong> 로 분류.</span>
            </div>
          </div>

          {!valid && (
            <Callout tone="red" icon="alert" title="범위가 유효하지 않습니다">
              warn &lt; good 이어야 하며 두 값은 0–100% 사이여야 합니다.
            </Callout>
          )}
        </div>

        <div className="hstack" style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border-subtle)',
          gap: 8, justifyContent: 'flex-end',
        }}>
          <Button variant="subtle" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!valid}>
            <Icon name="check" size={11} />Save thresholds
          </Button>
        </div>
      </div>
    </div>
  );
}

const modalInputStyle = {
  flex: 1,
  padding: '8px 10px',
  background: 'var(--color-pitch-black)',
  border: 'none', borderRadius: 6,
  boxShadow: 'inset 0 0 0 1px var(--border-strong)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit', fontSize: 'var(--text-sm)',
  outline: 'none',
};

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
function CoverageScreen({ scope, onNavigate }) {
  const [thresholds, setThresholds] = useState(() => {
    // bootstrap from any prior modal saves stashed on window
    return window.COVERAGE_THRESHOLDS || {};
  });
  const [editingMetric, setEditingMetric] = useState(null);

  const saveThresholds = (id, next) => {
    const merged = { ...thresholds, [id]: next };
    setThresholds(merged);
    window.COVERAGE_THRESHOLDS = merged;
  };

  // Apply user-edited thresholds to the metric's `status` so the bar
  // colors react live to changes.
  const metrics = window.CoverageMetrics.map(c => {
    const t = thresholds[c.id];
    if (!t) return c;
    const status = c.percent >= t.good ? 'good' : c.percent >= t.warn ? 'warn' : 'bad';
    return { ...c, status, _threshold: t };
  });

  const avgCoverage = Math.round(
    metrics.reduce((a, c) => a + c.percent, 0) / metrics.length
  );
  const missingTotal = MISSING_LINK_QUERIES.reduce((a, q) => a + q.count, 0);
  const staleCount = MISSING_LINK_QUERIES.find(q => q.id === 'mlq-stale-link')?.count ?? 0;

  return (
    <PageShell
      title="Coverage"
      subtitle="VOC → Task · Finding → Execution · Milestone → Outcome 같이 워크플로 단절을 임계값으로 추적합니다. 모든 미연결 레코드를 결함으로 보지는 않습니다 — 정책이 요구하는 관계만 surfacing 됩니다."
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="subtle" size="sm" icon="refresh">Refresh</Button>
      </>}>

      {/* KPI strip */}
      <div className="grid-3" style={{ marginBottom: 28 }}>
        <KpiCard
          label="Average coverage"
          value={`${avgCoverage}%`}
          tone={avgCoverage >= 65 ? 'success' : avgCoverage >= 45 ? 'warn' : 'danger'}
          sub={`${metrics.length} policies`} />
        <KpiCard
          label="Records missing expected link"
          value={missingTotal.toLocaleString()}
          tone="warn"
          sub={`${MISSING_LINK_QUERIES.length} queries`} />
        <KpiCard
          label="Stale links"
          value={staleCount}
          tone={staleCount > 10 ? 'warn' : 'default'}
          sub="not touched in 90+ days" />
      </div>

      {/* Policy-defined coverage signals — each row Edit-able */}
      <PanelSectionTitle action={<Button variant="subtle" size="sm" icon="plus">New policy</Button>}>
        Coverage signals
      </PanelSectionTitle>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        {metrics.map((c, i) => (
          <div key={c.id} style={{
            padding: '14px 16px',
            borderBottom: i < metrics.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            display: 'grid', gridTemplateColumns: '1fr 90px 1fr 90px 70px', gap: 16, alignItems: 'center',
          }}>
            <div className="vstack" style={{ gap: 2, minWidth: 0 }}>
              <span className="text-sm" style={{ fontWeight: 500 }}>{c.label}</span>
              <span className="text-xs muted mono">
                {c.id}
                {c._threshold && (
                  <span style={{ marginLeft: 6, color: 'var(--color-neon-lime)' }}>
                    · custom thresholds
                  </span>
                )}
              </span>
            </div>
            <div className="text-xs tabular muted" style={{ textAlign: 'right' }}>
              {c.value.toLocaleString()} / {c.total.toLocaleString()}
            </div>
            <CoverageBar percent={c.percent} status={c.status} />
            <span className="text-sm tabular" style={{
              fontWeight: 600,
              textAlign: 'right',
              color: c.status === 'good' ? 'var(--text-success)' :
                c.status === 'warn' ? 'var(--text-warning)' : 'var(--text-danger)',
            }}>{c.percent}%</span>
            <Button variant="subtle" size="sm" onClick={() => setEditingMetric(c)}>
              <Icon name="settings" size={11} />Edit
            </Button>
          </div>
        ))}
      </div>

      {/* Missing-link queries — FR-LINK-003 */}
      <PanelSectionTitle action={<span className="text-xs muted">{missingTotal.toLocaleString()} records · {MISSING_LINK_QUERIES.length} queries</span>}>
        Missing-link queries
      </PanelSectionTitle>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {MISSING_LINK_QUERIES.map(q => (
          <MissingLinkRow key={q.id} q={q} onAct={onNavigate} />
        ))}
      </div>

      <Callout tone="blue" icon="shield" title="Coverage 는 결함이 아닙니다">
        모든 미연결 레코드를 문제로 표시하지 않습니다. workspace · Managed System ·
        severity · 명시적 워크플로 정책이 요구하는 관계만 missing-link 로 보고됩니다
        (FR-LINK-003). 임계값과 정책은 admin · workspace settings 에서 관리합니다.
      </Callout>

      {editingMetric && (
        <ThresholdEditModal
          metric={editingMetric}
          onClose={() => setEditingMetric(null)}
          onSave={saveThresholds}
        />
      )}
    </PageShell>
  );
}

// Local KPI card — promote to components.jsx if Integration adopts more KPI strips.
function KpiCard({ label, value, sub, tone = 'default' }) {
  const valueColor =
    tone === 'success' ? 'var(--text-success)' :
    tone === 'warn'    ? 'var(--text-warning)' :
    tone === 'danger'  ? 'var(--text-danger)' :
    'var(--text-primary)';
  return (
    <div className="card vstack" style={{ padding: 14, gap: 4 }}>
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span className="text-xl tabular" style={{ fontWeight: 600, color: valueColor }}>{value}</span>
      {sub && <span className="text-xs muted">{sub}</span>}
    </div>
  );
}

Object.assign(window, { CoverageScreen, MISSING_LINK_QUERIES });
