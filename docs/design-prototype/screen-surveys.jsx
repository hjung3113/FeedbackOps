// ============================================================
// FeedbackOps — Surveys list + detail panel
// Split from screen-other.jsx (Pack 19) for Rule 2 compliance.
// Builder + Result Summary live in their own files; this one owns
// the list/detail and the allowed follow-up CTAs.
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

// SurveyCard — <ObjectCard> consumer for the Surveys grid view (Pack 11).
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
                      Live 상태 — 질문 변경은 응답 무결성을 위해 잠겨 있습니다.
                    </span>
                  )}
                </div>
              </div>
            )}

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
                Survey Result/Response 의 허용된 5가지 CTA. Create VOC 는 금지. */}
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

            <div data-anchor="guardrail" className="panel-section">
              <Callout tone="red" icon="alert" title="허용되지 않는 액션">
                Survey Response → Create VOC 는 금지됩니다. "Create VOC / Convert to VOC /
                Generate VOC from Response / Link Existing VOC" 라벨 사용 금지. 응답은 위 5가지
                follow-up 으로만 연결할 수 있습니다.
              </Callout>
            </div>

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

Object.assign(window, { SurveysScreen, SURVEYS });
