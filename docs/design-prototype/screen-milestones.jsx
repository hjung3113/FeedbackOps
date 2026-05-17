// ============================================================
// FeedbackOps — Tasks · Milestones
// Route: tasks (view: milestones)
// ============================================================
// Milestone = lightweight Task grouping. It is created (often
// from a Finding) and answers "Why this milestone exists" with
// source + analytics area + evidence count + linked tasks.
//
// Spec sources:
//   - docs/design/06-task-project-system.md  (FR-TASK-004 Manage Milestone)
//   - docs/design/01-domain-model.md          (Milestone)

// ------------------------------------------------------------
// Mock data
// ------------------------------------------------------------
const Milestones = [
  {
    id: 'M-21',
    title: 'SSO Stabilization',
    why: 'Power BI 임베디드 보고서에서 SSO 세션 만료 후 재인증 흐름이 없습니다. 401 응답을 받은 사용자가 정상적인 안내 없이 빈 화면을 보고 있어, 임베디드 컨테이너 전반에 재인증 핸들러가 필요합니다.',
    status: 'in_progress',
    sourceFindingId: 'FIN-181',
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    owner: 'u-2',
    evidenceCount: 7,
    taskIds: ['TASK-902'],
    plannedTasks: [
      { id: 'M-21-P1', title: '재인증 retry 핸들러', startDate: '2026-05-25', endDate: '2026-06-10' },
      { id: 'M-21-P2', title: 'Session monitor 대시보드', startDate: '2026-06-01', endDate: '2026-06-15' },
    ],
    startDate: '2026-05-10',
    target: '2026-06-15',
    createdAt: '오늘',
    outcomeSurvey: null,
  },
  {
    id: 'M-19',
    title: 'Reporting Performance',
    why: '월간 매출 리포트의 쿼리 플랜이 인덱스를 사용하지 않아 정렬 단계에서 풀스캔이 발생합니다. 다운로드 속도가 평소 5초에서 30초 이상으로 느려졌고, Q3 사용성 설문 응답에서도 다수 보고가 누적되었습니다.',
    status: 'in_progress',
    sourceFindingId: 'FIN-179',
    managedSystem: 'tableau',
    analyticsArea: 'revenue',
    owner: 'u-1',
    evidenceCount: 9,
    taskIds: ['TASK-901'],
    plannedTasks: [
      { id: 'M-19-P1', title: 'Index 마이그레이션 스크립트', startDate: '2026-05-18', endDate: '2026-05-28' },
    ],
    startDate: '2026-05-04',
    target: '2026-05-28',
    createdAt: '2일 전',
    outcomeSurvey: 'SRV-19',
  },
  {
    id: 'M-22',
    title: 'Notification Reliability',
    why: 'Looker 알림 워커가 토큰 만료 시 조용히 종료되어 일주일째 알림이 발송되지 않았습니다. 토큰 갱신 로직과 모니터링 큐 대시보드가 함께 필요합니다.',
    status: 'planning',
    sourceFindingId: 'FIN-178',
    managedSystem: 'looker',
    analyticsArea: 'marketing',
    owner: 'u-5',
    evidenceCount: 2,
    taskIds: ['TASK-899', 'TASK-898'],
    plannedTasks: [],
    startDate: '2026-05-20',
    target: '2026-07-04',
    createdAt: '어제',
    outcomeSurvey: null,
  },
  {
    id: 'M-20',
    title: 'Korean PDF Output',
    why: 'Metabase PDF 내보내기 워커 컨테이너에 KR 폰트가 없어 한글 셀이 깨집니다. 운영 빌드 스크립트 보완과 회귀 테스트가 필요합니다.',
    status: 'planning',
    sourceFindingId: 'FIN-177',
    managedSystem: 'metabase',
    analyticsArea: 'cs-ops',
    owner: 'u-1',
    evidenceCount: 4,
    taskIds: [],
    plannedTasks: [
      { id: 'M-20-P1', title: 'KR 폰트 컨테이너 추가', startDate: '2026-05-25', endDate: '2026-06-10' },
      { id: 'M-20-P2', title: 'Regression 테스트', startDate: '2026-06-05', endDate: '2026-06-30' },
    ],
    startDate: '2026-05-25',
    target: '2026-06-30',
    createdAt: '이번 주',
    outcomeSurvey: null,
  },
  {
    id: 'M-18',
    title: 'Q1 UX Polish',
    why: '모바일/iPad 시야에서 필터 패널 잘림, 즐겨찾기 정렬 등 가벼운 UX 잔여 이슈를 함께 정리합니다.',
    status: 'released',
    sourceFindingId: null,
    managedSystem: 'tableau',
    analyticsArea: null,
    owner: 'u-3',
    evidenceCount: 3,
    taskIds: ['TASK-879', 'TASK-880'],
    plannedTasks: [],
    startDate: '2026-04-08',
    target: '2026-04-30',
    createdAt: '한 달 전',
    outcomeSurvey: 'SRV-18',
  },
];

const MILESTONE_STATUS_META = {
  planning:    { label: 'Planning',    color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.12)' },
  in_progress: { label: 'In progress', color: 'var(--color-aether-blue)', bg: 'rgba(94,106,210,0.12)' },
  blocked:     { label: 'Blocked',     color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)' },
  released:    { label: 'Released',    color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.12)' },
};

function MilestoneStatusBadge({ status }) {
  const m = MILESTONE_STATUS_META[status] || MILESTONE_STATUS_META.planning;
  return (
    <span className="badge" style={{ background: m.bg, color: m.color }}>
      <span className="badge-dot" />{m.label}
    </span>
  );
}

// Compute progress from task statuses
function milestoneProgress(m) {
  const tasks = m.taskIds.map(id => window.taskById(id)).filter(Boolean);
  const planned = m.plannedTasks || [];
  const totalKnown = tasks.length;
  const totalPlanned = totalKnown + planned.length;
  const releasedDone = tasks.filter(t => t.status === 'released' || t.status === 'done').length;
  const inFlight     = tasks.filter(t => ['doing','review'].includes(t.status)).length;
  const todoBacklog  = tasks.filter(t => ['todo','backlog'].includes(t.status)).length;
  const percent = totalPlanned === 0 ? 0 : Math.round(((releasedDone) / totalPlanned) * 100);
  return { tasks, planned, totalKnown, totalPlanned, releasedDone, inFlight, todoBacklog, percent };
}

// ------------------------------------------------------------
// Gantt visualization atoms (TASK_BAR_COLORS, TASK_GANTT_TODAY,
// milestoneTaskRows, MilestoneMiniTimeline, TaskGantt) live in
// screen-milestone-gantt.jsx — loaded before this file. We pick them
// off `window` so this screen file stays under the line-count budget.
// ------------------------------------------------------------
const { milestoneTaskRows, MilestoneMiniTimeline, TaskGantt } = window;

// ------------------------------------------------------------
// Milestone list row — replaces the previous card grid.
// Anatomy: id · status · MS pill · title · why excerpt · meta · mini-timeline · owner
// ------------------------------------------------------------
function MilestoneRow({ m, selected, onSelect }) {
  const owner = window.userById(m.owner);
  const finding = m.sourceFindingId ? window.findingById(m.sourceFindingId) : null;
  const prog = milestoneProgress(m);
  const progStatus = prog.percent >= 80 ? 'good' : prog.percent >= 40 ? 'warn' : 'bad';
  const area = m.analyticsArea ? window.areaById(m.analyticsArea) : null;

  return (
    <div
      className={`object-row expanded ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(m)}
      style={{ gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center' }}>
      <Icon name="flag" size={16} className="muted" />
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{m.id}</span>
          <span style={{ fontWeight: 600 }}>{m.title}</span>
          <MilestoneStatusBadge status={m.status} />
          <ManagedSystemPill id={m.managedSystem} />
          {area && <OutlineBadge>{area.name}</OutlineBadge>}
        </div>
        <div className="row-meta" style={{ gap: 10 }}>
          <span style={{
            color: 'var(--text-secondary)',
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxWidth: 540,
          }}>{m.why}</span>
        </div>
        <div className="row-meta" style={{ gap: 10, marginTop: 4 }}>
          {finding && (
            <span className="hstack" style={{ gap: 4 }}>
              <Icon name="finding" size={10} style={{ color: 'var(--color-neon-lime)' }} />
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>{finding.id}</span>
            </span>
          )}
          <span className="hstack" style={{ gap: 4 }}><Icon name="doc" size={10} />{m.evidenceCount}</span>
          <span className="hstack" style={{ gap: 4 }}><Icon name="task" size={10} />{prog.totalPlanned}</span>
          <span className="dot" />
          <span className="hstack" style={{ gap: 4, color:
            progStatus === 'good' ? 'var(--text-success)' :
            progStatus === 'warn' ? 'var(--text-warning)' : 'var(--text-muted)' }}>
            <strong style={{ color: 'inherit' }}>{prog.percent}%</strong>
            <span style={{ color: 'var(--text-muted)' }}>· {prog.releasedDone}/{prog.totalPlanned} released</span>
          </span>
          <span className="dot" />
          <span className="hstack" style={{ gap: 4 }}>
            <Icon name="flag" size={10} />{m.target}
          </span>
        </div>
      </div>
      <MilestoneMiniTimeline m={m} />
      <div className="row-trailing">
        <Avatar user={owner} size="sm" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Milestone detail panel
// ------------------------------------------------------------
function MilestoneTaskRow({ task }) {
  const assignee = task.assignee ? window.userById(task.assignee) : null;
  return (
    <div className="hstack" style={{
      padding: '10px 12px', gap: 10, borderRadius: 6,
      background: 'var(--color-pitch-black)', boxShadow: 'var(--shadow-subtle)',
    }}>
      <SeverityIndicator severity={priorityToSeverity(task.priority)} />
      <div className="vstack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <div className="hstack" style={{ gap: 6 }}>
          <span className="row-id">{task.id}</span>
          <span className="text-sm" style={{
            fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{task.title}</span>
        </div>
        <div className="hstack" style={{ gap: 6 }}>
          <InternalTaskBadge status={task.status} />
          <span className="text-xs muted">· {task.estimate}</span>
          <span className="text-xs muted">· updated {task.updatedAt}</span>
        </div>
      </div>
      {assignee ? <Avatar user={assignee} size="sm" /> : <span className="badge badge-blocked">Unassigned</span>}
    </div>
  );
}

function MilestoneDetailPanel({ m, onClose, onNavigate }) {
  const owner = window.userById(m.owner);
  const finding = m.sourceFindingId ? window.findingById(m.sourceFindingId) : null;
  const area = m.analyticsArea ? window.areaById(m.analyticsArea) : null;
  const prog = milestoneProgress(m);
  const progStatus = prog.percent >= 80 ? 'good' : prog.percent >= 40 ? 'warn' : 'bad';
  const taskRows = milestoneTaskRows(m);
  const scrollRef = useRef(null);
  const [activeSection, setActiveSection] = useState('overview');
  // Pack 10 — true scroll-spy via IntersectionObserver.  Previously the
  // active section only updated on click; now passive scrolling syncs
  // the nav.  We refresh the observer whenever the selected milestone
  // changes so anchors keyed by data-anchor under the new panel are
  // observed.

  // ref to mark programmatic scroll-induced changes so the observer
  // doesn't fight the click handler during smooth-scroll.
  const programmaticRef = useRef(false);

  // Anchored-section nav (per spec — "tabs or anchored sections for
  // Overview / Timeline / Tasks / Evidence / Activity")
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'tasks',    label: 'Tasks',    count: prog.totalPlanned },
    { id: 'evidence', label: 'Evidence', count: m.evidenceCount },
    { id: 'activity', label: 'Activity' },
  ];

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const anchors = SECTIONS
      .map(s => root.querySelector(`[data-anchor="${s.id}"]`))
      .filter(Boolean);
    if (anchors.length === 0) return;

    if (typeof IntersectionObserver === 'undefined') {
      const updateActiveSection = () => {
        if (programmaticRef.current) return;
        const rootRect = root.getBoundingClientRect();
        const active = anchors
          .map(a => ({
            id: a.getAttribute('data-anchor'),
            top: Math.abs(a.getBoundingClientRect().top - rootRect.top),
          }))
          .sort((a, b) => a.top - b.top)[0];
        if (active?.id) setActiveSection(active.id);
      };
      root.addEventListener('scroll', updateActiveSection, { passive: true });
      updateActiveSection();
      return () => root.removeEventListener('scroll', updateActiveSection);
    }

    const observer = new IntersectionObserver((entries) => {
      if (programmaticRef.current) return;
      // Pick the topmost section currently intersecting the upper-third
      // of the scroll container.  Sort by their bounding-rect top within
      // the root so the visually-highest active section wins.
      const visible = entries
        .filter(e => e.isIntersecting)
        .map(e => ({ id: e.target.getAttribute('data-anchor'), top: e.boundingClientRect.top }))
        .sort((a, b) => a.top - b.top);
      if (visible.length === 0) return;
      setActiveSection(visible[0].id);
    }, {
      root,
      // upper-third band: anchor activates once it crosses the top 33% line
      rootMargin: '0px 0px -66% 0px',
      threshold: 0,
    });
    anchors.forEach(a => observer.observe(a));
    return () => observer.disconnect();
  }, [m.id]);

  const scrollTo = (id) => {
    const el = scrollRef.current?.querySelector(`[data-anchor="${id}"]`);
    const root = scrollRef.current;
    if (!el || !root) return;
    programmaticRef.current = true;
    setActiveSection(id);
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    root.scrollTo({
      top: root.scrollTop + elRect.top - rootRect.top,
      behavior: 'smooth',
    });
    // re-enable observer once smooth scroll likely finished
    setTimeout(() => { programmaticRef.current = false; }, 700);
  };

  // Mock evidence excerpts attached to this milestone — in production these
  // come from entity_links filtered by source type.
  const evidenceSamples = [
    { id: 'EV-3201', type: 'voc',             quote: '"매출 리포트 다운로드가 30초 넘게 걸려서 매주 월요일 보고 일정이 밀립니다."', from: 'VOC-2809' },
    { id: 'EV-3198', type: 'voc',             quote: '"임베디드 대시보드가 401 응답 후 빈 화면만 나옵니다. 새로고침해도 동일."',         from: 'VOC-2813' },
    { id: 'EV-3187', type: 'survey_response', quote: '"리포트 안정성에 대한 신뢰가 떨어졌다." (Q3 사용성 진단 — text response #41)',     from: 'SRV-21' },
  ].slice(0, Math.min(3, m.evidenceCount));

  // Mock activity timeline
  const activity = [
    { who: owner, what: 'updated status to', state: m.status, when: m.createdAt },
    finding && { who: window.userById(finding.owner), what: 'linked source finding', state: finding.id, when: '2일 전' },
    m.taskIds[0] && { who: owner, what: 'added task', state: m.taskIds[0], when: '어제' },
    m.outcomeSurvey && { who: owner, what: 'attached outcome survey', state: m.outcomeSurvey, when: '오늘' },
  ].filter(Boolean);

  // Forbidden-leak reminder: this panel shows internal Task status,
  // dates, evidence summaries. Per ui-design-system.md ReporterSummaryBlock,
  // these MUST NOT appear on reporter-facing surfaces. This is an internal
  // panel so we render freely; reminder kept in code for future linker.

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="milestone" id={m.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Milestone" entityId={m.id}
          copyHash={`#route=tasks&view=milestones&param=${m.id}`} />
      } />

      {/* Section nav — anchored sections (per spec) */}
      <div className="hstack" style={{
        position: 'sticky', top: 0, zIndex: 2,
        background: 'var(--surface-detail)',
        padding: '6px 24px 8px',
        gap: 0,
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'auto',
      }}>
        {SECTIONS.map(s => (
          <button key={s.id}
            onClick={() => scrollTo(s.id)}
            className="hstack"
            style={{
              padding: '6px 10px', gap: 6,
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeSection === s.id
                ? '2px solid var(--color-neon-lime)'
                : '2px solid transparent',
              color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontWeight: 500,
              whiteSpace: 'nowrap',
            }}>
            {s.label}
            {s.count !== undefined && (
              <span className="mono" style={{
                fontSize: 10, color: 'var(--text-muted)',
                background: 'var(--color-pitch-black)',
                padding: '1px 5px', borderRadius: 10,
              }}>{s.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="panel-scroll" ref={scrollRef}>
        {/* ============================================================
            Overview — title block, why, source, key meta. The "scan
            without scrolling" section per ui-design-system.md.
            ============================================================ */}
        <div data-anchor="overview">
          <PanelTitleBlock title={m.title}>
            <MilestoneStatusBadge status={m.status} />
            <ManagedSystemPill id={m.managedSystem} />
            {area && <OutlineBadge>{area.name}</OutlineBadge>}
          </PanelTitleBlock>

          {/* Progress strip — most important glanceable signal */}
          <div className="panel-section">
            <div className="card-nested vstack" style={{ gap: 10 }}>
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="text-sm" style={{ fontWeight: 500 }}>
                  {prog.releasedDone} of {prog.totalPlanned} tasks released
                </span>
                <span className="text-md tabular" style={{ fontWeight: 600, color:
                  progStatus === 'good' ? 'var(--text-success)' :
                  progStatus === 'warn' ? 'var(--text-warning)' : 'var(--text-muted)'
                }}>{prog.percent}%</span>
              </div>
              <CoverageBar percent={prog.percent} status={progStatus} />
              <div className="hstack" style={{ gap: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                <span><strong style={{ color: 'var(--text-secondary)' }}>{prog.releasedDone}</strong> released/done</span>
                <span className="dot" />
                <span><strong style={{ color: 'var(--text-secondary)' }}>{prog.inFlight}</strong> in flight</span>
                <span className="dot" />
                <span><strong style={{ color: 'var(--text-secondary)' }}>{prog.todoBacklog}</strong> queued</span>
                {prog.planned.length > 0 && (
                  <>
                    <span className="dot" />
                    <span><strong style={{ color: 'var(--text-secondary)' }}>{prog.planned.length}</strong> planned</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Why this milestone exists — required by spec FR-TASK-004 */}
          <div className="panel-section">
            <PanelSectionTitle>Why this milestone exists</PanelSectionTitle>
            <NestedTextBlock>{m.why}</NestedTextBlock>
          </div>

          {/* Source */}
          <div className="panel-section">
            <PanelSectionTitle action={
              finding && <button className="btn btn-subtle btn-sm" onClick={() => onNavigate('findings')}>
                <Icon name="arrowRight" size={11} />Open finding
              </button>
            }>Source</PanelSectionTitle>
            {finding ? (
              <div className="card-nested vstack" style={{ gap: 6 }}>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span className="text-xs muted">From finding</span>
                  <FindingStatusBadge status={finding.status} />
                </div>
                <div className="text-sm" style={{ fontWeight: 500 }}>
                  <span className="row-id" style={{ marginRight: 6 }}>{finding.id}</span>
                  {finding.title}
                </div>
                <div className="text-xs muted" style={{ lineHeight: 1.55 }}>{finding.summary}</div>
                <div className="hstack" style={{ gap: 8, marginTop: 2 }}>
                  <ConfidenceBadge confidence={finding.confidence} />
                  <OutlineBadge>Evidence · {finding.evidenceCount}</OutlineBadge>
                  <OutlineBadge>Impact · <strong style={{ color: 'var(--text-primary)' }}>{finding.impact}</strong></OutlineBadge>
                </div>
              </div>
            ) : (
              <div className="card-nested vstack" style={{ gap: 8 }}>
                <span className="text-sm muted">근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.</span>
                <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                  <Icon name="link" size={11} />Link source finding
                </Button>
              </div>
            )}
          </div>

          {/* Properties — compact meta */}
          <div className="panel-section">
            <PanelSectionTitle>Properties</PanelSectionTitle>
            <FieldRow label="Status"><MilestoneStatusBadge status={m.status} /></FieldRow>
            <FieldRow label="Managed System"><ManagedSystemPill id={m.managedSystem} /></FieldRow>
            <FieldRow label="Analytics Area">
              {area ? <OutlineBadge>{area.name}</OutlineBadge> : <span className="muted">—</span>}
            </FieldRow>
            <FieldRow label="Owner"><UserChip user={owner} /></FieldRow>
            <FieldRow label="Start"><span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{m.startDate}</span></FieldRow>
            <FieldRow label="Target"><span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{m.target}</span></FieldRow>
            <FieldRow label="Created">{m.createdAt}</FieldRow>
          </div>
        </div>

        {/* ============================================================
            Timeline — full TaskGantt. The spec is explicit: "The full
            Gantt chart appears only as the Timeline section inside
            Milestone Detail."
            ============================================================ */}
        <div data-anchor="timeline" className="panel-section">
          <PanelSectionTitle action={
            <span className="text-xs muted mono">{m.startDate} → {m.target}</span>
          }>Timeline</PanelSectionTitle>
          <TaskGantt milestone={m} rows={taskRows} />
        </div>

        {/* ============================================================
            Tasks — flat child task list (separate from the Gantt for
            scannability without horizontal scanning).
            ============================================================ */}
        <div data-anchor="tasks" className="panel-section">
          <PanelSectionTitle action={
            <button className="btn btn-subtle btn-sm" onClick={() => onNavigate('tasks', 'board')}>
              <Icon name="plus" size={11} />Add task
            </button>
          }>Tasks · {prog.totalPlanned}</PanelSectionTitle>
          {taskRows.length === 0 ? (
            <div className="text-xs muted" style={{ padding: '12px 0', textAlign: 'center' }}>
              아직 연결된 Task 가 없습니다.
            </div>
          ) : (
            <div className="vstack" style={{ gap: 6 }}>
              {taskRows.map((t, i) => <MilestoneTaskRow key={t.id || i} task={t} />)}
            </div>
          )}
        </div>

        {/* ============================================================
            Evidence — linked highlights. Source of why this milestone
            exists, in user words. Spec component: EvidenceHighlight.
            ============================================================ */}
        <div data-anchor="evidence" className="panel-section">
          <PanelSectionTitle action={
            <button className="btn btn-subtle btn-sm" onClick={() => onNavigate('integration-evidence')}>
              <Icon name="arrowRight" size={11} />Open all
            </button>
          }>Evidence · {m.evidenceCount}</PanelSectionTitle>
          {evidenceSamples.length === 0 ? (
            <div className="text-xs muted" style={{ padding: '12px 0', textAlign: 'center' }}>
              연결된 evidence highlight 가 없습니다.
            </div>
          ) : (
            <div className="vstack" style={{ gap: 6 }}>
              {evidenceSamples.map(ev => (
                <div key={ev.id} className="hstack" style={{
                  padding: '10px 12px', gap: 10, borderRadius: 6,
                  background: 'var(--color-pitch-black)', boxShadow: 'var(--shadow-subtle)',
                  alignItems: 'flex-start',
                }}>
                  <EntityIconBadge type={ev.type === 'survey_response' ? 'survey' : 'voc'} size={20} />
                  <div className="vstack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <span className="text-xs" style={{
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{ev.quote}</span>
                    <div className="hstack" style={{ gap: 6 }}>
                      <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{ev.id}</span>
                      <span className="dot" />
                      <span className="text-xs muted">from <span className="mono" style={{ color: 'var(--text-secondary)' }}>{ev.from}</span></span>
                    </div>
                  </div>
                </div>
              ))}
              {m.evidenceCount > evidenceSamples.length && (
                <button className="btn btn-subtle btn-sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => onNavigate('integration-evidence')}>
                  + {m.evidenceCount - evidenceSamples.length} more highlights
                </button>
              )}
            </div>
          )}

          {/* Outcome validation — folded into Evidence as supporting follow-up */}
          {m.outcomeSurvey ? (
            <div style={{ marginTop: 12 }}>
              <PanelSectionTitle>Outcome validation</PanelSectionTitle>
              <div className="card-nested hstack" style={{ gap: 10 }}>
                <EntityIconBadge type="survey" size={22} />
                <div className="vstack" style={{ gap: 2, flex: 1 }}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>
                    <span className="row-id" style={{ marginRight: 6 }}>{m.outcomeSurvey}</span>
                    Outcome survey 연결됨
                  </div>
                  <span className="text-xs muted">Released 이후 효과 확인용</span>
                </div>
                <Button variant="subtle" size="sm">Open</Button>
              </div>
            </div>
          ) : m.status === 'released' ? (
            <div style={{ marginTop: 12 }}>
              <Callout tone="amber" title="Outcome survey 없음"
                action={<Button variant="primary" size="sm"><Icon name="plus" size={11} />Create outcome survey</Button>}>
                Released 상태이지만 효과 확인용 Outcome Survey 가 연결되어 있지 않습니다.
              </Callout>
            </div>
          ) : null}
        </div>

        {/* ============================================================
            Activity — decisions, audit events, status changes
            ============================================================ */}
        <div data-anchor="activity" className="panel-section">
          <PanelSectionTitle>Activity</PanelSectionTitle>
          {activity.length === 0 ? (
            <div className="text-xs muted" style={{ padding: '12px 0', textAlign: 'center' }}>활동 기록이 없습니다.</div>
          ) : (
            <div className="vstack" style={{ gap: 0, position: 'relative' }}>
              {activity.map((a, i) => (
                <div key={i} className="hstack" style={{
                  gap: 10, padding: '10px 0',
                  borderBottom: i < activity.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <Avatar user={a.who} size="sm" />
                  <div className="vstack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="text-sm">
                      <strong style={{ color: 'var(--text-primary)' }}>{a.who.name}</strong>
                      <span style={{ color: 'var(--text-muted)' }}> {a.what} </span>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>{a.state}</span>
                    </span>
                    <span className="text-xs muted">{a.when}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Trail at the bottom of Activity */}
          <div style={{ marginTop: 16 }}>
            <PanelSectionTitle>Linked entity trail</PanelSectionTitle>
            <LinkedEntityTrail nodes={[
              finding
                ? { type: 'finding', title: finding.title, meta: finding.id }
                : { type: 'finding', placeholder: true, title: 'Source finding 없음', meta: 'standalone' },
              { type: 'evidence', title: `${m.evidenceCount} evidence highlights`, meta: 'VOC + Survey + Note' },
              { type: 'task', title: `${prog.totalPlanned} tasks grouped`, meta: `${m.id} · this milestone` },
              m.outcomeSurvey
                ? { type: 'outcome', title: 'Outcome survey', meta: `${m.outcomeSurvey}` }
                : { type: 'outcome', placeholder: true, title: 'Outcome survey', meta: 'after release' },
            ]} />
          </div>
        </div>
      </div>
    </aside>
  );
}


// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
function MilestonesScreen({ scope, onNavigate }) {
  const filtered = Milestones.filter(m => scope.members.includes(m.managedSystem));
  const [activeTab, setActiveTab] = useState('all');
  const tabs = [
    { key: 'all',         label: 'All',         count: filtered.length },
    { key: 'in_progress', label: 'In progress', count: filtered.filter(m => m.status === 'in_progress').length, accent: true },
    { key: 'planning',    label: 'Planning',    count: filtered.filter(m => m.status === 'planning').length },
    { key: 'released',    label: 'Released',    count: filtered.filter(m => m.status === 'released').length },
  ];
  const shown = activeTab === 'all' ? filtered : filtered.filter(m => m.status === activeTab);
  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(m => m.id === selectedId) : null;

  // KPIs
  const inFlightTasks = filtered.reduce((acc, m) => acc + milestoneProgress(m).inFlight, 0);
  const totalEvidence = filtered.reduce((acc, m) => acc + m.evidenceCount, 0);
  const releasedCount = filtered.filter(m => m.status === 'released').length;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Milestone 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="filter" size={12} />Filter</button>
          <Button variant="primary" size="sm" icon="plus">New milestone</Button>
        </ListToolbar>

        {/* Summary strip — sits above the list so KPIs are scannable but
            don't compete with the list rows for vertical space. */}
        <div className="hstack" style={{
          gap: 18, padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-canvas)',
          flexShrink: 0,
        }}>
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Milestones</span>
            <span className="text-md tabular" style={{ fontWeight: 600 }}>{filtered.length}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tasks in flight</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-aether-blue)' }}>{inFlightTasks}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evidence linked</span>
            <span className="text-md tabular" style={{ fontWeight: 600 }}>{totalEvidence}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Released</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-emerald)' }}>{releasedCount}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span className="text-xs muted hstack" style={{ gap: 4 }}>
            <Icon name="pulse" size={11} />
            Schedule risk · mini-timeline 우측 표시
          </span>
        </div>

        {/* List rows with per-row mini-timeline */}
        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.length === 0 ? (
            <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>표시할 milestone 이 없습니다.</div>
          ) : (
            <div className="object-list">
              {shown.map(m => (
                <MilestoneRow key={m.id} m={m} selected={selected?.id === m.id} onSelect={(x) => setSelectedId(x.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && <MilestoneDetailPanel m={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>
  );
}

Object.assign(window, { MilestonesScreen, MilestoneDetailPanel, Milestones });
