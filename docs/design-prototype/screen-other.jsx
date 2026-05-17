// ============================================================
// FeedbackOps — Integration Action Dashboard, Surveys, Admin
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

// ============================================================
// Surveys (basic)
// ============================================================
const SURVEYS = [
  { id: 'SRV-21', title: 'Q3 매출 리포트 사용성 진단', type: 'discovery', status: 'live', responses: 218, target: 600, managedSystem: 'tableau', owner: 'u-1', updatedAt: '오늘' },
  { id: 'SRV-20', title: 'SSO 재인증 흐름 변경 — Outcome', type: 'outcome', status: 'draft', responses: 0, target: 80, managedSystem: 'powerbi', owner: 'u-2', updatedAt: '어제' },
  { id: 'SRV-19', title: 'Looker 알림 신뢰도 검증', type: 'validation', status: 'live', responses: 42, target: 100, managedSystem: 'looker', owner: 'u-5', updatedAt: '2일 전' },
  { id: 'SRV-18', title: 'Metabase 한글 PDF Outcome', type: 'outcome', status: 'closed', responses: 64, target: 60, managedSystem: 'metabase', owner: 'u-1', updatedAt: '3일 전' },
];

// Survey follow-up action row — single visual rhythm for the 5 allowed
// CTAs on Survey Result / Response. The `actionId` matches backend
// `next_actions` ids per docs/frontend/interaction-patterns.md.
function SurveyFollowupAction({ icon, tone, title, desc, actionId, onRun }) {
  return (
    <div className="hstack" style={{
      padding: '10px 12px', gap: 10,
      background: 'var(--color-pitch-black)', borderRadius: 6,
      boxShadow: 'var(--shadow-subtle)',
      alignItems: 'flex-start',
    }}>
      <span className="hstack" style={{
        width: 26, height: 26, borderRadius: 6,
        background: tone === 'primary' ? 'rgba(20, 40, 160,0.15)' : 'rgba(138,143,152,0.1)',
        color: tone === 'primary' ? 'var(--color-neon-lime)' : 'var(--text-secondary)',
        justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={13} />
      </span>
      <div className="vstack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="text-sm" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--text-muted)',
            background: 'var(--surface-card)',
            padding: '1px 5px', borderRadius: 3,
            whiteSpace: 'nowrap',
          }}>{actionId}</span>
        </div>
        <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{desc}</span>
      </div>
      <Button variant={tone === 'primary' ? 'primary' : 'subtle'} size="sm" onClick={onRun} style={{ flexShrink: 0 }}>
        {tone === 'primary' ? 'Run' : 'Open'}
      </Button>
    </div>
  );
}

// ============================================================
// SurveyCard — <ObjectCard> consumer for the Surveys grid view.
// Pack 11.  Mirrors the Survey list row's data density but stacks
// vertically so cards line up.
// ============================================================
function SurveyCard({ s, selected, onSelect }) {
  const pct = Math.min(100, Math.round((s.responses / s.target) * 100));
  const owner = window.userById(s.owner);
  return (
    <ObjectCard
      id={s.id}
      title={s.title}
      status={<SurveyStatusBadge status={s.status} />}
      leading={<Icon name="survey" size={14} className="muted" />}
      trailing={<Avatar user={owner} size="sm" />}
      badges={<>
        <OutlineBadge style={{ textTransform: 'capitalize' }}>{s.type}</OutlineBadge>
        <ManagedSystemPill id={s.managedSystem} />
      </>}
      meta={<span>{s.updatedAt}</span>}
      onClick={() => onSelect(s.id)}
      selected={selected}
    >
      <div className="vstack" style={{ gap: 4 }}>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <span className="text-xs muted">Responses</span>
          <span className="text-xs tabular" style={{ fontWeight: 600 }}>{s.responses} / {s.target} · {pct}%</span>
        </div>
        <CoverageBar percent={pct} status={pct > 70 ? 'good' : pct > 30 ? 'warn' : 'bad'} />
      </div>
    </ObjectCard>
  );
}

function SurveysScreen({ scope, selectedParam, onNavigate }) {
  const filtered = SURVEYS.filter(s => scope.members.includes(s.managedSystem));
  const [selectedId, setSelectedId] = useState(selectedParam || filtered[0]?.id);
  const selected = filtered.find(s => s.id === selectedId);
  // Pack 11 — view mode toggle (list / card).  Card view uses
  // <ObjectCard>; ViewModeToggle is shared with Findings.
  const [viewMode, setViewMode] = useState('list');
  const [activeFollowupFlow, setActiveFollowupFlow] = useState(null);
  const surveyScrollRef = useRef(null);
  useEffect(() => setActiveFollowupFlow(null), [selectedId]);
  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);
  const followupFlowByAction = {
    create_finding: 'finding-draft',
    link_finding: 'finding-draft',
    request_task: 'task-request',
    add_evidence_highlight: 'evidence-draft',
    attach_evidence_to_existing_voc: 'attach-voc',
  };
  const surveySections = selected ? [
    { id: 'overview', label: 'Overview' },
    (selected.status === 'draft' || selected.status === 'live') && { id: 'builder', label: 'Builder' },
    { id: 'results', label: 'Results' },
    { id: 'followup', label: 'Follow-up' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'privacy', label: 'Privacy' },
  ].filter(Boolean) : [];

  return (
    <>
      <div className="main-region">
        <div className="toolbar">
          <div className="tabs">
            <button className="tab active">All<span className="tab-count">{filtered.length}</span></button>
            <button className="tab">Live</button>
            <button className="tab">Draft</button>
            <button className="tab">Closed</button>
          </div>
          <div className="toolbar-spacer" />
          <SearchInput placeholder="Survey 검색…" />
          <window.ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <Button variant="primary" size="sm" icon="plus"
            onClick={() => {
              const newId = `SRV-DRAFT-${Date.now().toString().slice(-5)}`;
              onNavigate && onNavigate('survey-builder', newId);
            }}>
            New survey
          </Button>
        </div>
        <div className="main-scroll" style={{ padding: viewMode === 'card' ? 16 : 0 }}>
          {viewMode === 'list' ? (
            filtered.map(s => {
              const pct = Math.min(100, Math.round((s.responses / s.target) * 100));
              return (
                <div key={s.id} className={`object-row ${selectedId === s.id ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)}>
                  <Icon name="survey" size={16} className="muted" />
                  <div className="row-body">
                    <div className="row-title">
                      <span className="row-id">{s.id}</span>{s.title}
                    </div>
                    <div className="row-meta">
                      <OutlineBadge style={{ textTransform: 'capitalize' }}>{s.type}</OutlineBadge>
                      <SurveyStatusBadge status={s.status} />
                      <ManagedSystemPill id={s.managedSystem} />
                      <span className="dot" />
                      <span>{s.updatedAt}</span>
                    </div>
                  </div>
                  <div className="row-trailing" style={{ alignItems: 'center', gap: 12 }}>
                    <div className="vstack" style={{ gap: 4, width: 120 }}>
                      <div className="hstack" style={{ justifyContent: 'space-between' }}>
                        <span className="text-xs muted">Responses</span>
                        <span className="text-xs tabular" style={{ fontWeight: 600 }}>{s.responses}/{s.target}</span>
                      </div>
                      <CoverageBar percent={pct} status={pct > 70 ? 'good' : pct > 30 ? 'warn' : 'bad'} />
                    </div>
                    <Avatar user={window.userById(s.owner)} size="sm" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid-2" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {filtered.map(s => <SurveyCard key={s.id} s={s} selected={selectedId === s.id} onSelect={setSelectedId} />)}
            </div>
          )}
        </div>
      </div>
      {selected && (
        <aside className="detail-panel">
          <DetailPanelHeader kind="survey" id={selected.id} onClose={() => setSelectedId(null)} extras={<>
            <DetailPanelHeaderActions entityKind="Survey" entityId={selected.id}
              copyHash={`#route=surveys&param=${selected.id}`} />
          </>} />
          <DetailPanelSectionNav sections={surveySections} scrollRef={surveyScrollRef} />
          <div className="panel-scroll" ref={surveyScrollRef}>
            <div data-anchor="overview">
              <PanelTitleBlock title={selected.title}>
                <OutlineBadge>{selected.type}</OutlineBadge>
                <SurveyStatusBadge status={selected.status} />
                <ManagedSystemPill id={selected.managedSystem} />
              </PanelTitleBlock>
            </div>

            {/* Builder entry — full-page surface for draft surveys.
                Spec: /surveys/:surveyId (routes-and-layout.md). */}
            {(selected.status === 'draft' || selected.status === 'live') && (
              <div data-anchor="builder" className="panel-section">
                <PanelSectionTitle>Builder</PanelSectionTitle>
                <div className="hstack" style={{ gap: 8 }}>
                  <Button variant={selected.status === 'draft' ? 'primary' : 'secondary'}
                    size="md"
                    onClick={() => onNavigate && onNavigate('survey-builder', selected.id)}>
                    <Icon name="doc" size={12} />
                    {selected.status === 'draft' ? 'Continue building' : 'Open builder'}
                  </Button>
                  {selected.status === 'live' && (
                    <span className="text-xs muted" style={{ alignSelf: 'center' }}>
                      Live 상태 \u2014 질문 변경은 응답 무결성을 위해 잠겨 있습니다.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Result summary — links to the full Result Summary surface
                ( /surveys/:id/results — built as a separate screen ) */}
            <div data-anchor="results" className="panel-section">
              <PanelSectionTitle action={
                onNavigate && (
                  <button className="btn btn-subtle btn-sm" onClick={() => onNavigate('survey-result', selected.id)}>
                    <Icon name="arrowRight" size={11} />Open result summary
                  </button>
                )
              }>Result summary</PanelSectionTitle>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                  <span className="text-xs muted">Response rate</span>
                  <span className="text-lg" style={{ fontWeight: 600 }}>{Math.round((selected.responses / selected.target) * 100)}%</span>
                  <span className="text-xs muted mono">{selected.responses}/{selected.target}</span>
                </div>
                <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                  <span className="text-xs muted">Top sentiment</span>
                  <span className="text-lg" style={{ fontWeight: 600 }}>
                    {selected.status === 'live' ? 'Neutral' : selected.responses > 30 ? 'Positive' : '—'}
                  </span>
                  <span className="text-xs muted">aggregate of text responses</span>
                </div>
              </div>
              <div className="card-nested vstack" style={{ gap: 8, padding: 12 }}>
                <span className="text-xs muted">Top response highlight</span>
                <div className="evidence-quote" style={{ borderLeftColor: 'var(--color-amethyst)' }}>
                  "월간 매출 리포트 다운로드 속도가 느려졌고, 실패해도 알 수 없습니다."
                </div>
                <div className="text-xs muted hstack" style={{ gap: 6 }}>
                  <span className="mono">SRV-21 · Q-7 · text response #41</span>
                </div>
              </div>
            </div>

            {/* Allowed follow-up actions — per 07-survey-system.md FR-SURVEY-005.
                Survey Result/Response 의 허용된 4가지 CTA. Create VOC 는 금지. */}
            <div data-anchor="followup" className="panel-section">
              <PanelSectionTitle>Follow-up actions</PanelSectionTitle>
              <div className="vstack" style={{ gap: 6 }}>
                <SurveyFollowupAction
                  icon="finding" tone="primary"
                  title="Create Finding" actionId="create_finding"
                  desc="응답에서 본 패턴을 새 Finding 으로 종합합니다."
                  onRun={() => setActiveFollowupFlow(followupFlowByAction.create_finding)} />
                <SurveyFollowupAction
                  icon="link" tone="secondary"
                  title="Link Finding" actionId="link_finding"
                  desc="응답을 기존 Finding 에 추가 근거로 연결합니다."
                  onRun={() => setActiveFollowupFlow(followupFlowByAction.link_finding)} />
                <SurveyFollowupAction
                  icon="task" tone="secondary"
                  title="Request Task" actionId="request_task"
                  desc="실행 후보로 검토 큐에 올립니다. 직접 Task 생성이 아닙니다."
                  onRun={() => setActiveFollowupFlow(followupFlowByAction.request_task)} />
                <SurveyFollowupAction
                  icon="doc" tone="secondary"
                  title="Add Evidence Highlight" actionId="add_evidence_highlight"
                  desc="텍스트 응답을 evidence highlight 로 승인·발췌합니다."
                  onRun={() => setActiveFollowupFlow(followupFlowByAction.add_evidence_highlight)} />
                <SurveyFollowupAction
                  icon="arrowRight" tone="secondary"
                  title="기존 VOC에 근거 연결" actionId="attach_evidence_to_existing_voc"
                  desc="이미 존재하는 VOC 에 survey evidence 를 첨부합니다. 새 VOC 를 만들지 않습니다."
                  onRun={() => setActiveFollowupFlow(followupFlowByAction.attach_evidence_to_existing_voc)} />
              </div>
              {activeFollowupFlow && (
                <DesktopFlowDraftPanel
                  type={activeFollowupFlow}
                  sourceKind="Survey"
                  sourceId={selected.id}
                  sourceTitle={selected.title}
                  targetKind={activeFollowupFlow === 'attach-voc' ? 'VOC' : activeFollowupFlow === 'task-request' ? 'Task Request' : activeFollowupFlow === 'finding-draft' ? 'Finding' : 'Evidence Highlight'}
                  intentAction={activeFollowupFlow === 'attach-voc' ? 'Attach survey evidence to existing VOC' : activeFollowupFlow === 'task-request' ? 'Request Task' : activeFollowupFlow === 'finding-draft' ? 'Create or link Finding' : 'Add Evidence Highlight'}
                  defaultSummary={`Survey ${selected.id} follow-up · ${selected.title}`}
                  onNavigate={onNavigate}
                  onClose={() => setActiveFollowupFlow(null)}
                />
              )}
            </div>

            {/* Forbidden — kept as an inline reminder right next to the actions */}
            <div data-anchor="guardrail" className="panel-section">
              <Callout tone="red" icon="alert" title="허용되지 않는 액션">
                Survey Response → Create VOC 는 금지됩니다. "Create VOC / Convert to VOC /
                Generate VOC from Response / Link Existing VOC" 라벨 사용 금지. 응답은 위 5가지
                follow-up 으로만 연결할 수 있습니다.
              </Callout>
            </div>

            {/* Anonymity hint — surfaces the MVP-default threshold rule from
                07-survey-system.md when filtering response detail. */}
            <div data-anchor="privacy" className="panel-section">
              <Callout tone="blue" icon="shield" title="익명 임계값 5">
                Managed System · Segment · Analytics Area 필터로 가시 응답이 5명 미만으로 줄어들면
                Result Summary 가 자동으로 버킷을 머지하거나 가리도록 동작합니다. 익명·식별보호
                응답의 free-text 는 redaction 과 명시적 승인 이후에만 evidence 로 사용됩니다.
              </Callout>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

// ============================================================
// Admin (split per routes-and-layout.md §Admin)
//   /admin/managed-systems       → AdminScreen (this file)
//   /admin/analytics-areas       → AdminAreasScreen
//   /admin/permissions/requests  → PermissionRequestsScreen (screen-permissions.jsx)
//   /admin/settings              → AdminSettingsScreen
// Sidebar items in shell.jsx route to each of these directly. The
// Managed-systems screen keeps a small Permission-requests teaser that
// links to the dedicated review console so admins landing here see the
// pending decision count above the fold.
// ============================================================
function AdminScreen({ onNavigate }) {
  const pending = window.PermissionRequests
    ? window.PermissionRequests.filter(r => r.status === 'pending' || r.status === 'needs_more_info').length
    : 2;
  return (
    <PageShell
      title="Managed systems"
      subtitle="Managed System 은 MVP 의 권한·집계 단위입니다. Project 가 아닙니다. 각 시스템의 default owner, AA 매핑, 활성 상태를 관리합니다."
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="primary" size="sm" icon="plus">Register system</Button>
      </>}>

        <PanelSectionTitle action={
          <span className="text-xs muted">
            {window.ManagedSystems.length} systems · {window.AnalyticsAreas.length} analytics areas
          </span>
        }>
          Registry
        </PanelSectionTitle>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          {window.ManagedSystems.map((m, i) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.6fr 1.1fr 1.4fr 110px', gap: 12, padding: '12px 16px', alignItems: 'center', borderBottom: i < window.ManagedSystems.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div className="scope-mark" style={{ width: 28, height: 28, background: m.color, fontSize: 11 }}>{m.mark}</div>
              <div>
                <div className="text-sm" style={{ fontWeight: 500 }}>{m.name}</div>
                <div className="text-xs muted mono">managed-system/{m.id}</div>
              </div>
              <div className="vstack" style={{ gap: 2 }}>
                <span className="text-xs muted">Default owner</span>
                <UserChip user={window.userById('u-1')} size="sm" />
              </div>
              <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                {window.AnalyticsAreas.filter(a => a.managedSystem === m.id).map(a => (
                  <OutlineBadge key={a.id}>{a.name}</OutlineBadge>
                ))}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Button variant="subtle" size="sm">Configure</Button>
              </div>
            </div>
          ))}
        </div>

        <PanelSectionTitle action={
          <Button variant="primary" size="sm" onClick={() => onNavigate && onNavigate('admin-permissions')}>
            <Icon name="arrowRight" size={11} />Open review console
          </Button>
        }>
          Permission requests
        </PanelSectionTitle>
        <div className="card hstack" style={{ padding: 16, gap: 14 }}>
          <span className="hstack" style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(242,196,109,0.12)', color: 'var(--color-amber)',
            justifyContent: 'center',
          }}>
            <Icon name="shield" size={16} />
          </span>
          <div className="vstack" style={{ gap: 2, flex: 1 }}>
            <div className="text-md" style={{ fontWeight: 600 }}>
              {pending} requests awaiting decision
            </div>
            <span className="text-xs muted">
              Pending · Needs more info · High-risk · Self-approval 까지 검토 콘솔에서 확인합니다.
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate && onNavigate('admin-permissions')}>
            <Icon name="arrowRight" size={11} />Review
          </Button>
        </div>
    </PageShell>
  );
}

// ============================================================
// AdminAreasScreen — /admin/analytics-areas
// Catalog of Analytics Areas grouped by Managed System. AA is a
// secondary classification, not a permission boundary (per
// docs/design/09-permission-access.md §5.4 + routes-and-layout.md).
// ============================================================
function AdminAreasScreen({ onNavigate }) {
  const totalAreas = window.AnalyticsAreas.length;
  // Pack 10 — slide-over for per-area detail.  AA is a filter dimension
  // (not a permission boundary), so the slide-over is intentionally
  // lightweight — definition, ownership, sample workload, recent
  // findings — without permission affordances.
  const [activeArea, setActiveArea] = useState(null);
  return (
    <>
    <PageShell
      title="Analytics areas"
      subtitle="Analytics Area 는 Managed System 하위의 분류 라벨입니다. 권한 경계가 아니라 dashboard·triage 의 필터 차원입니다."
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="primary" size="sm" icon="plus">New area</Button>
      </>}>

        <Callout tone="blue" icon="shield" title="Analytics Area 는 MVP 권한 경계가 아닙니다">
          AA 는 Managed System 안에서의 분류·집계 단위로만 사용됩니다. AA 별 권한 분기는
          MVP 범위 밖이며, scope 결정은 Managed System 만으로 이루어집니다.
        </Callout>

        <PanelSectionTitle action={
          <span className="text-xs muted">{totalAreas} areas · {window.ManagedSystems.length} systems</span>
        }>
          Catalog
        </PanelSectionTitle>
        <div className="vstack" style={{ gap: 16 }}>
          {window.ManagedSystems.map(m => {
            const areas = window.AnalyticsAreas.filter(a => a.managedSystem === m.id);
            return (
              <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="hstack" style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  gap: 10,
                }}>
                  <div className="scope-mark" style={{ width: 22, height: 22, background: m.color, fontSize: 10 }}>{m.mark}</div>
                  <span className="text-sm" style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className="text-xs muted">· {areas.length} {areas.length === 1 ? 'area' : 'areas'}</span>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-subtle btn-sm">
                    <Icon name="plus" size={11} />Add area
                  </button>
                </div>
                {areas.length === 0 ? (
                  <div className="text-xs muted" style={{ padding: 16, textAlign: 'center' }}>
                    등록된 Analytics Area 가 없습니다.
                  </div>
                ) : (
                  areas.map((a, i) => (
                    <div key={a.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.2fr 0.8fr 100px',
                      gap: 12, padding: '10px 16px',
                      borderBottom: i < areas.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      alignItems: 'center', fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveArea(a)}>
                      <div className="hstack" style={{ gap: 8 }}>
                        <Icon name="layers" size={12} className="muted" />
                        <span style={{ fontWeight: 500 }}>{a.name}</span>
                      </div>
                      <span className="text-xs muted mono">analytics-area/{a.id}</span>
                      <span className="text-xs muted">Lead: <span style={{ color: 'var(--text-secondary)' }}>{window.userById('u-1').name}</span></span>
                      <div style={{ textAlign: 'right' }}>
                        <Button variant="subtle" size="sm"
                          onClick={(e) => { e.stopPropagation(); setActiveArea(a); }}>
                          Detail
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
    </PageShell>
    {activeArea && <AnalyticsAreaSlideOver area={activeArea} onClose={() => setActiveArea(null)} />}
    </>
  );
}

// ============================================================
// AnalyticsAreaSlideOver — read-only detail surface for an AA.
// Pack 10.  AA is not a permission boundary, so we keep this strictly
// informational: definition, lead, sample workload, recent findings.
// Drawer width matches detail-panel pattern so visual rhythm holds.
// ============================================================
function AnalyticsAreaSlideOver({ area, onClose }) {
  const ms = window.msById(area.managedSystem);
  const lead = window.userById('u-1');
  const scrollRef = useRef(null);
  // Mock related entities — production should query by analyticsArea.
  const relatedFindings = (window.Findings || []).filter(f =>
    (window.EvidenceHighlights || []).some(e => e.linkedFindingId === f.id && e.analyticsArea === area.id)
  ).slice(0, 4);
  const evidenceCount = (window.EvidenceHighlights || [])
    .filter(e => e.analyticsArea === area.id).length;
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'definition', label: 'Definition' },
    { id: 'workload', label: 'Workload' },
    relatedFindings.length > 0 && { id: 'findings', label: 'Findings', count: relatedFindings.length },
    { id: 'used-by', label: 'Used by' },
  ].filter(Boolean);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,40,160,0.16)',
        backdropFilter: 'blur(4px)',
        zIndex: 400,
        display: 'grid',
        gridTemplateColumns: '1fr 460px',
      }}>
      <div />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-detail)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column',
          animation: 'cmdk-rise 140ms ease-out',
        }}>
        <div className="panel-header">
          <span className="badge" style={{
            background: 'rgba(94,106,210,0.15)', color: 'var(--color-aether-blue)',
          }}>
            <span className="badge-dot" />Analytics Area
          </span>
          <span className="panel-id mono">analytics-area/{area.id}</span>
          <div className="panel-header-actions">
            <Button variant="ghost" size="sm" icon="link" />
            <Button variant="ghost" size="sm" icon="close" onClick={onClose} title="Close" />
          </div>
        </div>

        <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

        <div className="panel-scroll" ref={scrollRef}>
          <div data-anchor="overview">
            <PanelTitleBlock title={area.name}>
              <ManagedSystemPill id={area.managedSystem} />
              <OutlineBadge>Filter dimension</OutlineBadge>
            </PanelTitleBlock>
          </div>

          <div data-anchor="guardrail" className="panel-section">
            <Callout tone="blue" icon="shield" title="Not a permission boundary">
              AA 는 권한 경계가 아닌 분류·집계 단위입니다. Triage filter, dashboard tab,
              survey targeting 같은 surface 에서만 사용되며 backend permission check 에는
              영향을 주지 않습니다.
            </Callout>
          </div>

          <div data-anchor="definition" className="panel-section">
            <PanelSectionTitle>Definition</PanelSectionTitle>
            <FieldRow label="Managed System">
              <span className="hstack" style={{ gap: 6 }}>
                {ms && <div className="scope-mark" style={{ width: 18, height: 18, background: ms.color, fontSize: 10 }}>{ms.mark}</div>}
                <span>{ms?.name || area.managedSystem}</span>
              </span>
            </FieldRow>
            <FieldRow label="Slug"><span className="mono text-xs">{area.id}</span></FieldRow>
            <FieldRow label="Lead"><UserChip user={lead} /></FieldRow>
            <FieldRow label="Created">2025-12-04</FieldRow>
            <FieldRow label="Default visibility">
              <span className="badge badge-internal-only"><Icon name="shield" size={9} />Internal · MS-scoped</span>
            </FieldRow>
          </div>

          <div data-anchor="workload" className="panel-section">
            <PanelSectionTitle>Workload signal</PanelSectionTitle>
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                <span className="text-xs muted">Active findings</span>
                <span className="text-lg" style={{ fontWeight: 600 }}>{relatedFindings.length || '—'}</span>
                <span className="text-xs muted">in this analytics area</span>
              </div>
              <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                <span className="text-xs muted">Evidence highlights</span>
                <span className="text-lg" style={{ fontWeight: 600 }}>{evidenceCount}</span>
                <span className="text-xs muted">tagged to this AA</span>
              </div>
            </div>
          </div>

          {relatedFindings.length > 0 && (
            <div data-anchor="findings" className="panel-section">
              <PanelSectionTitle>Recent findings</PanelSectionTitle>
              <div className="vstack" style={{ gap: 6 }}>
                {relatedFindings.map(f => (
                  <EntityRelationRow
                    key={f.id}
                    left={{ type: 'finding', id: f.id }}
                    title={f.title}
                    meta={<><span className="mono">{f.id}</span> · {f.impact} impact</>}
                    trailing={<FindingStatusBadge status={f.status} />}
                  />
                ))}
              </div>
            </div>
          )}

          <div data-anchor="used-by" className="panel-section">
            <PanelSectionTitle>Used by</PanelSectionTitle>
            <div className="vstack" style={{ gap: 6 }}>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="voc" size={12} className="muted" />
                <span className="text-sm">VOC Triage</span>
                <span className="text-xs muted">· filter dimension</span>
              </div>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="finding" size={12} className="muted" />
                <span className="text-sm">Findings list</span>
                <span className="text-xs muted">· filter + grouping</span>
              </div>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="survey" size={12} className="muted" />
                <span className="text-sm">Survey targeting</span>
                <span className="text-xs muted">· segment definition</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel-footer">
          <Button variant="secondary" className="btn-block">
            <Icon name="settings" size={12} />Edit area
          </Button>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { IntegrationScreen, SurveysScreen, AdminScreen, AdminAreasScreen, SURVEYS });
