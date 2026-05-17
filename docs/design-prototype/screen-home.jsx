// ============================================================
// FeedbackOps — Home (Action Dashboard)
// ============================================================

function ActionCard({ q, onAct, liveCount }) {
  const valueClass = q.severity === 'urgent' ? 'urgent' : q.severity === 'warn' ? 'warn' : '';
  const count = liveCount != null ? liveCount : q.count;
  return (
    <div className="action-card">
      <div className="action-card-header">
        <div className="vstack" style={{ gap: 4 }}>
          <h4 className="action-card-title">{q.reason}</h4>
          <p className="action-card-reason">{q.detail}</p>
        </div>
        <span className={`badge ${q.severity === 'urgent' ? 'badge-blocked' : ''}`} style={{
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 10,
          ...(q.severity === 'warn' && { color: 'var(--color-amber)', background: 'rgba(242,196,109,0.1)' }),
          ...(q.severity === 'info' && { color: 'var(--color-cyan-spark)', background: 'rgba(2,184,204,0.1)' }),
        }}>
          {q.severity === 'urgent' ? 'Recovery' : q.severity === 'warn' ? 'Follow-up' : 'Review'}
        </span>
      </div>
      <div className={`action-card-value ${valueClass}`}>
        <LiveCount value={count} />
      </div>
      <div className="action-card-footer">
        {q.secondary ? (
          <button className="btn btn-subtle btn-sm">{q.secondary}</button>
        ) : <span />}
        <Button variant="primary" size="sm" onClick={() => onAct(q.primaryAction.target)}>
          {q.primaryAction.label}
          <Icon name="arrowRight" size={11} />
        </Button>
      </div>
    </div>
  );
}

// Pack 10 — Action Dashboard live counts.  Production should hydrate
// from a server-sent-events stream of queue counts; this hook ticks
// every ~6s and drifts each queue's count by ±1 so the LiveCount
// component visibly pulses.  Stays deterministic per `id` modulo the
// random drift, so we don't churn the layout with re-sorts.
function useLiveActionCounts(queues, intervalMs = 6000) {
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(queues.map(q => [q.id, q.count])));
  useEffect(() => {
    const t = setInterval(() => {
      setCounts(prev => {
        const next = { ...prev };
        // bump one random queue by ±1 (clamped at 0)
        const pick = queues[Math.floor(Math.random() * queues.length)];
        const delta = Math.random() < 0.5 ? -1 : 1;
        next[pick.id] = Math.max(0, (prev[pick.id] ?? pick.count) + delta);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [queues, intervalMs]);
  // Refresh timestamp ticks once per real update so the LiveTimestamp
  // surface reflects "last refreshed" honestly.
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  useEffect(() => { setRefreshedAt(new Date()); }, [counts]);
  return { counts, refreshedAt };
}

function HomeScreen({ onNavigate }) {
  const me = window.userById('u-1');
  const myWork = [
    { id: 'w1', title: 'VOC-2809 — 매출 리포트 다운로드 속도', meta: '내가 담당 · 처리 중 · 2h 미응답', route: 'voc' },
    { id: 'w2', title: 'TASK-901 — 매출 리포트 쿼리 플랜 개선', meta: 'In Review · linked to FIN-179', route: 'tasks' },
    { id: 'w3', title: 'REQ-42 검토 결과 → Task 변환', meta: '내 검토 · Pending', route: 'tasks' },
    { id: 'w4', title: 'FIN-179 Outcome Survey 구성 필요', meta: 'Released 4일 경과', route: 'findings' },
  ];

  // Live queue counts — see useLiveActionCounts above.
  const { counts: liveCounts, refreshedAt } = useLiveActionCounts(window.ActionQueues);
  // KPI strip — independent live mock.  In production these tick off
  // the same SSE channel; we keep them seeded from queue counts so the
  // narrative ("8 pending = Permission queue card") stays consistent.
  const pendingRequest = liveCounts['q-permission'] ?? 2;
  const unassignedVoc  = liveCounts['q-unassigned-voc'] ?? 12;
  const kpis = {
    openVoc:         47 + (unassignedVoc - 12),
    activeFinding:   14,
    pendingRequest:  pendingRequest + 6, // permission + task request review
    tasksInFlight:   23,
    coverage:        67,
  };

  return (
    <PageShell
      title="안녕하세요, 지원님"
      subtitle="오늘 워크스페이스에 28개의 운영 갭이 있습니다. 우선순위가 높은 큐부터 확인하세요."
      actions={<>
        <Button variant="subtle" size="sm" icon="refresh">Refresh queues</Button>
        <Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate('voc-new')}>New VOC</Button>
      </>}>

      {/* KPI strip */}
      <div className="hstack gap-12" style={{ marginBottom: 28, flexWrap: 'wrap' }}>
        <div className="pill-stat"><span>Open VOC</span><span className="pill-value"><LiveCount value={kpis.openVoc} /></span></div>
        <div className="pill-stat"><span>Active Finding</span><span className="pill-value">{kpis.activeFinding}</span></div>
        <div className="pill-stat"><span>Pending Request</span><span className="pill-value tabular" style={{ color: 'var(--color-amber)' }}><LiveCount value={kpis.pendingRequest} color="var(--color-amber)" /></span></div>
        <div className="pill-stat"><span>Tasks In Flight</span><span className="pill-value">{kpis.tasksInFlight}</span></div>
        <div className="pill-stat"><span>Coverage</span><span className="pill-value">{kpis.coverage}%</span></div>
        <div style={{ flex: 1 }} />
        <LiveTimestamp since={refreshedAt} label="Live" />
      </div>

      {/* Action queues */}
      <PanelSectionTitle action={<button className="btn btn-subtle btn-sm">Configure queues</button>}>
        Recovery & follow-up queues
      </PanelSectionTitle>
      <div className="grid-4" style={{ marginBottom: 36 }}>
        {window.ActionQueues.map(q => (
          <ActionCard key={q.id} q={q} liveCount={liveCounts[q.id]} onAct={onNavigate} />
        ))}
      </div>

      {/* Two-column: My work + Coverage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28 }}>
        <section>
          <PanelSectionTitle action={<button className="btn btn-subtle btn-sm" onClick={() => onNavigate('my-work')}>Open My Work →</button>}>
            My work
          </PanelSectionTitle>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {myWork.map(item => (
              <div key={item.id} className="object-row" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 18px' }} onClick={() => onNavigate(item.route)}>
                <SeverityIndicator severity="medium" />
                <div className="row-body">
                  <div className="row-title">{item.title}</div>
                  <div className="row-meta">{item.meta}</div>
                </div>
                <div className="row-trailing">
                  <Avatar user={me} size="sm" />
                  <Icon name="chevronRight" size={12} className="muted" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <PanelSectionTitle action={<button className="btn btn-subtle btn-sm" onClick={() => onNavigate('integration')}>View coverage →</button>}>
            Coverage signals
          </PanelSectionTitle>
          <div className="card vstack" style={{ gap: 16 }}>
            {window.CoverageMetrics.slice(0, 4).map(c => (
              <div key={c.id} className="vstack" style={{ gap: 6 }}>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span className="text-sm">{c.label}</span>
                  <span className="text-xs tabular muted">{c.value} / {c.total} · {c.percent}%</span>
                </div>
                <CoverageBar percent={c.percent} status={c.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

Object.assign(window, { HomeScreen, useLiveActionCounts, ActionCard });
