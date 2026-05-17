// ============================================================
// FeedbackOps — Integration Action Dashboard
// Split from screen-other.jsx (Pack 19) for Rule 2 compliance.
// ============================================================

function IntegrationScreen({ onNavigate, scope }) {
  // Pack 10 — Action Dashboard live counts.  Shared hook with HomeScreen
  // so the gap-totals stay consistent across the two surfaces.
  const { counts: liveCounts, refreshedAt } = window.useLiveActionCounts(window.ActionQueues);
  const totalGaps = window.ActionQueues.reduce((a, q) => a + (liveCounts[q.id] ?? q.count), 0);

  return (
    <PageShell
      title="Integration Action Dashboard"
      subtitle="VOC · Finding · Task · Survey 사이의 흐름이 끊긴 지점을 추적합니다. 차트가 아니라 다음 행동이 우선합니다."
      actions={<>
        <LiveTimestamp since={refreshedAt} label="Live" />
        <Button variant="subtle" size="sm" icon="refresh">Refresh</Button>
        <Button variant="primary" size="sm" icon="plus">Configure queue</Button>
      </>}>
      {/* Top action queues */}
      <PanelSectionTitle action={
        <span className="text-xs muted">
          <LiveCount value={totalGaps} /> gaps
        </span>
      }>
        Recovery queues
      </PanelSectionTitle>
      <div className="grid-3" style={{ marginBottom: 36 }}>
        {window.ActionQueues.map(q => (
          <ActionCard key={q.id} q={q} liveCount={liveCounts[q.id]} onAct={onNavigate} />
        ))}
      </div>

      {/* Cross-route jump cards — Coverage / Evidence / Links are
          dedicated routes per routes-and-layout.md §Integration.
          Action Dashboard provides the entry point only. */}
      <PanelSectionTitle>Integration surfaces</PanelSectionTitle>
      <div className="grid-3" style={{ marginBottom: 36 }}>
        <IntegrationJumpCard
          icon="layers" tone="cyan"
          title="Coverage"
          desc="VOC→Task · Finding→Execution · Milestone→Outcome 같이 워크플로 단절을 임계값으로 추적합니다."
          stat={`${Math.round(window.CoverageMetrics.reduce((a, c) => a + c.percent, 0) / window.CoverageMetrics.length)}%`}
          statLabel="avg coverage"
          onClick={() => onNavigate && onNavigate('integration-coverage')}
        />
        <IntegrationJumpCard
          icon="doc" tone="amethyst"
          title="Evidence"
          desc="VOC · Survey · Manual note 에서 추출한 근거 fragment. Finding/Task 와의 연결률을 함께 봅니다."
          stat="11"
          statLabel="evidence highlights"
          onClick={() => onNavigate && onNavigate('integration-evidence')}
        />
        <IntegrationJumpCard
          icon="link" tone="emerald"
          title="Entity links"
          desc="entity_links 테이블의 활성·stale·detached 상태와 cross-system 관계를 점검합니다."
          stat="34"
          statLabel="active links"
          onClick={() => onNavigate && onNavigate('integration-links')}
        />
      </div>

      {/* Managed system overview */}
      <PanelSectionTitle>Managed system overview</PanelSectionTitle>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>System</span>
          <span style={{ textAlign: 'right' }}>Open VOC</span>
          <span style={{ textAlign: 'right' }}>Findings</span>
          <span style={{ textAlign: 'right' }}>Tasks</span>
          <span style={{ textAlign: 'right' }}>Unassigned</span>
          <span style={{ textAlign: 'right' }}>Coverage</span>
        </div>
        {window.ManagedSystems.map(m => {
          const stats = ({
            tableau: { voc: 18, fn: 11, tk: 14, un: 5, cov: 72 },
            powerbi: { voc: 14, fn: 8, tk: 9, un: 3, cov: 64 },
            looker: { voc: 8, fn: 6, tk: 5, un: 2, cov: 49 },
            metabase: { voc: 7, fn: 6, tk: 3, un: 2, cov: 38 },
          })[m.id];
          return (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
              <span className="hstack" style={{ gap: 8 }}>
                <div className="scope-mark" style={{ width: 18, height: 18, background: m.color }}>{m.mark}</div>
                {m.name}
              </span>
              <span className="tabular" style={{ textAlign: 'right' }}>{stats.voc}</span>
              <span className="tabular" style={{ textAlign: 'right' }}>{stats.fn}</span>
              <span className="tabular" style={{ textAlign: 'right' }}>{stats.tk}</span>
              <span className="tabular" style={{ textAlign: 'right', color: stats.un > 3 ? 'var(--color-warning-red)' : 'var(--text-secondary)' }}>{stats.un}</span>
              <span style={{ textAlign: 'right' }}>
                <span className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <div style={{ width: 60 }}><CoverageBar percent={stats.cov} status={stats.cov > 65 ? 'good' : stats.cov > 45 ? 'warn' : 'bad'} /></div>
                  <span className="tabular text-xs muted" style={{ minWidth: 30 }}>{stats.cov}%</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

// Jump card for the Action Dashboard → Coverage / Evidence / Links.
// Kept inline because it's only used here.
function IntegrationJumpCard({ icon, tone, title, desc, stat, statLabel, onClick }) {
  const TONE = {
    cyan:     { bg: 'rgba(2,184,204,0.10)',   color: 'var(--color-cyan-spark)' },
    amethyst: { bg: 'rgba(139,92,246,0.10)',  color: 'var(--color-amethyst)' },
    emerald:  { bg: 'rgba(39,166,68,0.10)',   color: 'var(--color-emerald)' },
  }[tone] || { bg: 'rgba(138,143,152,0.10)', color: 'var(--text-secondary)' };
  return (
    <button className="card" onClick={onClick} style={{
      padding: 16, gap: 12, textAlign: 'left',
      border: 'none', cursor: 'pointer',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="hstack" style={{ gap: 10, alignItems: 'center' }}>
        <span className="hstack" style={{
          width: 32, height: 32, borderRadius: 8,
          background: TONE.bg, color: TONE.color,
          justifyContent: 'center',
        }}>
          <Icon name={icon} size={14} />
        </span>
        <div className="vstack" style={{ gap: 0, flex: 1 }}>
          <span className="text-sm" style={{ fontWeight: 600 }}>{title}</span>
          <span className="text-xs muted">{statLabel}</span>
        </div>
        <span className="text-lg tabular" style={{ fontWeight: 600 }}>{stat}</span>
      </div>
      <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{desc}</span>
      <div className="hstack" style={{ gap: 4, marginTop: 2 }}>
        <span className="text-xs" style={{ color: TONE.color, fontWeight: 600 }}>Open</span>
        <Icon name="arrowRight" size={10} style={{ color: TONE.color }} />
      </div>
    </button>
  );
}

Object.assign(window, { IntegrationScreen });
