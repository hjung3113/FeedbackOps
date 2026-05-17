// ============================================================
// FeedbackOps — VOC Inbox + Detail
// ============================================================

const VOC_TABS = [
{ key: 'untriaged', label: 'Untriaged', icon: 'flag', count: 9, tip: '아직 분류되지 않은 VOC' },
{ key: 'high', label: 'High', icon: 'alert', count: 7, tip: 'High / Critical severity' },
{ key: 'unassigned', label: 'Unassigned', icon: 'user', count: 12, urgent: true, tip: '담당자 미지정' },
{ key: 'similar', label: 'Similar', icon: 'layers', count: 4, tip: '유사 VOC 추천 있음' },
{ key: 'no-followup', label: 'No link', icon: 'link', count: 5, tip: 'Finding / Task 연결 없음' }];


function VocRow({ voc, selected, onSelect, checked, onToggleCheck }) {
  const reporter = window.userById(voc.reporter);
  const owner = voc.owner ? window.userById(voc.owner) : null;
  const ms = window.msById(voc.managedSystem);
  const area = voc.analyticsArea ? window.areaById(voc.analyticsArea) : null;
  return (
    <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(voc)}>
      <div className="hstack gap-12" onClick={(e) => e.stopPropagation()}>
        <button className={`row-checkbox ${checked ? 'checked' : ''}`} onClick={() => onToggleCheck(voc.id)}>
          {checked && <Icon name="check" size={9} stroke={3} />}
        </button>
        <SeverityIndicator severity={voc.severity} />
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{voc.id}</span>
          {voc.title}
          {voc.similarCount > 0 &&
          <span className="badge" style={{ background: 'rgba(94, 106, 210, 0.1)', color: 'var(--color-aether-blue)' }}>
              <Icon name="layers" size={9} />
              {voc.similarCount} similar
            </span>
          }
        </div>
        <div className="row-meta">
          <ReporterStatusBadge status={voc.reporterStatus} />
          <SeverityBadge severity={voc.severity} />
          <span>{ms?.name}</span>
          {area && <><span className="dot" /><span>{area.name}</span></>}
          {!area && <><span className="dot" /><span style={{ color: 'var(--color-amber)' }}>No area</span></>}
          <span className="dot" />
          <span>{voc.createdAt}</span>
          {voc.linkedFindingId && <><span className="dot" />
            <EntityHoverPreview type="finding" id={voc.linkedFindingId}>
              <span style={{ color: 'var(--color-cyan-spark)' }}>↔ {voc.linkedFindingId}</span>
            </EntityHoverPreview>
          </>}
        </div>
      </div>
      <div className="row-trailing">
        {owner ? <Avatar user={owner} size="sm" /> :
        <span className="badge" style={{ color: 'var(--color-warning-red)', background: 'rgba(235,87,87,0.08)' }}>Owner 필요</span>
        }
        <Avatar user={reporter} size="sm" />
      </div>
    </div>);

}

function VocList({ vocs, selectedId, onSelect }) {
  const [checked, setChecked] = useState(new Set());
  const toggleCheck = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="object-list">
      {checked.size > 0 &&
      <div className="hstack" style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--color-deep-slate)',
        gap: 8
      }}>
          <span className="text-sm">{checked.size} selected</span>
          <span className="toolbar-divider" />
          <Button variant="subtle" size="sm" icon="user">Assign</Button>
          <Button variant="subtle" size="sm" icon="flag">Set severity</Button>
          <Button variant="subtle" size="sm" icon="layers">Add to cluster</Button>
          <Button variant="subtle" size="sm" icon="finding">Create finding</Button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-subtle btn-sm" onClick={() => setChecked(new Set())}>Clear</button>
        </div>
      }
      {vocs.map((voc) =>
      <VocRow key={voc.id}
      voc={voc}
      selected={selectedId === voc.id}
      onSelect={onSelect}
      checked={checked.has(voc.id)}
      onToggleCheck={toggleCheck} />
      )}
    </div>);

}

// ============================================================
// VOC Detail Panel
// ============================================================
function VocDetailPanel({ voc, onClose, onNavigate }) {
  const reporter = window.userById(voc.reporter);
  const owner = voc.owner ? window.userById(voc.owner) : null;
  const ms = window.msById(voc.managedSystem);
  const area = voc.analyticsArea ? window.areaById(voc.analyticsArea) : null;
  const finding = voc.linkedFindingId ? window.findingById(voc.linkedFindingId) : null;
  const task = voc.linkedTaskId ? window.taskById(voc.linkedTaskId) : null;

  // Pack 8 — unified permission_decision envelope (per-key lookup).
  const findingDecision = window.getPermissionDecision(voc, 'linkedFinding');

  const [composerTab, setComposerTab] = useState('public');
  // Pack 8 — Reporter-facing status change rules + public-copy preview.
  // `nextReporterStatus` is the staged transition; `publicDraft` is the
  // exact HTML the reporter will see. Both reset when the composer tab
  // changes so the preview never leaks between drafts.
  const [nextReporterStatus, setNextReporterStatus] = useState(voc.reporterStatus);
  const [publicDraft, setPublicDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [trailAction, setTrailAction] = useState(null);
  const [trailStatus, setTrailStatus] = useState('');
  const [activeDraftFlow, setActiveDraftFlow] = useState(null);
  const scrollRef = useRef(null);
  useEffect(() => {
    setNextReporterStatus(voc.reporterStatus);
    setPublicDraft('');
    setReplyDraft('');
    setTrailAction(null);
    setTrailStatus('');
    setActiveDraftFlow(null);
  }, [voc.id]);

  const trailNodes = [
    { key: 'source-voc', type: 'voc', title: voc.title, meta: `${voc.id} · ${reporter.name}` },
    voc.similarCount > 0 ?
    { key: 'evidence-cluster', type: 'evidence', title: 'Evidence highlight 추가', meta: `Cluster — ${voc.similarCount + 1} VOCs 기반`, action: 'Draft' } :
    { key: 'evidence-create', type: 'evidence', placeholder: true, title: 'Evidence highlight 추가', meta: '선택 사항' },
    finding ?
    (findingDecision ?
      { key: 'finding-restricted', type: 'finding', placeholder: true, title: 'Restricted Finding', meta: 'access limited · see panel above' } :
      { key: 'finding-linked', type: 'finding', title: finding.title, meta: `${finding.id} · ${finding.status}`, action: 'jump' }) :
    { key: 'finding-create', type: 'finding', placeholder: true, title: 'Finding 작성 또는 연결', meta: 'CTA: Create Finding' },
    task ?
    { key: 'task-linked', type: 'task', title: task.title, meta: `${task.id} · ${task.status}`, action: 'jump' } :
    { key: 'task-link', type: 'task', placeholder: true, title: 'Task / Request 연결', meta: 'Finding 확정 후' },
    { key: 'outcome-plan', type: 'outcome', placeholder: true, title: 'Outcome survey (선택)', meta: 'Released 이후' },
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
    trailAction?.type === 'evidence' ? 'evidence-draft' :
    trailAction?.type === 'finding' ? 'finding-draft' :
    trailAction?.type === 'request' || trailAction?.type === 'task' ? 'task-request' :
    'task-request';
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'triage', label: 'Triage' },
    { id: 'description', label: 'Description' },
    findingDecision && { id: 'finding', label: 'Finding' },
    (finding || task) && !findingDecision && { id: 'execution', label: 'Execution' },
    { id: 'trail', label: 'Trail' },
    { id: 'public', label: 'Public' },
    { id: 'internal', label: 'Internal' },
    { id: 'compose', label: 'Compose' },
  ].filter(Boolean);

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="voc" id={voc.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="VOC" entityId={voc.id}
          copyHash={`#route=voc&view=inbox&param=${voc.id}`} />
      } />

      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

      <div className="panel-scroll" ref={scrollRef}>
        <div data-anchor="overview">
          <PanelTitleBlock title={voc.title}>
            <ReporterStatusBadge status={voc.reporterStatus} />
            <SeverityBadge severity={voc.severity} />
            <span className="text-xs muted">·</span>
            <span className="text-xs muted">Reported by <strong style={{ color: 'var(--text-secondary)' }}>{reporter.name}</strong></span>
            <span className="text-xs muted">· {voc.createdAt}</span>
          </PanelTitleBlock>
        </div>

        {/* Identity / triage fields */}
        <div data-anchor="triage" className="panel-section">
          <PanelSectionTitle>Triage</PanelSectionTitle>
          <FieldRow label="Owner">
            {owner ? <UserChip user={owner} /> :
            <span style={{ color: 'var(--color-warning-red)' }}>Unassigned</span>}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>변경</button>
          </FieldRow>
          <FieldRow label="Managed System">
            <ManagedSystemPill id={voc.managedSystem} />
            <span className="text-xs muted">· reporter 변경 불가</span>
          </FieldRow>
          <FieldRow label="Analytics Area">
            {area ? <span>{area.name}</span> :
            <button className="btn btn-subtle btn-sm">
                <Icon name="plus" size={11} />Link area
              </button>
            }
          </FieldRow>
          <FieldRow label="Source Context">
            <OutlineBadge>{voc.sourceContext}</OutlineBadge>
          </FieldRow>
          <FieldRow label="Cluster">
            {voc.cluster ?
            <span className="badge" style={{ color: 'var(--color-aether-blue)', background: 'rgba(94,106,210,0.1)' }}>
                <Icon name="layers" size={10} />
                cluster · {voc.similarCount + 1} VOCs
              </span> :

            <button className="btn btn-subtle btn-sm">
                <Icon name="plus" size={11} />Cluster ({voc.similarCount} similar)
              </button>
            }
          </FieldRow>
        </div>

        {/* Description */}
        <div data-anchor="description" className="panel-section">
          <PanelSectionTitle>Description</PanelSectionTitle>
          <NestedTextBlock>{voc.description}</NestedTextBlock>
        </div>

        {/* Permission-limited linked Finding — rendered when the backend
            marks the linked Finding as summary_visible / request_access /
            denied. The Linked entity trail below will reflect the safe
            placeholder so the chain stays readable.
            Pack 8 — reads from unified permissionDecisions envelope. */}
        {findingDecision && (
          <div data-anchor="finding" className="panel-section">
            <PanelSectionTitle>Linked Finding</PanelSectionTitle>
            <PermissionBlockedPanel
              state={findingDecision.state}
              category={findingDecision.category}
              reason={findingDecision.reason}
              requiredScope={findingDecision.requiredScope}
              summary={findingDecision.summary}
            />
            <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 6 }}>
              <Icon name="shield" size={10} />
              Decision <span className="mono" style={{ color: 'var(--text-secondary)' }}>{findingDecision.decisionId}</span> · evaluated {findingDecision.evaluatedAt}
            </div>
          </div>
        )}

        {/* Linked execution — concrete navigable rows for the Finding /
            Task linked to this VOC.  Pack 11.  Sits above the abstract
            "Linked entity trail" so users land on actionable cards first.
            Trail below keeps the placeholder chain narrative readable. */}
        {(finding || task) && !findingDecision && (          <div data-anchor="execution" className="panel-section">
            <PanelSectionTitle>Linked execution</PanelSectionTitle>
            <div className="vstack" style={{ gap: 6 }}>
              {finding && (
                <EntityRelationRow
                  left={{ type: 'finding', id: finding.id }}
                  title={finding.title}
                  meta={<><span className="mono">{finding.id}</span> · evidence {finding.evidenceCount}</>}
                  trailing={<FindingStatusBadge status={finding.status} />}
                  onClick={() => onNavigate?.('findings', null, finding.id)}
                />
              )}
              {task && (
                <EntityRelationRow
                  left={{ type: 'task', id: task.id }}
                  title={task.title}
                  meta={<><span className="mono">{task.id}</span> · {task.estimate}</>}
                  trailing={<InternalTaskBadge status={task.status} />}
                  onClick={() => onNavigate?.('tasks', 'board', task.id)}
                />
              )}
            </div>
          </div>
        )}

        {/* Linked Entity Trail */}
        <div data-anchor="trail" className="panel-section">
          <PanelSectionTitle action={<button className="btn btn-subtle btn-sm">상세보기</button>}>
            Linked entity trail
          </PanelSectionTitle>
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
                <Button variant="primary" size="sm" onClick={() => runTrailAction('Draft opened', trailDraftFlow)}>
                  <Icon name="plus" size={11} />Draft
                </Button>
                <Button variant="secondary" size="sm" onClick={() => runTrailAction('Existing link picker opened', trailAction.type === 'evidence' ? 'attach-voc' : 'task-request')}>
                  <Icon name="link" size={11} />Link existing
                </Button>
                <Button variant="subtle" size="sm" onClick={() => runTrailAction('Skipped for now')}>
                  Later
                </Button>
              </div>
              {trailStatus && <div className="text-xs muted">{trailStatus}</div>}
              {activeDraftFlow && (
                <DesktopFlowDraftPanel
                  type={activeDraftFlow}
                  sourceKind="VOC"
                  sourceId={voc.id}
                  sourceTitle={voc.title}
                  targetKind={trailAction.type}
                  targetId={trailAction.action === 'jump' ? (trailAction.type === 'finding' ? finding?.id : task?.id) : null}
                  targetTitle={trailAction.action === 'jump' ? trailAction.title : null}
                  intentAction={trailAction.title}
                  defaultSummary={trailAction.type === 'evidence'
                    ? voc.description
                    : `${voc.id}에서 확인된 ${voc.title} 후속 실행 요청`}
                  onNavigate={onNavigate}
                  onClose={() => setActiveDraftFlow(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Public conversation timeline (reporter-visible) */}
        <div data-anchor="public" className="panel-section">
          <PanelSectionTitle action={<span className="badge badge-public"><Icon name="megaphone" size={9} />Public timeline</span>}>
            Reporter-visible conversation
          </PanelSectionTitle>
          <div className="timeline">
            <div className="timeline-item">
              <Avatar user={reporter} size="sm" />
              <div className="timeline-item-body">
                <div className="timeline-meta">
                  <strong>{reporter.name}</strong> · 처음 제출 · {voc.createdAt}
                </div>
                <div className="timeline-content reporter-reply">
                  {voc.description.slice(0, 110)}{voc.description.length > 110 ? '…' : ''}
                </div>
              </div>
            </div>
            {voc.linkedFindingId &&
            <div className="timeline-item">
                <Avatar user={owner || reporter} size="sm" />
                <div className="timeline-item-body">
                  <div className="timeline-meta">
                    <strong>{(owner || reporter).name}</strong> · Public update · 1시간 전
                  </div>
                  <div className="timeline-content public-update">
                    문의 주신 내용은 확인되었습니다. 현재 원인 분석을 진행 중이며 이번 주 내 임시 우회 안내를 드리겠습니다.
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        {/* Internal-only timeline */}
        <div data-anchor="internal" className="panel-section">
          <PanelSectionTitle action={<span className="badge badge-internal-only"><Icon name="user" size={9} />Internal only</span>}>
            Internal discussion
          </PanelSectionTitle>
          <div className="timeline">
            <div className="timeline-item">
              <Avatar user={window.userById('u-2')} size="sm" />
              <div className="timeline-item-body">
                <div className="timeline-meta"><strong>박서연</strong> · 35분 전</div>
                <div className="timeline-content internal">
                  Chrome 124에서 재현 확인. Tableau 5.x에서 사이드바 z-index가 우선순위 변경된 케이스로 추정. FIN-179 와 root cause 별개.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Conversation composer */}
        <div data-anchor="compose" className="panel-section">
          <PanelSectionTitle>Compose</PanelSectionTitle>
          <div className="composer">
            <div className="composer-tabs">
              <button className={`composer-tab ${composerTab === 'public' ? 'active public' : ''}`} onClick={() => setComposerTab('public')}>
                <Icon name="megaphone" size={11} style={{ marginRight: 6 }} />Public update
              </button>
              <button className={`composer-tab ${composerTab === 'reply' ? 'active reply' : ''}`} onClick={() => setComposerTab('reply')}>
                Reporter reply
              </button>
              <button className={`composer-tab ${composerTab === 'internal' ? 'active internal' : ''}`} onClick={() => setComposerTab('internal')}>
                Internal note
              </button>
            </div>
            <RichEditor
              surface={
                composerTab === 'public'   ? 'public-update' :
                composerTab === 'reply'    ? 'reporter-reply' :
                'internal-comment'
              }
              key={composerTab /* reset per-surface draft on tab switch */}
              minHeight={84}
              onChange={
                composerTab === 'public' ? setPublicDraft :
                composerTab === 'reply'  ? setReplyDraft  : undefined
              }
            />

            {composerTab === 'public' && (
              <ReporterStatusChangeBlock
                voc={voc}
                task={task}
                nextStatus={nextReporterStatus}
                onChangeStatus={setNextReporterStatus}
                draftHtml={publicDraft}
                owner={owner || reporter}
              />
            )}

            <div className="composer-footer">
              <div className="composer-status-row">
                {composerTab === 'public' && (
                  nextReporterStatus === voc.reporterStatus ? (
                    <span className="text-xs muted">Reporter-facing status는 그대로 유지됩니다.</span>
                  ) : (
                    <span className="text-xs hstack" style={{ gap: 4, color: 'var(--color-neon-lime)' }}>
                      <Icon name="megaphone" size={10} />
                      <strong>{window.ReporterStatusLabels[voc.reporterStatus].label}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      <strong>{window.ReporterStatusLabels[nextReporterStatus].label}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>로 함께 게시</span>
                    </span>
                  )
                )}
                {composerTab === 'reply' && <span className="text-xs muted">공개 타임라인에 기록됨</span>}
                {composerTab === 'internal' && <span className="text-xs muted">팀원 6명에게 보임</span>}
              </div>
              <div className="hstack">
                <button className="btn btn-subtle btn-sm"
                  disabled={composerTab === 'internal'}
                  onClick={() => setPreviewOpen(true)}>
                  <Icon name="expand" size={11} />Preview
                </button>
                <Button variant="primary" size="sm" disabled={composerTab === 'public' && window.reporterStatusGate(nextReporterStatus, voc, task)}>
                  {composerTab === 'public' ? 'Publish update' : composerTab === 'reply' ? 'Send reply' : 'Add note'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky next-action footer */}
      <div className="panel-footer">
        <Button variant="primary" className="btn-block">
          <Icon name={findingDecision ? 'shield' : 'finding'} size={12} />
          {findingDecision
            ? 'Request Finding access'
            : finding ? 'Open finding' : 'Create finding'}
        </Button>
        <Button variant="secondary" size="md">
          <Icon name="more" size={14} />
        </Button>
      </div>

      {/* Pack 12 — Composer preview modal */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          composerTab === 'public' ? 'Public update — Reporter preview' :
          composerTab === 'reply'  ? 'Reporter reply preview' :
          'Internal note preview'
        }>
        {composerTab === 'public' ? (
          <ComposerPublicPreview voc={voc} owner={owner || reporter}
            nextStatus={nextReporterStatus} draftHtml={publicDraft} />
        ) : composerTab === 'reply' ? (
          <ComposerReplyPreview voc={voc} owner={owner || reporter} reporter={reporter}
            draftHtml={replyDraft} />
        ) : (
          <div className="text-sm muted">내부 노트는 미리보기 대신 발행 후 확인하세요.</div>
        )}
      </PreviewModal>
    </aside>);

}

// ============================================================
// ReporterStatusChangeBlock — Pack 8
// Public-update composer sub-surface. Drives:
//   1. allowed-only status picker (rules per docs/design/04-voc-system.md)
//   2. forbidden-state explanations (so the actor knows WHY a jump is blocked)
//   3. linked-Task gate banner (e.g. cannot mark 해결됨 while Task is in review)
//   4. "Reporter sees" preview — exact public-facing copy + new status pill
//
// The block is purposely inline, not extracted to components.jsx, because
// it is uniquely tied to one composer surface and depends on RichEditor
// HTML output. If a second consumer appears (eg Outcome survey composer),
// promote then.
// ============================================================
function ReporterStatusChangeBlock({ voc, task, nextStatus, onChangeStatus, draftHtml, owner }) {
  const TRANSITIONS = window.REPORTER_STATUS_TRANSITIONS[voc.reporterStatus] || { allowed: [], forbidden: {} };
  const allowedNext = TRANSITIONS.allowed;
  const forbiddenMap = TRANSITIONS.forbidden;
  const isStaged = nextStatus !== voc.reporterStatus;
  const linkedTaskGate = window.reporterStatusGate(nextStatus, voc, task);

  // Render order in the picker: current first, then allowed, then forbidden (disabled).
  const allKeys = ['received','reviewing','assigned','progress','prep','resolved','reopened','closed'];
  const pickerOrder = [voc.reporterStatus, ...allowedNext, ...allKeys.filter(k => k !== voc.reporterStatus && !allowedNext.includes(k))];

  // Strip empty draft so the preview falls back to the placeholder copy.
  const trimmed = (draftHtml || '').replace(/<[^>]*>/g, '').trim();
  const showBody = trimmed.length > 0;

  return (
    <div style={{
      marginTop: 10,
      padding: 12,
      background: 'rgba(20, 40, 160,0.04)',
      borderRadius: 6,
      boxShadow: 'inset 0 0 0 1px rgba(20, 40, 160,0.18)',
    }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <Icon name="megaphone" size={11} style={{ color: 'var(--color-neon-lime)' }} />
        <span className="text-xs" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-neon-lime)' }}>
          Reporter-facing status 변경
        </span>
        <HelpTip size={12} text="공개 카피와 함께 노출됩니다. spec 의 state machine 에 명시된 전이만 활성화됩니다." />
      </div>

      <div className="hstack" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="text-xs muted">현재</span>
        <ReporterStatusBadge status={voc.reporterStatus} />
        <span style={{ color: 'var(--text-muted)' }}>→</span>
        <span className="text-xs muted">다음</span>
        <select
          value={nextStatus}
          onChange={(e) => onChangeStatus(e.target.value)}
          style={{
            padding: '5px 8px',
            background: 'var(--color-pitch-black)',
            border: 'none', borderRadius: 6,
            boxShadow: 'inset 0 0 0 1px var(--border-strong)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit', fontSize: 'var(--text-sm)',
            outline: 'none',
          }}>
          {pickerOrder.map(key => {
            const label = window.ReporterStatusLabels[key].label;
            const isCurrent = key === voc.reporterStatus;
            const isAllowed = isCurrent || allowedNext.includes(key);
            return (
              <option key={key} value={key} disabled={!isAllowed}>
                {label}{isCurrent ? ' (현재)' : !isAllowed ? ' · 차단됨' : ''}
              </option>
            );
          })}
        </select>
        {isStaged && !linkedTaskGate && (
          <span className="badge" style={{ background: 'rgba(20, 40, 160,0.16)', color: 'var(--color-neon-lime)' }}>
            <Icon name="check" size={9} />변경 예정
          </span>
        )}
      </div>

      {/* Forbidden-state explanation — render when actor has selected a
          disallowed status (only possible via keyboard or if rules change). */}
      {!allowedNext.includes(nextStatus) && nextStatus !== voc.reporterStatus && (
        <Callout tone="red" icon="alert" title="이 전환은 허용되지 않습니다">
          {forbiddenMap[nextStatus] || '현재 상태에서 직접 전이할 수 있는 다음 상태가 아닙니다. spec 의 reporter-facing status 전이 규칙을 따릅니다.'}
        </Callout>
      )}

      {/* Linked-Task gate — e.g. 해결됨 requires the linked Task to be released. */}
      {linkedTaskGate && (
        <Callout tone="amber" icon="alert" title="연결된 Task 상태 확인 필요"
          action={task ? <Button variant="subtle" size="sm"><Icon name="arrowRight" size={10} />Open task</Button> : null}>
          {linkedTaskGate}
        </Callout>
      )}

      {/* Reporter preview — exact public-facing card. Mirrors the
          reporter's inbox row: status pill, owner attribution, body
          excerpt, and the public-safe footer reminder. */}
      <div className="vstack" style={{ gap: 6, marginTop: 12 }}>
        <span className="text-xs muted hstack" style={{ gap: 6 }}>
          <Icon name="user" size={10} />
          Reporter가 보게 될 화면 미리보기
        </span>
        <div style={{
          padding: 12,
          background: 'var(--color-pitch-black)',
          borderRadius: 6,
          boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        }}>
          <div className="hstack" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="row-id">{voc.id}</span>
            <ReporterStatusBadge status={nextStatus} />
            {isStaged && (
              <span className="badge" style={{ background: 'rgba(20, 40, 160,0.18)', color: 'var(--color-neon-lime)', fontSize: 10 }}>
                업데이트
              </span>
            )}
          </div>
          <div className="text-sm" style={{ fontWeight: 500, marginBottom: 8, color: 'var(--text-primary)' }}>
            {voc.title}
          </div>
          <div className="hstack" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
            <Avatar user={owner} size="sm" />
            <div className="vstack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="text-xs muted">
                <strong style={{ color: 'var(--text-secondary)' }}>{owner.name}</strong> · 방금
              </span>
              {showBody ? (
                <div
                  className="text-sm"
                  style={{ color: 'var(--text-primary)', lineHeight: 1.55, wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: draftHtml }}
                />
              ) : (
                <span className="text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  공개 메시지 본문을 입력하면 여기에서 미리 볼 수 있습니다.
                </span>
              )}
            </div>
          </div>
          <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <Icon name="shield" size={10} />
            첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다. 내부 식별자(VOC id, Task id 등)는 자동으로 가려집니다.
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ComposerPublicPreview / ComposerReplyPreview — Pack 12
// Mirror what the Reporter inbox renders. Public preview echoes the
// status pill + body excerpt. Reply preview frames it as a message
// thread bubble. Internal note has no preview (intentional).
// ============================================================
function ComposerPublicPreview({ voc, owner, nextStatus, draftHtml }) {
  const trimmed = (draftHtml || '').replace(/<[^>]*>/g, '').trim();
  return (
    <div className="vstack" style={{ gap: 12 }}>
      <span className="text-xs muted">Reporter 가 이 화면을 받습니다. 내부 식별자·@멘션은 자동으로 가려집니다.</span>
      <div style={{
        padding: 14, background: 'var(--color-pitch-black)', borderRadius: 8,
        boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
      }}>
        <div className="hstack" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="row-id">{voc.id}</span>
          <ReporterStatusBadge status={nextStatus} />
          {nextStatus !== voc.reporterStatus && (
            <span className="badge" style={{ background: 'rgba(20, 40, 160,0.18)', color: 'var(--color-neon-lime)', fontSize: 10 }}>업데이트</span>
          )}
        </div>
        <div className="text-md" style={{ fontWeight: 600, marginBottom: 12 }}>{voc.title}</div>
        <div className="hstack" style={{ gap: 10, alignItems: 'flex-start' }}>
          <Avatar user={owner} size="sm" />
          <div className="vstack" style={{ gap: 4, flex: 1 }}>
            <span className="text-xs muted">
              <strong style={{ color: 'var(--text-secondary)' }}>{owner.name}</strong> · 방금
            </span>
            {trimmed ? (
              <div className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: draftHtml }} />
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                (본문이 비어있습니다)
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs muted hstack" style={{ gap: 6 }}>
        <Icon name="shield" size={10} />
        {nextStatus === voc.reporterStatus
          ? '상태는 그대로 유지됩니다.'
          : `Reporter-facing 상태가 "${window.ReporterStatusLabels[voc.reporterStatus].label}" → "${window.ReporterStatusLabels[nextStatus].label}" 로 변경됩니다.`}
      </div>
    </div>
  );
}

function ComposerReplyPreview({ voc, owner, reporter, draftHtml }) {
  const trimmed = (draftHtml || '').replace(/<[^>]*>/g, '').trim();
  return (
    <div className="vstack" style={{ gap: 12 }}>
      <span className="text-xs muted">Reporter 1:1 답장 화면 미리보기입니다. 공개 타임라인에도 기록됩니다.</span>
      <div style={{
        padding: 14, background: 'var(--color-pitch-black)', borderRadius: 8,
        boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Reporter's original message bubble for context */}
        <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Avatar user={reporter} size="sm" />
          <div style={{ flex: 1, background: 'var(--surface-card)', padding: 10, borderRadius: 6, fontSize: 'var(--text-sm)' }}>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>{reporter.name} · {voc.createdAt}</div>
            {voc.description.slice(0, 140)}{voc.description.length > 140 ? '…' : ''}
          </div>
        </div>
        {/* The owner's reply */}
        <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Avatar user={owner} size="sm" />
          <div style={{ flex: 1, background: 'rgba(94,106,210,0.12)', padding: 10, borderRadius: 6, fontSize: 'var(--text-sm)' }}>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>{owner.name} · 방금</div>
            {trimmed ? (
              <div dangerouslySetInnerHTML={{ __html: draftHtml }} />
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(메시지 본문이 비어있습니다)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VOC Screen wrapper
// ============================================================
const VOC_FILTER_CATEGORIES = [
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' },
    { value: 'high',     label: 'High' },
    { value: 'medium',   label: 'Medium' },
    { value: 'low',      label: 'Low' },
  ]},
  { key: 'reporterStatus', label: 'Reporter status', options: [
    { value: 'received',  label: '접수됨' },
    { value: 'reviewing', label: '검토 중' },
    { value: 'assigned',  label: '담당자 배정됨' },
    { value: 'progress',  label: '처리 중' },
    { value: 'resolved',  label: '해결됨' },
  ]},
  { key: 'owner', label: 'Owner', options: [
    { value: '__assigned',   label: '담당자 있음' },
    { value: '__unassigned', label: '미배정' },
  ]},
];
const VOC_SORT_FIELDS = [
  { key: 'createdAt', label: '최신순' },
  { key: 'severity',  label: 'Severity' },
  { key: 'status',    label: 'Reporter status' },
];
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const REPORTER_STATUS_RANK = { received: 0, reviewing: 1, assigned: 2, progress: 3, prep: 4, resolved: 5, reopened: 6, closed: 7 };

function VocScreen({ view, selectedParam, onNavigate, scope }) {
  const filterByScope = (list) => list.filter((v) => scope.members.includes(v.managedSystem));

  const filtered = filterByScope(window.Vocs);
  const [activeTab, setActiveTab] = useState('untriaged');
  const [selectedId, setSelectedId] = useState(selectedParam || filtered[0]?.id);
  const [filters, setFilters] = useState({ severity: new Set(), reporterStatus: new Set(), owner: new Set() });
  const [sortValue, setSortValue] = useState('');

  const toggleFilter = (cat, val, on) => {
    setFilters(prev => {
      const next = new Set(prev[cat]);
      if (on) next.add(val); else next.delete(val);
      return { ...prev, [cat]: next };
    });
  };
  const clearFilters = () => setFilters({ severity: new Set(), reporterStatus: new Set(), owner: new Set() });

  const tabVocs = useMemo(() => {
    let list = filtered;
    if (activeTab === 'unassigned') list = list.filter((v) => !v.owner);
    else if (activeTab === 'high') list = list.filter((v) => v.severity === 'high' || v.severity === 'critical');
    else if (activeTab === 'similar') list = list.filter((v) => v.similarCount > 0);
    else if (activeTab === 'no-followup') list = list.filter((v) => !v.linkedFindingId && !v.linkedTaskId);

    // Apply filter popover selections.
    if (filters.severity.size) list = list.filter(v => filters.severity.has(v.severity));
    if (filters.reporterStatus.size) list = list.filter(v => filters.reporterStatus.has(v.reporterStatus));
    if (filters.owner.size) {
      list = list.filter(v => (
        (filters.owner.has('__assigned') && v.owner) ||
        (filters.owner.has('__unassigned') && !v.owner)
      ));
    }
    // Apply sort.
    if (sortValue) {
      const [field, dir] = sortValue.split(':');
      const mul = dir === 'desc' ? -1 : 1;
      list = [...list].sort((a, b) => {
        if (field === 'severity') return mul * ((SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
        if (field === 'status')   return mul * ((REPORTER_STATUS_RANK[a.reporterStatus] ?? 99) - (REPORTER_STATUS_RANK[b.reporterStatus] ?? 99));
        // createdAt — mock data uses relative strings; rough lexical sort.
        return mul * String(a.createdAt).localeCompare(String(b.createdAt));
      });
    }
    return list;
  }, [activeTab, filtered, filters, sortValue]);

  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);

  const selected = selectedId
    ? (tabVocs.find((v) => v.id === selectedId) || filtered.find((v) => v.id === selectedId))
    : null;

  return (
    <>
      <div className="main-region">
        <ListToolbar
          tabs={VOC_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={
            <Button variant="primary" size="sm" icon="plus" onClick={() => onNavigate('voc-new')}>New VOC</Button>
          }>
          <SearchInput placeholder="필터, 키워드…" />
          <ListFilterButton categories={VOC_FILTER_CATEGORIES}
            applied={filters} onChange={toggleFilter} onClear={clearFilters} />
          <ListSortButton fields={VOC_SORT_FIELDS} value={sortValue} onChange={setSortValue} />
        </ListToolbar>

        <div className="main-scroll" style={{ padding: 0 }}>
          <VocList vocs={tabVocs} selectedId={selected?.id} onSelect={(v) => setSelectedId(v.id)} />
        </div>
      </div>
      {selected && <VocDetailPanel voc={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>);
}

Object.assign(window, { VocScreen });
