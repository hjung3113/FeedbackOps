// ============================================================
// FeedbackOps — Integration · Evidence Highlights
// Route: integration-evidence
// ============================================================
// Evidence Highlight = compact evidence fragment lifted from a
// VOC text, Survey Response, or manual note. It preserves source
// reference and explains why a Finding or Task exists.
//
// Spec sources:
//   - docs/design/05-finding-insight-system.md  (Evidence Highlight)
//   - docs/design/01-domain-model.md             (Evidence Highlight)
//   - docs/frontend/ui-design-system.md          (EvidenceHighlight)

// ------------------------------------------------------------
// Mock data — Evidence Highlights
// ------------------------------------------------------------
const EvidenceHighlights = [
  {
    id: 'EH-218',
    sourceType: 'voc',
    sourceId: 'VOC-2813',
    sourceTitle: 'Power BI 임베디드 보고서가 SSO 세션 만료 시 401 에러를 던짐',
    quote: '오피스365 세션이 만료된 상태에서 임베디드 리포트가 401을 던지고 재인증 안내가 없습니다.',
    isQuote: true,
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    sentiment: 'negative',
    importance: 'high',
    createdBy: 'u-2',
    createdAt: '오늘',
    visibility: 'internal',
    linkedFindingId: 'FIN-181',
    linkedTaskId: 'TASK-902',
  },
  {
    id: 'EH-217',
    sourceType: 'survey_response',
    sourceId: 'SRV-21·R-218',
    sourceTitle: 'Q3 매출 리포트 사용성 진단 — 응답 #218',
    quote: '월간 매출 리포트 다운로드 속도가 느려졌고, 실패해도 알 수 없습니다.',
    isQuote: true,
    managedSystem: 'tableau',
    analyticsArea: 'revenue',
    sentiment: 'negative',
    importance: 'high',
    createdBy: 'u-1',
    createdAt: '오늘',
    visibility: 'internal',
    linkedFindingId: 'FIN-179',
    linkedTaskId: 'TASK-901',
  },
  {
    id: 'EH-216',
    sourceType: 'voc',
    sourceId: 'VOC-2809',
    sourceTitle: '리포트 다운로드 속도가 30초 이상 걸림',
    quote: '월간 매출 리포트 다운로드가 평소 5초에서 30초 이상으로 느려졌습니다.',
    isQuote: true,
    managedSystem: 'tableau',
    analyticsArea: 'revenue',
    sentiment: 'negative',
    importance: 'high',
    createdBy: 'u-3',
    createdAt: '어제',
    visibility: 'reporter-visible',
    linkedFindingId: 'FIN-179',
    linkedTaskId: 'TASK-901',
  },
  {
    id: 'EH-215',
    sourceType: 'note',
    sourceTitle: 'Manual note · 박서연',
    summary: '내부 모니터링 로그에서 401 응답 후 빈 페이지 케이스 확인. 동일 패턴이 4월 12일~14일 사이 18회 발생.',
    isQuote: false,
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    sentiment: null,
    importance: 'medium',
    createdBy: 'u-2',
    createdAt: '2일 전',
    visibility: 'internal',
    linkedFindingId: 'FIN-181',
    linkedTaskId: null,
  },
  {
    id: 'EH-214',
    sourceType: 'voc',
    sourceId: 'VOC-2811',
    sourceTitle: '관리자 초대 메일이 스팸함으로 분류됨',
    quote: '내부 사용자 초대 메일이 Outlook 정책상 스팸으로 분류되는 사례가 늘고 있습니다.',
    isQuote: true,
    managedSystem: 'tableau',
    analyticsArea: null,
    sentiment: 'negative',
    importance: 'medium',
    createdBy: 'u-6',
    createdAt: '2일 전',
    visibility: 'internal',
    linkedFindingId: 'FIN-180',
    linkedTaskId: null,
  },
  {
    id: 'EH-213',
    sourceType: 'voc',
    sourceId: 'VOC-2812',
    sourceTitle: 'Looker 모델 변경 후 알림이 오지 않음',
    quote: '데이터 모델 변경 시 구독자에게 알림이 가야 하는데, 최근 일주일 동안 발송이 멈췄습니다.',
    isQuote: true,
    managedSystem: 'looker',
    analyticsArea: 'marketing',
    sentiment: 'negative',
    importance: 'medium',
    createdBy: 'u-5',
    createdAt: '3일 전',
    visibility: 'internal',
    linkedFindingId: 'FIN-178',
    linkedTaskId: null,
  },
  {
    id: 'EH-212',
    sourceType: 'survey_response',
    sourceId: 'SRV-19·R-42',
    sourceTitle: 'Looker 알림 신뢰도 검증 — 응답 #42',
    summary: '응답자의 71%가 "최근 알림을 받지 못했다"고 응답. 토큰 만료 추정.',
    isQuote: false,
    managedSystem: 'looker',
    analyticsArea: 'marketing',
    sentiment: 'negative',
    importance: 'high',
    createdBy: 'u-5',
    createdAt: '3일 전',
    visibility: 'internal',
    linkedFindingId: 'FIN-178',
    linkedTaskId: null,
    // Pack 8 — unified permission_decision envelope.
    // Source survey is in a Managed System scope the actor lacks.
    // Evidence body was approved for surfacing but the source record
    // requires a permission request before it can be opened.
    permissionDecisions: {
      source: {
        state: 'request_access',
        category: 'Source Survey · scope missing',
        reason: '소스 Survey 가 Looker scope 에 있고 현재 actor 에게 survey.read 권한이 없습니다. evidence summary 는 정책상 surfacing 이 허용되었으나 원본 응답을 열람하려면 권한 요청이 필요합니다.',
        requiredScope: ['looker'],
        decisionId: 'pd-3f5b',
        evaluatedAt: '2026-05-15 11:42',
      },
    },
  },
  {
    id: 'EH-211',
    sourceType: 'voc',
    sourceId: 'VOC-2810',
    sourceTitle: 'Metabase 대시보드 PDF 내보내기 시 한글 깨짐',
    quote: 'PDF로 내보내면 일부 한글 셀이 □로 표시됩니다. 폰트 임베딩 이슈로 추정됩니다.',
    isQuote: true,
    managedSystem: 'metabase',
    analyticsArea: 'cs-ops',
    sentiment: 'negative',
    importance: 'low',
    createdBy: 'u-1',
    createdAt: '어제',
    visibility: 'reporter-visible',
    linkedFindingId: 'FIN-177',
    linkedTaskId: null,
  },
  {
    id: 'EH-210',
    sourceType: 'note',
    sourceTitle: 'Manual note · 김지원',
    summary: 'PDF 내보내기 워커 컨테이너에 KR 폰트가 빠져있음 확인. 빌드 스크립트에 noto-sans-kr 추가 필요.',
    isQuote: false,
    managedSystem: 'metabase',
    analyticsArea: 'cs-ops',
    sentiment: null,
    importance: 'low',
    createdBy: 'u-1',
    createdAt: '이번 주',
    visibility: 'internal',
    linkedFindingId: 'FIN-177',
    linkedTaskId: null,
  },
  {
    id: 'EH-209',
    sourceType: 'voc',
    sourceId: 'VOC-2814',
    sourceTitle: 'Tableau 대시보드 로딩 시 사이드 메뉴가 사라지는 문제',
    quote: '재무 분석 워크북을 열면 좌측 사이드 메뉴가 일시적으로 사라집니다. 새로고침해야 다시 보입니다.',
    isQuote: true,
    managedSystem: 'tableau',
    analyticsArea: 'finance',
    sentiment: 'negative',
    importance: 'medium',
    createdBy: 'u-3',
    createdAt: '4일 전',
    visibility: 'internal',
    linkedFindingId: null,
    linkedTaskId: 'TASK-900',
  },
  {
    id: 'EH-208',
    sourceType: 'survey_response',
    sourceId: 'SRV-21·R-201',
    sourceTitle: 'Q3 매출 리포트 사용성 진단 — 응답 #201',
    quote: '리포트 다운로드 속도는 견딜 만하지만 로딩 중 피드백이 없어 멈춘 줄 알았습니다.',
    isQuote: true,
    managedSystem: 'tableau',
    analyticsArea: 'revenue',
    sentiment: 'neutral',
    importance: 'medium',
    createdBy: 'u-1',
    createdAt: '4일 전',
    visibility: 'internal',
    linkedFindingId: 'FIN-179',
    linkedTaskId: null,
  },
];

// Sentiment / importance / source type display helpers — promoted to
// components.jsx in Pack 10 so the Milestone Detail evidence section,
// Cluster member rows, and Survey Result evidence excerpts share one
// vocabulary.  We re-pick them off `window` so this screen file
// continues to read like it owns them locally.
const { SourceTypeIcon, SentimentChip, ImportanceChip,
        SOURCE_TYPE_META, SENTIMENT_META, IMPORTANCE_META } = window;

// ------------------------------------------------------------
// Evidence row
// ------------------------------------------------------------
function EvidenceRow({ e, selected, onSelect }) {
  const creator = window.userById(e.createdBy);
  const m = SOURCE_TYPE_META[e.sourceType];
  return (
    <div className={`object-row expanded ${selected ? 'selected' : ''}`} onClick={() => onSelect(e)}>
      <div className="hstack gap-12" style={{ alignItems: 'flex-start', paddingTop: 2 }}>
        <SourceTypeIcon type={e.sourceType} size={28} />
      </div>
      <div className="row-body" style={{ gap: 6 }}>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="row-id">{e.id}</span>
          <OutlineBadge>{m.label}</OutlineBadge>
          {e.sourceId && (
            <span className="text-xs muted hstack" style={{ gap: 4 }}>
              from <span className="mono" style={{ color: 'var(--text-secondary)' }}>{e.sourceId}</span>
            </span>
          )}
          <span className="text-xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
            · {e.sourceTitle}
          </span>
        </div>
        {e.isQuote ? (
          <div style={{
            fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
            lineHeight: 1.55, fontStyle: 'italic',
            borderLeft: '2px solid var(--color-aether-blue)',
            paddingLeft: 10, marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>"{e.quote}"</div>
        ) : (
          <div style={{
            fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            lineHeight: 1.55, marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{e.summary}</div>
        )}
        <div className="row-meta" style={{ marginTop: 4 }}>
          <ManagedSystemPill id={e.managedSystem} />
          {e.analyticsArea && (
            <>
              <span className="dot" />
              <span>{window.areaById(e.analyticsArea)?.name || e.analyticsArea}</span>
            </>
          )}
          {e.sentiment && <><span className="dot" /><SentimentChip sentiment={e.sentiment} /></>}
          {e.importance && <><span className="dot" /><span style={{ color: IMPORTANCE_META[e.importance].color }}>Importance · {IMPORTANCE_META[e.importance].label}</span></>}
          <span className="dot" />
          <span>{e.createdAt}</span>
          {e.visibility === 'reporter-visible' && (
            <>
              <span className="dot" />
              <span style={{ color: 'var(--color-cyan-spark)' }}>Reporter-visible</span>
            </>
          )}
        </div>
      </div>
      <div className="row-trailing" style={{ alignItems: 'flex-end', gap: 8, flexDirection: 'column' }}>
        <Avatar user={creator} size="sm" />
        <div className="hstack" style={{ gap: 6 }}>
          {e.linkedFindingId && (
            <span className="badge" style={{ background: 'rgba(20, 40, 160,0.08)', color: 'var(--color-neon-lime)' }}>
              <Icon name="finding" size={10} />{e.linkedFindingId}
            </span>
          )}
          {e.linkedTaskId && (
            <span className="badge" style={{ background: 'rgba(39,166,68,0.08)', color: 'var(--color-emerald)' }}>
              <Icon name="task" size={10} />{e.linkedTaskId}
            </span>
          )}
          {!e.linkedFindingId && !e.linkedTaskId && (
            <span className="badge badge-blocked"><Icon name="alert" size={10} />Unlinked</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Evidence detail panel
// ------------------------------------------------------------
function EvidenceDetailPanel({ e, onClose, onNavigate }) {
  const creator = window.userById(e.createdBy);
  const finding = e.linkedFindingId ? window.findingById(e.linkedFindingId) : null;
  const task = e.linkedTaskId ? window.taskById(e.linkedTaskId) : null;
  const sourceVoc = e.sourceType === 'voc' ? window.vocById(e.sourceId) : null;
  const m = SOURCE_TYPE_META[e.sourceType];
  // Pack 8 — unified permission_decision envelope.
  const sourceDecision = window.getPermissionDecision(e, 'source');
  const [trailAction, setTrailAction] = useState(null);
  const [trailStatus, setTrailStatus] = useState('');
  const [activeDraftFlow, setActiveDraftFlow] = useState(null);
  const scrollRef = useRef(null);
  useEffect(() => {
    setTrailAction(null);
    setTrailStatus('');
    setActiveDraftFlow(null);
  }, [e.id]);
  const handleClose = () => {
    const shell = document.querySelector('.app-shell');
    if (shell?.classList.contains('panel-fullscreen')) {
      shell.classList.remove('panel-fullscreen');
      window.dispatchEvent(new CustomEvent('__panel-fullscreen-changed', { detail: false }));
    }
    onClose?.();
  };

  const trailNodes = [
    { key: 'source', type: e.sourceType === 'survey_response' ? 'survey' : (e.sourceType === 'note' ? 'evidence' : 'voc'),
      title: e.sourceTitle,
      meta: e.sourceId || 'manual note' },
    { key: 'evidence', type: 'evidence', title: e.isQuote ? `"${e.quote.slice(0, 36)}…"` : `${e.summary.slice(0, 36)}…`, meta: `${e.id} · this evidence` },
    finding
      ? { key: 'finding-linked', type: 'finding', title: finding.title, meta: finding.id, action: 'jump' }
      : { key: 'finding-promote', type: 'finding', placeholder: true, title: 'Promote to Finding', meta: 'CTA' },
    task
      ? { key: 'task-linked', type: 'task', title: task.title, meta: task.id, action: 'jump' }
      : { key: 'task-link', type: 'task', placeholder: true, title: 'Task 연결', meta: 'after promotion' },
  ];

  const handleTrailNodeClick = (node) => {
    setTrailAction(node);
    setActiveDraftFlow(null);
    setTrailStatus(`${node.title} 작업을 선택했습니다.`);
  };

  const runTrailAction = (label, flowType) => {
    if (!trailAction) return;
    setActiveDraftFlow(flowType);
    setTrailStatus(`${label} · intent ready`);
  };

  const trailDraftFlow =
    trailAction?.type === 'finding' ? 'finding-draft' :
    trailAction?.type === 'task' ? 'task-request' :
    'attach-voc';
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'source', label: 'Source' },
    { id: 'execution', label: 'Execution' },
    { id: 'properties', label: 'Properties' },
    { id: 'trail', label: 'Trail' },
  ];

  return (
    <aside className="detail-panel">
      <div className="panel-header">
        <span className="badge" style={{ background: 'rgba(2,184,204,0.15)', color: 'var(--color-cyan-spark)' }}>
          <span className="badge-dot" />Evidence
        </span>
        <span className="panel-id mono">{e.id}</span>
        <div className="panel-header-actions">
          <DetailPanelHeaderActions entityKind="Evidence" entityId={e.id}
            copyHash={`#route=integration-evidence&param=${e.id}`} />
          <Button variant="ghost" size="sm" icon="close" onClick={handleClose} title="Close panel" />
        </div>
      </div>
      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

      <div className="panel-scroll" ref={scrollRef}>
        <div data-anchor="overview">
          <PanelTitleBlock title={e.isQuote ? `"${e.quote}"` : e.summary}>
            <OutlineBadge>{m.label} evidence</OutlineBadge>
            {e.sentiment && <SentimentChip sentiment={e.sentiment} />}
            {e.importance && <ImportanceChip importance={e.importance} />}
          </PanelTitleBlock>
        </div>

        {/* Source — must be visible per spec. If the backend marks
            the source record as permission-limited, render
            PermissionBlockedPanel above the evidence body. The
            evidence body itself stays visible because the
            highlight is the surfacable subset (FR-LINK-002). */}
        <div data-anchor="source" className="panel-section">
          <PanelSectionTitle action={
            sourceVoc && !sourceDecision ? (
              <button className="btn btn-subtle btn-sm" onClick={() => onNavigate('voc', 'inbox', sourceVoc.id)}>
                <Icon name="arrowRight" size={11} />Open source
              </button>
            ) : null
          }>Source</PanelSectionTitle>
          {sourceDecision && (
            <div style={{ marginBottom: 10 }}>
              <PermissionBlockedPanel
                state={sourceDecision.state}
                category={sourceDecision.category}
                reason={sourceDecision.reason}
                requiredScope={sourceDecision.requiredScope}
                summary={sourceDecision.summary}
              />
              <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 6 }}>
                <Icon name="shield" size={10} />
                Decision <span className="mono" style={{ color: 'var(--text-secondary)' }}>{sourceDecision.decisionId}</span> · evaluated {sourceDecision.evaluatedAt}
              </div>
            </div>
          )}
          <div className="card-nested vstack" style={{ gap: 8 }}>
            <div className="hstack" style={{ gap: 10 }}>
              <SourceTypeIcon type={e.sourceType} size={28} />
              <div className="vstack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <div className="text-xs muted">
                  {m.label} {e.sourceId ? '· ' : ''}
                  {e.sourceId && (
                    sourceDecision
                      ? <span className="mono" style={{ color: 'var(--text-muted)' }}>{e.sourceId} · restricted</span>
                      : <span className="mono" style={{ color: 'var(--text-secondary)' }}>{e.sourceId}</span>
                  )}
                </div>
                <div className="text-sm" style={{ fontWeight: 500 }}>
                  {sourceDecision ? 'Restricted source · evidence body only' : e.sourceTitle}
                </div>
              </div>
            </div>
            {e.isQuote ? (
              <div className="evidence-quote" style={{ borderLeftColor: 'var(--color-aether-blue)' }}>
                "{e.quote}"
              </div>
            ) : (
              <NestedTextBlock>{e.summary}</NestedTextBlock>
            )}
            {e.visibility === 'reporter-visible' ? (
              <Callout tone="cyan" icon="user" title="Reporter-visible">
                이 evidence 의 출처 가시성은 Reporter 에게도 노출됩니다. 인용 시 개인 식별 정보를 점검하세요.
              </Callout>
            ) : (
              <span className="text-xs muted hstack" style={{ gap: 6 }}>
                <Icon name="shield" size={10} />Internal-only · 원본 가시성 규칙을 따릅니다.
              </span>
            )}
          </div>
        </div>

        {/* Linked execution — Findings / Tasks */}
        <div data-anchor="execution" className="panel-section">
          <PanelSectionTitle action={
            <button className="btn btn-subtle btn-sm" onClick={() => setActiveDraftFlow('attach-voc')}><Icon name="link" size={11} />Attach to…</button>
          }>Linked execution</PanelSectionTitle>
          <div className="vstack" style={{ gap: 8 }}>
            {finding ? (
              <button className="card-nested vstack" style={{ gap: 6, textAlign: 'left', width: '100%' }} onClick={() => onNavigate('findings', null, finding.id)}>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span className="text-xs muted">Finding</span>
                  <FindingStatusBadge status={finding.status} />
                </div>
                <div className="text-sm" style={{ fontWeight: 500 }}>
                  <span className="row-id" style={{ marginRight: 6 }}>{finding.id}</span>
                  {finding.title}
                </div>
                <div className="hstack" style={{ gap: 8 }}>
                  <ConfidenceBadge confidence={finding.confidence} />
                  <OutlineBadge>Evidence · {finding.evidenceCount}</OutlineBadge>
                </div>
              </button>
            ) : (
              <div className="card-nested vstack" style={{ gap: 6 }}>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span className="text-xs muted">Finding</span>
                  <span className="text-xs muted">없음</span>
                </div>
                <Button variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setActiveDraftFlow('finding-draft')}>
                  <Icon name="plus" size={11} />Promote to Finding
                </Button>
              </div>
            )}
            {task && (
              <button className="card-nested vstack" style={{ gap: 6, textAlign: 'left', width: '100%' }} onClick={() => onNavigate('tasks', 'board', task.id)}>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span className="text-xs muted">Task</span>
                  <InternalTaskBadge status={task.status} />
                </div>
                <div className="text-sm" style={{ fontWeight: 500 }}>
                  <span className="row-id" style={{ marginRight: 6 }}>{task.id}</span>
                  {task.title}
                </div>
                <div className="hstack" style={{ gap: 8 }}>
                  <SeverityBadge severity={priorityToSeverity(task.priority)} />
                  {task.milestone && <OutlineBadge>{task.milestone}</OutlineBadge>}
                </div>
              </button>
            )}
            {activeDraftFlow && (
              <DesktopFlowDraftPanel
                type={activeDraftFlow}
                sourceKind="Evidence Highlight"
                sourceId={e.id}
                sourceTitle={e.isQuote ? e.quote : e.summary}
                targetKind={activeDraftFlow === 'attach-voc' ? 'VOC' : activeDraftFlow === 'task-request' ? 'Task Request' : 'Finding'}
                targetId={activeDraftFlow === 'attach-voc' ? e.sourceId : (activeDraftFlow === 'finding-draft' ? e.linkedFindingId : e.linkedTaskId)}
                targetTitle={activeDraftFlow === 'attach-voc' ? e.sourceTitle : (activeDraftFlow === 'finding-draft' ? finding?.title : task?.title)}
                intentAction={activeDraftFlow === 'attach-voc' ? 'Attach evidence to source VOC' : activeDraftFlow === 'finding-draft' ? 'Promote to Finding' : 'Request Task'}
                defaultSummary={e.isQuote ? e.quote : e.summary}
                onNavigate={onNavigate}
                onClose={() => setActiveDraftFlow(null)}
              />
            )}
          </div>
        </div>

        {/* Properties */}
        <div data-anchor="properties" className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Managed System"><ManagedSystemPill id={e.managedSystem} /></FieldRow>
          <FieldRow label="Analytics Area">
            {e.analyticsArea ? <OutlineBadge>{window.areaById(e.analyticsArea)?.name || e.analyticsArea}</OutlineBadge> : <span className="muted">—</span>}
          </FieldRow>
          <FieldRow label="Sentiment">{e.sentiment ? <SentimentChip sentiment={e.sentiment} /> : <span className="muted">—</span>}</FieldRow>
          <FieldRow label="Importance">{e.importance ? <ImportanceChip importance={e.importance} /> : <span className="muted">—</span>}</FieldRow>
          <FieldRow label="Visibility">
            {e.visibility === 'reporter-visible' ? (
              <span className="badge" style={{ background: 'rgba(2,184,204,0.1)', color: 'var(--color-cyan-spark)' }}>
                <Icon name="user" size={9} />Reporter-visible
              </span>
            ) : (
              <span className="badge badge-internal-only"><Icon name="shield" size={9} />Internal only</span>
            )}
          </FieldRow>
          <FieldRow label="Created by"><UserChip user={creator} /></FieldRow>
          <FieldRow label="Created">{e.createdAt}</FieldRow>
        </div>

        {/* Trail */}
        <div data-anchor="trail" className="panel-section">
          <PanelSectionTitle>Trail</PanelSectionTitle>
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
                <Button variant="primary" size="sm" onClick={() => runTrailAction('Promotion draft opened', trailDraftFlow)}>
                  <Icon name="plus" size={11} />Draft
                </Button>
                <Button variant="secondary" size="sm" onClick={() => runTrailAction('Attach picker opened', 'attach-voc')}>
                  <Icon name="link" size={11} />Attach
                </Button>
                <Button variant="subtle" size="sm" onClick={() => runTrailAction('Queued for review')}>
                  Queue
                </Button>
              </div>
              {trailStatus && <div className="text-xs muted">{trailStatus}</div>}
              {activeDraftFlow && trailAction && (
                <DesktopFlowDraftPanel
                  type={activeDraftFlow}
                  sourceKind="Evidence Highlight"
                  sourceId={e.id}
                  sourceTitle={e.isQuote ? e.quote : e.summary}
                  targetKind={trailAction.type}
                  targetId={trailAction.action === 'jump' ? (trailAction.type === 'finding' ? finding?.id : task?.id) : null}
                  targetTitle={trailAction.action === 'jump' ? trailAction.title : null}
                  intentAction={trailAction.title}
                  defaultSummary={e.isQuote ? e.quote : e.summary}
                  onNavigate={onNavigate}
                  onClose={() => setActiveDraftFlow(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
function EvidenceScreen({ scope, selectedParam, onNavigate }) {
  const filtered = EvidenceHighlights.filter(e => scope.members.includes(e.managedSystem));
  const [activeTab, setActiveTab] = useState('all');
  const tabs = [
    { key: 'all',             label: 'All',     count: filtered.length },
    { key: 'voc',             label: 'From VOC',     count: filtered.filter(e => e.sourceType === 'voc').length },
    { key: 'survey_response', label: 'From Survey',  count: filtered.filter(e => e.sourceType === 'survey_response').length },
    { key: 'note',            label: 'From note',    count: filtered.filter(e => e.sourceType === 'note').length },
    { key: 'unlinked',        label: 'Unlinked',     count: filtered.filter(e => !e.linkedFindingId && !e.linkedTaskId).length },
  ];
  const shown = (
    activeTab === 'all'      ? filtered :
    activeTab === 'unlinked' ? filtered.filter(e => !e.linkedFindingId && !e.linkedTaskId) :
    filtered.filter(e => e.sourceType === activeTab)
  );
  const [selectedId, setSelectedId] = useState(selectedParam || shown[0]?.id);
  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);
  const selected = selectedId ? (shown.find(e => e.id === selectedId) || filtered.find(e => e.id === selectedId)) : null;

  // Coverage signal — % of evidence linked to a Finding or Task
  const linkedCount = filtered.filter(e => e.linkedFindingId || e.linkedTaskId).length;
  const coverage = filtered.length ? Math.round((linkedCount / filtered.length) * 100) : 0;
  const coverageStatus = coverage > 70 ? 'good' : coverage > 40 ? 'warn' : 'bad';

  return (
    <ListShell
      toolbar={
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <div className="hstack" style={{ gap: 10, paddingRight: 4 }}>
            <span className="text-xs muted">Linked to execution</span>
            <div style={{ width: 80 }}><CoverageBar percent={coverage} status={coverageStatus} /></div>
            <span className="text-xs tabular" style={{
              fontWeight: 600,
              color: coverageStatus === 'good' ? 'var(--text-success)' :
                     coverageStatus === 'warn' ? 'var(--text-warning)' : 'var(--text-danger)',
            }}>{coverage}%</span>
          </div>
          <SearchInput placeholder="Evidence 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="filter" size={12} />Filter</button>
          <Button variant="primary" size="sm" icon="plus">Add highlight</Button>
        </ListToolbar>
      }
      detail={selected && <EvidenceDetailPanel e={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}>
      {shown.length === 0 && (
        <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>표시할 evidence 가 없습니다.</div>
      )}
      {shown.map(e => (
        <EvidenceRow key={e.id} e={e} selected={selected?.id === e.id} onSelect={(x) => setSelectedId(x.id)} />
      ))}
    </ListShell>
  );
}

Object.assign(window, { EvidenceScreen, EvidenceHighlights });
