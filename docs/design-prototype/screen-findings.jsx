// ============================================================
// FeedbackOps — Findings list + detail
// ============================================================

function FindingRow({ f, selected, onSelect }) {
  const owner = window.userById(f.owner);
  return (
    <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(f)}>
      <div className="hstack gap-12">
        <SeverityIndicator severity={f.impact} />
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{f.id}</span>
          {f.title}
        </div>
        <div className="row-meta">
          <FindingStatusBadge status={f.status} />
          <ConfidenceBadge confidence={f.confidence} />
          <OutlineBadge>Impact · <strong style={{ color: 'var(--text-primary)' }}>{f.impact}</strong></OutlineBadge>
          <ManagedSystemPill id={f.managedSystem} />
          <span className="dot" />
          <span>Evidence {f.evidenceCount}</span>
          {f.linkedTaskId && (<><span className="dot" /><span style={{ color: 'var(--color-emerald)' }}>→ {f.linkedTaskId}</span></>)}
          {!f.linkedTaskId && f.status === 'active' && (<><span className="dot" /><span style={{ color: 'var(--color-amber)' }}>No execution</span></>)}
        </div>
      </div>
      <div className="row-trailing">
        <Avatar user={owner} size="sm" />
      </div>
    </div>
  );
}

function FindingDetailPanel({ f, onClose, onNavigate }) {
  const owner = window.userById(f.owner);
  const evidences = [
    { kind: 'voc-cluster', title: '결제 흐름 VOC 묶음 — 6 VOCs', meta: 'Tableau · 14일간', quote: '재시도 안내 문구가 보이지 않습니다. 결제가 실패해도 화면이 변하지 않아요.' },
    { kind: 'survey', title: 'Q3 Outcome Survey 응답 #218', meta: 'Discovery · CSAT 7점', quote: '리포트 다운로드 속도가 평소보다 느리고, 실패 후 안내가 부족합니다.' },
    { kind: 'manual', title: 'Manual note by 박서연', meta: '2024-04-12', summary: '내부 모니터링 로그에서 401 응답 후 빈 페이지 케이스 확인.' },
  ];
  const [trailAction, setTrailAction] = useState(null);
  const [trailStatus, setTrailStatus] = useState('');
  const [activeDraftFlow, setActiveDraftFlow] = useState(null);
  useEffect(() => {
    setTrailAction(null);
    setTrailStatus('');
    setActiveDraftFlow(null);
  }, [f.id]);

  const trailNodes = [
    { key: 'source-records', type: 'voc', title: `${f.sources[0]} 외 ${f.sources.length - 1}건`, meta: 'Source records' },
    { key: 'evidence', type: 'evidence', title: `${f.evidenceCount} evidence highlights`, meta: 'VOC + Survey + Note' },
    { key: 'finding', type: 'finding', title: f.title, meta: `${f.id} · this finding` },
    f.linkedRequestId ?
      { key: 'request-linked', type: 'request', title: 'Task request', meta: `${f.linkedRequestId} · approved`, action: 'jump' } :
      { key: 'request-create', type: 'request', placeholder: true, title: 'Task request 작성', meta: 'CTA' },
    f.linkedTaskId ?
      { key: 'task-linked', type: 'task', title: f.linkedTaskId, meta: 'execution', action: 'jump' } :
      { key: 'task-link', type: 'task', placeholder: true, title: 'Task 연결', meta: 'after approval' },
    { key: 'outcome-create', type: 'outcome', placeholder: true, title: 'Outcome survey', meta: 'after release' },
  ];

  const handleTrailNodeClick = (node) => {
    setTrailAction(node);
    setActiveDraftFlow(null);
    setTrailStatus(`${node.title} 작업을 선택했습니다.`);
  };

  const runTrailAction = (label, flowType = 'task-request') => {
    if (!trailAction) return;
    setActiveDraftFlow(flowType);
    setTrailStatus(`${label} · intent ready`);
  };

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="finding" id={f.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Finding" entityId={f.id}
          copyHash={`#route=findings&param=${f.id}`} />
      } />

      <div className="panel-scroll">
        <PanelTitleBlock title={f.title}>
          <FindingStatusBadge status={f.status} />
          <ConfidenceBadge confidence={f.confidence} />
          <OutlineBadge>Impact · <strong style={{ color: 'var(--text-primary)' }}>{f.impact}</strong></OutlineBadge>
          <span className="text-xs muted">· Owned by <strong style={{ color: 'var(--text-secondary)' }}>{owner.name}</strong></span>
        </PanelTitleBlock>

        <div className="panel-section">
          <PanelSectionTitle>Summary</PanelSectionTitle>
          <NestedTextBlock>{f.summary}</NestedTextBlock>
        </div>

        {/* Execution CTA — above the fold per UX spec.
            If backend signals the linked execution is permission-blocked,
            render PermissionBlockedPanel instead of the linked task card OR
            the request-task CTA. (docs/frontend/interaction-patterns.md
            §Permission-Limited Linked Objects) */}
        <div className="panel-section">
          <PanelSectionTitle>Execution</PanelSectionTitle>
          {(() => {
            const executionDecision = window.getPermissionDecision(f, 'execution');
            if (executionDecision) {
              return (
                <>
                  <PermissionBlockedPanel
                    state={executionDecision.state}
                    category={executionDecision.category}
                    reason={executionDecision.reason}
                    requiredScope={executionDecision.requiredScope}
                    summary={executionDecision.summary}
                  />
                  <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 6 }}>
                    <Icon name="shield" size={10} />
                    Decision <span className="mono" style={{ color: 'var(--text-secondary)' }}>{executionDecision.decisionId}</span> · evaluated {executionDecision.evaluatedAt}
                  </div>
                </>
              );
            }
            return f.linkedTaskId ? (
            // Pack 11 — EntityRelationRow surfaces the linked Task as a
            // navigable row.  Detail panel is ~400px wide so we keep the
            // trailing slot minimal (status badge only) and put the
            // primary CTA + secondary actions BELOW the row.
            <div className="vstack" style={{ gap: 8 }}>
              <EntityRelationRow
                left={{ type: 'task', id: f.linkedTaskId }}
                title="Power BI 임베디드 SSO 재인증 핸들러 구현"
                meta={<><span className="mono">{f.linkedTaskId}</span> · doing</>}
                trailing={<InternalTaskBadge status="doing" />}
                onClick={() => onNavigate('tasks', 'board', f.linkedTaskId)}
              />
              <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={() => onNavigate('tasks', 'board', f.linkedTaskId)}>
                  <Icon name="arrowRight" size={11} />Open task
                </Button>
                <Button variant="subtle" size="sm">Outcome survey</Button>
              </div>
            </div>
          ) : (
            <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" size="md" onClick={() => setActiveDraftFlow('task-request')}>
                <Icon name="plus" size={12} />Request Task
              </Button>
              <Button variant="secondary" size="md">Link existing Task</Button>
              <Button variant="secondary" size="md">Create Milestone</Button>
              {activeDraftFlow === 'task-request' && !trailAction && (
                <DesktopFlowDraftPanel
                  type="task-request"
                  sourceKind="Finding"
                  sourceId={f.id}
                  sourceTitle={f.title}
                  targetKind="Task Request"
                  intentAction="Request Task"
                  defaultSummary={`${f.id} · ${f.summary}`}
                  onNavigate={onNavigate}
                  onClose={() => setActiveDraftFlow(null)}
                />
              )}
            </div>
          );
          })()}
        </div>

        {/* Evidence highlights */}
        <div className="panel-section">
          <PanelSectionTitle action={<button className="btn btn-subtle btn-sm"><Icon name="plus" size={11} />Add evidence</button>}>
            Evidence highlights · {f.evidenceCount}
          </PanelSectionTitle>
          <div className="vstack" style={{ gap: 10 }}>
            {evidences.map((e, i) => (
              <div key={i} className="evidence">
                <div className="evidence-meta">
                  <OutlineBadge>
                    {e.kind === 'voc-cluster' && 'VOC cluster'}
                    {e.kind === 'survey' && 'Survey response'}
                    {e.kind === 'manual' && 'Manual note'}
                  </OutlineBadge>
                  <span>· {e.title}</span>
                  <span>· {e.meta}</span>
                </div>
                {e.quote && <div className="evidence-quote">"{e.quote}"</div>}
                {e.summary && <div className="evidence-summary">{e.summary}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Linked entity trail */}
        <div className="panel-section">
          <PanelSectionTitle>Linked entity trail</PanelSectionTitle>
          <LinkedEntityTrail
            nodes={trailNodes}
            selectedKey={trailAction?.key}
            onNodeClick={handleTrailNodeClick}
          />
          {trailAction && (
            <div className="card-nested vstack" style={{ gap: 8, marginTop: 10 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', gap: 8 }}>
                <div className="vstack" style={{ gap: 2 }}>
                  <span className="text-xs muted">Selected trail action</span>
                  <strong className="text-sm">{trailAction.title}</strong>
                </div>
                <OutlineBadge>{trailAction.type}</OutlineBadge>
              </div>
              <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button variant="primary" size="sm" onClick={() => runTrailAction('Request draft opened', 'task-request')}>
                  <Icon name="plus" size={11} />Draft
                </Button>
                <Button variant="secondary" size="sm" onClick={() => runTrailAction('Existing execution picker opened', 'task-request')}>
                  <Icon name="link" size={11} />Link existing
                </Button>
                <Button variant="subtle" size="sm" onClick={() => runTrailAction('Marked as later')}>
                  Later
                </Button>
              </div>
              {trailStatus && <div className="text-xs muted">{trailStatus}</div>}
              {activeDraftFlow && trailAction && (
                <DesktopFlowDraftPanel
                  type={activeDraftFlow}
                  sourceKind="Finding"
                  sourceId={f.id}
                  sourceTitle={f.title}
                  targetKind={trailAction.type}
                  targetId={trailAction.action === 'jump' ? (trailAction.type === 'request' ? f.linkedRequestId : f.linkedTaskId) : null}
                  targetTitle={trailAction.action === 'jump' ? trailAction.title : null}
                  intentAction={trailAction.title}
                  defaultSummary={`${f.id} · ${f.summary}`}
                  onNavigate={onNavigate}
                  onClose={() => setActiveDraftFlow(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Managed System"><ManagedSystemPill id={f.managedSystem} /></FieldRow>
          <FieldRow label="Owner"><UserChip user={owner} /></FieldRow>
          <FieldRow label="Created">{f.createdAt}</FieldRow>
          <FieldRow label="Visibility">
            <span className="badge badge-internal-only"><Icon name="user" size={9} />Internal only</span>
          </FieldRow>
        </div>
      </div>
    </aside>
  );
}

function FindingsScreen({ scope, selectedParam, onNavigate }) {
  const filtered = window.Findings.filter(f => scope.members.includes(f.managedSystem));
  const [selectedId, setSelectedId] = useState(selectedParam || filtered[0]?.id);
  const [activeTab, setActiveTab] = useState('active');
  // Pack 11 — view mode toggle (list / card).  Card view uses the
  // shared <ObjectCard> primitive so list and card share rhythm.
  const [viewMode, setViewMode] = useState('list');
  // Pack 12 — Filter popover.
  const [filters, setFilters] = useState({ confidence: new Set(), impact: new Set() });
  const toggleFilter = (cat, val, on) => setFilters(prev => {
    const next = new Set(prev[cat]); if (on) next.add(val); else next.delete(val);
    return { ...prev, [cat]: next };
  });
  const clearFilters = () => setFilters({ confidence: new Set(), impact: new Set() });
  const filterCategories = [
    { key: 'confidence', label: 'Confidence', options: [
      { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
    ]},
    { key: 'impact', label: 'Impact', options: [
      { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
    ]},
  ];

  const tabs = [
    { key: 'active', label: 'Active', count: filtered.filter(f => f.status === 'active').length },
    { key: 'draft', label: 'Draft', count: filtered.filter(f => f.status === 'draft').length },
    { key: 'not_actionable', label: 'Not actionable', count: filtered.filter(f => f.status === 'not_actionable').length },
    { key: 'all', label: 'All', count: filtered.length },
  ];
  let shown = activeTab === 'all' ? filtered : filtered.filter(f => f.status === activeTab);
  if (filters.confidence.size) shown = shown.filter(f => filters.confidence.has(f.confidence));
  if (filters.impact.size) shown = shown.filter(f => filters.impact.has(f.impact));
  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);

  const selected = selectedId ? (shown.find(f => f.id === selectedId) || filtered.find(f => f.id === selectedId)) : null;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Finding 검색…" />
          <ListFilterButton categories={filterCategories}
            applied={filters} onChange={toggleFilter} onClear={clearFilters} />
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <Button variant="primary" size="sm" icon="plus">New finding</Button>
        </ListToolbar>
        <div className="main-scroll" style={{ padding: viewMode === 'card' ? 16 : 0 }}>
          {viewMode === 'list' ? (
            shown.map(f => (
              <FindingRow key={f.id} f={f} selected={selected?.id === f.id} onSelect={(x) => setSelectedId(x.id)} />
            ))
          ) : (
            <div className="grid-2" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {shown.map(f => (
                <FindingCard key={f.id} f={f} selected={selected?.id === f.id} onSelect={(x) => setSelectedId(x.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && <FindingDetailPanel f={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>
  );
}

// ============================================================
// FindingCard — card view consumer of <ObjectCard>.  Pack 11.
// Same data density as the row view, but stacked + with the summary
// excerpt visible so users can scan rationale without opening detail.
// ============================================================
function FindingCard({ f, selected, onSelect }) {
  const owner = window.userById(f.owner);
  return (
    <ObjectCard
      id={f.id}
      title={f.title}
      status={<FindingStatusBadge status={f.status} />}
      leading={<SeverityIndicator severity={f.impact} />}
      trailing={<Avatar user={owner} size="sm" />}
      badges={<>
        <ConfidenceBadge confidence={f.confidence} />
        <OutlineBadge>Impact · <strong style={{ color: 'var(--text-primary)' }}>{f.impact}</strong></OutlineBadge>
        <ManagedSystemPill id={f.managedSystem} />
      </>}
      onClick={() => onSelect(f)}
      selected={selected}
    >
      <p className="text-xs muted" style={{
        lineHeight: 1.55, margin: 0,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{f.summary}</p>
      <div className="row-meta" style={{ gap: 8 }}>
        <span>Evidence {f.evidenceCount}</span>
        {f.linkedTaskId && (<><span className="dot" /><span style={{ color: 'var(--color-emerald)' }}>→ {f.linkedTaskId}</span></>)}
        {!f.linkedTaskId && f.status === 'active' && (
          <>
            <span className="dot" />
            <span style={{ color: 'var(--color-amber)' }}>No execution</span>
          </>
        )}
      </div>
    </ObjectCard>
  );
}

// Shared view-mode toggle button-pair used by Findings + Surveys lists.
function ViewModeToggle({ mode, onChange }) {
  return (
    <div className="hstack" style={{
      gap: 0, padding: 2,
      background: 'var(--color-pitch-black)',
      borderRadius: 6,
      boxShadow: 'var(--shadow-subtle)',
    }}>
      {[{ k: 'list', icon: 'list', label: 'List' }, { k: 'card', icon: 'layers', label: 'Card' }].map(o => (
        <button key={o.k}
          onClick={() => onChange(o.k)}
          title={`${o.label} view`}
          className={`btn btn-${mode === o.k ? 'primary' : 'ghost'} btn-sm`}
          style={{ padding: '4px 8px' }}>
          <Icon name={o.icon} size={11} />
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { FindingsScreen, FindingRow, FindingDetailPanel, FindingCard, ViewModeToggle });
