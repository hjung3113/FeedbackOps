// ============================================================
// FeedbackOps — Tasks (Board, Requests, Backlog)
// ============================================================

const BOARD_COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'Todo' },
  { key: 'doing', label: 'Doing' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'released', label: 'Released' },
];

// Pack 12 — Group by + Filter dimensions for the board.
const TASK_GROUP_BY_FIELDS = [
  { key: 'status',        label: 'Status (default)' },
  { key: 'priority',      label: 'Priority' },
  { key: 'managedSystem', label: 'Managed System' },
  { key: 'assignee',      label: 'Assignee' },
];

function buildGroupColumns(groupBy, tasks) {
  if (groupBy === 'status') return BOARD_COLUMNS;
  if (groupBy === 'priority') return [
    { key: 'urgent', label: 'Urgent' },
    { key: 'high',   label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low',    label: 'Low' },
  ];
  if (groupBy === 'managedSystem') return window.ManagedSystems.map(m => ({ key: m.id, label: m.name }));
  if (groupBy === 'assignee') {
    const ids = Array.from(new Set(tasks.map(t => t.assignee).filter(Boolean)));
    const cols = ids.map(id => ({ key: id, label: window.userById(id)?.name || id }));
    cols.push({ key: '__none', label: '미배정' });
    return cols;
  }
  return BOARD_COLUMNS;
}

function taskGroupValue(task, groupBy) {
  if (groupBy === 'status') return task.status;
  if (groupBy === 'priority') return task.priority || 'low';
  if (groupBy === 'managedSystem') return task.managedSystem;
  if (groupBy === 'assignee') return task.assignee || '__none';
  return task.status;
}

const TASK_FILTER_CATEGORIES_BASE = [
  { key: 'priority', label: 'Priority', options: [
    { value: 'urgent', label: 'Urgent' },
    { value: 'high',   label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low',    label: 'Low' },
  ]},
  { key: 'milestone', label: 'Milestone', options: [
    { value: '__any',  label: 'Milestone 있음' },
    { value: '__none', label: 'Milestone 없음' },
  ]},
];

function TaskCard({ task, onSelect, selected, onDragStart, onDragEnd, isDragging }) {
  const assignee = task.assignee ? window.userById(task.assignee) : null;
  const ms = window.msById(task.managedSystem);
  const sev = priorityToSeverity(task.priority);
  return (
    <div
      className={`board-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(task)}
      draggable
      onDragStart={(e) => {
        try { e.dataTransfer.setData('text/plain', task.id); } catch (err) { /* noop */ }
        e.dataTransfer.effectAllowed = 'move';
        onDragStart && onDragStart(task);
      }}
      onDragEnd={() => onDragEnd && onDragEnd()}
      style={{
        ...(selected ? { boxShadow: 'rgba(228,242,34,0.4) 0px 0px 0px 1.5px inset' } : {}),
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
      }}>
      <div className="hstack" style={{ gap: 6 }}>
        <span className="row-id">{task.id}</span>
        <span className={`badge badge-severity severity-${sev}`}>
          {task.priority}
        </span>
        {task.findingId && (
          <span className="badge" style={{ background: 'rgba(228,242,34,0.08)', color: 'var(--color-neon-lime)' }}>
            ↔ {task.findingId}
          </span>
        )}
      </div>
      <div className="board-card-title">{task.title}</div>
      <div className="board-card-meta">
        <span className="hstack" style={{ gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ms?.color }} />
          {ms?.name}
        </span>
        <span className="hstack" style={{ gap: 5 }}>
          {task.linkedVocCount > 0 && (
            <span title="Linked VOCs"><Icon name="voc" size={11} className="muted" /> {task.linkedVocCount}</span>
          )}
          {assignee ? <Avatar user={assignee} size="sm" /> : <span className="badge badge-blocked">Unassigned</span>}
        </span>
      </div>
    </div>
  );
}

function TaskDetailPanel({ task, onClose, view }) {
  const assignee = task.assignee ? window.userById(task.assignee) : null;
  const finding = task.findingId ? window.findingById(task.findingId) : null;
  const linkedVoc = window.Vocs.find(v => v.linkedTaskId === task.id);
  const sev = priorityToSeverity(task.priority);

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="task" id={task.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Task" entityId={task.id}
          copyHash={`#route=tasks&view=board&param=${task.id}`} />
      } />
      <div className="panel-scroll">
        <PanelTitleBlock title={task.title}>
          <InternalTaskBadge status={task.status} />
          <SeverityBadge severity={sev} />
          {linkedVoc && (
            <>
              <span className="text-xs muted">·</span>
              <span className="text-xs muted">Reporter status:</span>
              <ReporterStatusBadge status={linkedVoc.reporterStatus} />
            </>
          )}
        </PanelTitleBlock>

        <div className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Status"><InternalTaskBadge status={task.status} /></FieldRow>
          <FieldRow label="Priority"><SeverityBadge severity={sev} /></FieldRow>
          <FieldRow label="Assignee">
            {assignee ? <UserChip user={assignee} /> :
              <span style={{ color: 'var(--color-warning-red)' }}>Unassigned</span>}
          </FieldRow>
          <FieldRow label="Managed System"><ManagedSystemPill id={task.managedSystem} /></FieldRow>
          <FieldRow label="Milestone">{task.milestone || <span className="muted">—</span>}</FieldRow>
          <FieldRow label="Estimate">{task.estimate}</FieldRow>
          <FieldRow label="Updated">{task.updatedAt}</FieldRow>
        </div>

        {finding && (
          <div className="panel-section">
            <PanelSectionTitle>Source evidence</PanelSectionTitle>
            <div className="card-nested vstack" style={{ gap: 6 }}>
              <span className="text-xs muted">From finding</span>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                <span className="row-id" style={{ marginRight: 6 }}>{finding.id}</span>
                {finding.title}
              </div>
              <div className="hstack" style={{ gap: 8 }}>
                <ConfidenceBadge confidence={finding.confidence} />
                <OutlineBadge>Evidence · {finding.evidenceCount}</OutlineBadge>
              </div>
            </div>
          </div>
        )}

        <div className="panel-section">
          <PanelSectionTitle>Linked context</PanelSectionTitle>
          {(() => {
            const vocDecision = window.getPermissionDecision(task, 'linkedVoc');
            return vocDecision && (
              <div style={{ marginBottom: 10 }}>
                <PermissionBlockedPanel
                  state={vocDecision.state}
                  category={vocDecision.category}
                  reason={vocDecision.reason}
                  requiredScope={vocDecision.requiredScope}
                  summary={vocDecision.summary}
                />
                <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 6 }}>
                  <Icon name="shield" size={10} />
                  Decision <span className="mono" style={{ color: 'var(--text-secondary)' }}>{vocDecision.decisionId}</span> · evaluated {vocDecision.evaluatedAt}
                </div>
              </div>
            );
          })()}
          <LinkedEntityTrail nodes={[
            window.getPermissionDecision(task, 'linkedVoc') ?
              { type: 'voc', placeholder: true, title: 'Restricted VOC', meta: 'access blocked · see panel above' } :
              linkedVoc ?
              { type: 'voc', title: linkedVoc.title, meta: `${linkedVoc.id} · ${linkedVoc.similarCount + 1} VOCs` } :
              { type: 'voc', placeholder: true, title: 'Source VOC 없음', meta: 'Standalone task' },
            finding ?
              { type: 'finding', title: finding.title, meta: `${finding.id}` } :
              { type: 'finding', placeholder: true, title: 'Finding 없음', meta: '근거 없는 task' },
            { type: 'task', title: task.title, meta: `${task.id} · this task` },
            { type: 'outcome', placeholder: true, title: 'Outcome survey', meta: 'Released 이후' },
          ]} />
        </div>

        {task.status === 'released' && linkedVoc && linkedVoc.reporterStatus !== 'resolved' && (
          <div className="panel-section">
            <Callout tone="amber" title="Reporter-facing status 미해결"
              action={
                <Button variant="primary" size="sm">
                  <Icon name="megaphone" size={11} />Write public update
                </Button>
              }>
              Released 상태이지만 연결된 VOC가 아직 해결됨이 아닙니다. 공개 업데이트 또는 Outcome 확인이 필요합니다.
            </Callout>
          </div>
        )}
      </div>
      <div className="panel-footer">
        {view === 'backlog' ? (
          // Backlog-specific footer per docs/design/06-task-project-system.md:
          // execution starts at Todo or Doing. Use execution-first language
          // for the primary action.
          <>
            <Button variant="primary" className="btn-block" disabled={task.status !== 'backlog'}>
              <Icon name="arrowRight" size={12} />
              {task.status === 'backlog' ? 'Start execution' : 'Execution started'}
            </Button>
            <Button variant="secondary" size="md">
              <Icon name="user" size={13} />
              {task.assignee ? 'Reassign' : 'Assign'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" className="btn-block">Move to next status</Button>
            <Button variant="secondary"><Icon name="more" size={14} /></Button>
          </>
        )}
      </div>
    </aside>
  );
}

function TaskBoardView({ scope, selectedParam }) {
  const baseList = window.Tasks.filter(t => scope.members.includes(t.managedSystem));

  // Prototype: keep status overrides in local state so a drag-drop persists
  // within the session without mutating the global Tasks fixture.
  // Production wires this to POST /tasks/:id/status.
  const [statusOverrides, setStatusOverrides] = useState({});
  // Pack 12 — Group by + Filter wiring.
  const [groupBy, setGroupBy] = useState('status');
  const [filters, setFilters] = useState({ priority: new Set(), milestone: new Set(), assignee: new Set() });
  const toggleFilter = (cat, val, on) => setFilters(prev => {
    const next = new Set(prev[cat]); if (on) next.add(val); else next.delete(val);
    return { ...prev, [cat]: next };
  });
  const clearFilters = () => setFilters({ priority: new Set(), milestone: new Set(), assignee: new Set() });

  const filtered = useMemo(() => {
    let list = baseList.map(t => statusOverrides[t.id] ? { ...t, status: statusOverrides[t.id] } : t);
    if (filters.priority.size) list = list.filter(t => filters.priority.has(t.priority));
    if (filters.milestone.size) {
      list = list.filter(t => (
        (filters.milestone.has('__any')  && t.milestone) ||
        (filters.milestone.has('__none') && !t.milestone)
      ));
    }
    if (filters.assignee.size) {
      list = list.filter(t => (
        (filters.assignee.has('__unassigned') && !t.assignee) ||
        (t.assignee && filters.assignee.has(t.assignee))
      ));
    }
    return list;
  }, [baseList, statusOverrides, filters]);

  // Build dynamic filter categories (Assignee depends on visible tasks).
  const filterCategories = useMemo(() => {
    const assignees = Array.from(new Set(baseList.map(t => t.assignee).filter(Boolean)));
    return [
      ...TASK_FILTER_CATEGORIES_BASE,
      { key: 'assignee', label: 'Assignee', options: [
        { value: '__unassigned', label: '미배정' },
        ...assignees.map(id => ({ value: id, label: window.userById(id)?.name || id })),
      ]},
    ];
  }, [baseList]);

  const groupColumns = useMemo(() => buildGroupColumns(groupBy, filtered), [groupBy, filtered]);

  const [selectedId, setSelectedId] = useState(selectedParam || filtered[0]?.id);
  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);
  const selected = selectedId ? filtered.find(t => t.id === selectedId) : null;

  // Drag state — which task is in flight + which column is currently a target
  const [dragTask, setDragTask] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const handleDropOnColumn = (colKey) => {
    if (groupBy !== 'status') {
      window.__toast({ message: 'Group by Status 일 때만 드래그로 상태를 변경할 수 있습니다.', tone: 'warn' });
      setDragTask(null); setOverColumn(null);
      return;
    }
    if (dragTask && dragTask.status !== colKey) {
      setStatusOverrides(prev => ({ ...prev, [dragTask.id]: colKey }));
    }
    setDragTask(null);
    setOverColumn(null);
  };

  return (
    <>
      <div className="main-region">
        <div className="toolbar">
          <span className="text-sm" style={{ fontWeight: 500 }}>Board</span>
          <OutlineBadge>{filtered.length} tasks</OutlineBadge>
          <div className="toolbar-spacer" />
          <ListFilterButton categories={filterCategories}
            applied={filters} onChange={toggleFilter} onClear={clearFilters} />
          <ListSortButton fields={TASK_GROUP_BY_FIELDS} value={`${groupBy}:asc`}
            onChange={(v) => setGroupBy(v.split(':')[0])}
            label="Group by" icon="layers" />
          <Button variant="primary" size="sm" icon="plus">New task</Button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div className="board">
            {groupColumns.map(col => {
              const tasks = filtered.filter(t => taskGroupValue(t, groupBy) === col.key);
              const isOver = overColumn === col.key && dragTask && taskGroupValue(dragTask, groupBy) !== col.key;
              return (
                <div
                  key={col.key}
                  className="board-column"
                  onDragOver={(e) => {
                    if (!dragTask || taskGroupValue(dragTask, groupBy) === col.key) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overColumn !== col.key) setOverColumn(col.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      if (overColumn === col.key) setOverColumn(null);
                    }
                  }}
                  onDrop={() => handleDropOnColumn(col.key)}
                  style={{
                    background: isOver ? 'rgba(228,242,34,0.06)' : undefined,
                    boxShadow: isOver ? 'inset 0 0 0 1px var(--color-neon-lime)' : undefined,
                    borderRadius: 6,
                    transition: 'background 100ms ease, box-shadow 100ms ease',
                  }}>
                  <div className="board-column-header">
                    {groupBy === 'status' ? (
                      <InternalTaskBadge status={col.key} />
                    ) : (
                      <span className="text-xs" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                        {col.label}
                      </span>
                    )}
                    <span className="board-column-count">{tasks.length}</span>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-ghost btn-sm" style={{ width: 22, height: 22 }}>
                      <Icon name="plus" size={11} />
                    </button>
                  </div>
                  <div className="board-column-body">
                    {tasks.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        selected={selectedId === t.id}
                        onSelect={(x) => setSelectedId(x.id)}
                        onDragStart={(task) => setDragTask(task)}
                        onDragEnd={() => { setDragTask(null); setOverColumn(null); }}
                        isDragging={dragTask?.id === t.id}
                      />
                    ))}
                    {tasks.length === 0 && <div className="text-xs faint" style={{ padding: 12, textAlign: 'center' }}>비어있음</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}

// ============================================================
// Backlog list view — list-first per ui-design-system.md.
// Surfaces every Task in `backlog` or `todo` status. The Board owns
// in-flight execution; Backlog owns the queue waiting for execution.
// ============================================================
function TaskBacklogRow({ task, selected, onSelect }) {
  const assignee = task.assignee ? window.userById(task.assignee) : null;
  const finding = task.findingId ? window.findingById(task.findingId) : null;
  return (
    <div
      className={`object-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(task)}
      style={{ gridTemplateColumns: 'auto 1fr auto' }}>
      <div className="hstack" style={{ gap: 12, alignItems: 'center' }}>
        <SeverityIndicator severity={priorityToSeverity(task.priority)} />
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{task.id}</span>
          <span>{task.title}</span>
          <InternalTaskBadge status={task.status} />
        </div>
        <div className="row-meta">
          <ManagedSystemPill id={task.managedSystem} />
          <span className="dot" />
          <span className="text-xs" style={{
            color: task.priority === 'urgent' || task.priority === 'high'
              ? 'var(--text-warning)' : 'var(--text-muted)',
            textTransform: 'capitalize', fontWeight: 600,
          }}>{task.priority}</span>
          {task.milestone && <>
            <span className="dot" />
            <span className="hstack" style={{ gap: 4 }}>
              <Icon name="flag" size={10} />
              <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{task.milestone}</span>
            </span>
          </>}
          {finding && <>
            <span className="dot" />
            <EntityHoverPreview type="finding" id={finding.id}>
              <span className="hstack" style={{ gap: 4 }}>
                <Icon name="finding" size={10} style={{ color: 'var(--color-neon-lime)' }} />
                <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{finding.id}</span>
              </span>
            </EntityHoverPreview>
          </>}
          {task.linkedVocCount > 0 && <>
            <span className="dot" />
            <span className="hstack" style={{ gap: 4 }}>
              <EntityIconBadge type="voc" size={14} />{task.linkedVocCount}
            </span>
          </>}
          <span className="dot" />
          <span>{task.estimate}</span>
          <span className="dot" />
          <span>updated {task.updatedAt}</span>
        </div>
      </div>
      <div className="row-trailing" style={{ gap: 10 }}>
        {assignee ? <Avatar user={assignee} size="sm" /> : <span className="badge badge-blocked">Unassigned</span>}
      </div>
    </div>
  );
}

const BACKLOG_SORTS = [
  { key: 'priority', label: 'Priority',     fn: (a,b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] },
  { key: 'recent',   label: 'Recently updated', fn: () => 0 }, // mock — preserves data order
  { key: 'ms',       label: 'Managed System', fn: (a,b) => (a.managedSystem || '').localeCompare(b.managedSystem || '') },
];
const PRIORITY_ORDER = { urgent: 4, high: 3, medium: 2, low: 1 };

function TaskBacklogView({ scope }) {
  const all = window.Tasks.filter(t => scope.members.includes(t.managedSystem));
  const backlog = all.filter(t => t.status === 'backlog' || t.status === 'todo');

  const [activeTab, setActiveTab] = useState('all');
  const tabs = [
    { key: 'all',         label: 'All',         count: backlog.length },
    { key: 'backlog',     label: 'Backlog',     count: backlog.filter(t => t.status === 'backlog').length },
    { key: 'todo',        label: 'Todo',        count: backlog.filter(t => t.status === 'todo').length },
    { key: 'unassigned',  label: 'Unassigned',  count: backlog.filter(t => !t.assignee).length, accent: true },
  ];
  const [sort, setSort] = useState('priority');
  const tabShown = activeTab === 'all'        ? backlog
                 : activeTab === 'unassigned' ? backlog.filter(t => !t.assignee)
                 :                              backlog.filter(t => t.status === activeTab);
  const shown = [...tabShown].sort(BACKLOG_SORTS.find(s => s.key === sort).fn);
  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(t => t.id === selectedId) : null;

  const promotable = backlog.filter(t => t.assignee && t.status === 'backlog').length;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Backlog 검색…" />
          <div className="hstack" style={{ gap: 4 }}>
            <span className="text-xs muted">Sort</span>
            {BACKLOG_SORTS.map(s => (
              <button key={s.key}
                onClick={() => setSort(s.key)}
                className={`btn btn-${sort === s.key ? 'secondary' : 'subtle'} btn-sm`}>
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" icon="plus">New task</Button>
        </ListToolbar>

        {/* Strip — backlog health signals.
            Per docs/design/06-task-project-system.md, backlog is the queue
            between Triage and Execution; Unassigned and Promotable are the
            two signals worth surfacing at a glance. */}
        <div className="hstack" style={{
          gap: 18, padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-canvas)',
          flexShrink: 0,
        }}>
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Queue size</span>
            <span className="text-md tabular" style={{ fontWeight: 600 }}>{backlog.length}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unassigned</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--text-warning)' }}>
              {backlog.filter(t => !t.assignee).length}
            </span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Awaiting execution</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-emerald)' }}>{promotable}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span className="text-xs muted hstack" style={{ gap: 6 }}>
            <Icon name="pulse" size={11} />
            Backlog 는 list-first 입니다. Execution 은 Todo 또는 Doing 에서 시작됩니다.
          </span>
        </div>

        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.length === 0 ? (
            <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>표시할 task 가 없습니다.</div>
          ) : (
            <div className="object-list">
              {shown.map(t => (
                <TaskBacklogRow key={t.id} task={t} selected={selected?.id === t.id} onSelect={(x) => setSelectedId(x.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} view="backlog" />}
    </>
  );
}
// ============================================================
// Task Request Review console
// ============================================================
function TaskRequestRow({ r, selected, onSelect }) {
  const requester = window.userById(r.requestedBy);
  const reviewer = r.reviewer ? window.userById(r.reviewer) : null;
  return (
    <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(r)}>
      <div className="hstack gap-12">
        <SeverityIndicator severity={priorityToSeverity(r.impact)} />
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{r.id}</span>{r.title}
        </div>
        <div className="row-meta">
          <TaskRequestBadge status={r.status} />
          {r.findingId && <EntityHoverPreview type="finding" id={r.findingId}>
            <span style={{ color: 'var(--color-cyan-spark)' }}>↔ {r.findingId}</span>
          </EntityHoverPreview>}
          <span className="dot" />
          <span>Evidence {r.evidenceCount}</span>
          <span className="dot" />
          <ManagedSystemPill id={r.managedSystem} />
          <span className="dot" />
          <span>{r.createdAt}</span>
        </div>
      </div>
      <div className="row-trailing">
        <span className="text-xs muted">by {requester.name}</span>
        {reviewer ? <Avatar user={reviewer} size="sm" /> : <span className="badge badge-blocked">No reviewer</span>}
      </div>
    </div>
  );
}

function TaskRequestPanel({ r, onClose }) {
  const requester = window.userById(r.requestedBy);
  const finding = r.findingId ? window.findingById(r.findingId) : null;
  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="request" id={r.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Task Request" entityId={r.id}
          copyHash={`#route=tasks&view=requests&param=${r.id}`} />
      } />
      <div className="panel-scroll">
        <PanelTitleBlock title={r.title}>
          <TaskRequestBadge status={r.status} />
          <span className="text-xs muted">· Requested by <strong style={{ color: 'var(--text-secondary)' }}>{requester.name}</strong></span>
          <span className="text-xs muted">· {r.createdAt}</span>
        </PanelTitleBlock>

        {/* Review decision — primary action above the fold */}
        <div className="panel-section">
          <PanelSectionTitle>Review decision</PanelSectionTitle>
          <div className="vstack" style={{ gap: 8 }}>
            <Button variant="primary" className="btn-block">
              <Icon name="check" size={12} />Convert to Task
            </Button>
            <div className="hstack" style={{ gap: 8 }}>
              <Button variant="secondary" size="md" style={{ flex: 1 }}>
                <Icon name="link" size={12} />Link existing
              </Button>
              <Button variant="secondary" size="md" style={{ flex: 1 }}>
                <Icon name="doc" size={12} />Need evidence
              </Button>
            </div>
            <Button variant="danger" size="md" className="btn-block">Reject</Button>
          </div>
        </div>

        {finding && (
          <div className="panel-section">
            <PanelSectionTitle>Source finding</PanelSectionTitle>
            <div className="card-nested vstack" style={{ gap: 6 }}>
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="text-xs muted">FROM</span>
                <FindingStatusBadge status={finding.status} />
              </div>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                <span className="row-id" style={{ marginRight: 6 }}>{finding.id}</span>
                {finding.title}
              </div>
              <div className="text-xs muted" style={{ lineHeight: 1.5 }}>{finding.summary}</div>
              <div className="hstack" style={{ gap: 8, marginTop: 4 }}>
                <ConfidenceBadge confidence={finding.confidence} />
                <OutlineBadge>Evidence · {finding.evidenceCount}</OutlineBadge>
              </div>
            </div>
          </div>
        )}

        <div className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Managed System"><ManagedSystemPill id={r.managedSystem} /></FieldRow>
          <FieldRow label="Impact"><SeverityBadge severity={priorityToSeverity(r.impact)} /></FieldRow>
          <FieldRow label="Reviewer">
            {r.reviewer ? <UserChip user={window.userById(r.reviewer)} /> :
              <button className="btn btn-subtle btn-sm">Assign reviewer</button>}
          </FieldRow>
          <FieldRow label="Self-approval">
            <span className="badge badge-internal-only">requires scoped capability</span>
          </FieldRow>
        </div>

        <div className="panel-section">
          <PanelSectionTitle>Audit</PanelSectionTitle>
          <div className="timeline">
            <div className="timeline-item">
              <Avatar user={requester} size="sm" />
              <div className="timeline-item-body">
                <div className="timeline-meta"><strong>{requester.name}</strong> · 요청 작성 · {r.createdAt}</div>
                <div className="timeline-content" style={{ borderLeft: '2px solid var(--color-amber)' }}>
                  Finding 근거를 기반으로 Task Request를 작성했습니다. Reviewer 검토 부탁드립니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TaskRequestView({ scope, selectedParam }) {
  const filtered = window.TaskRequests.filter(r => scope.members.includes(r.managedSystem));
  const [activeTab, setActiveTab] = useState('pending_review');
  const tabs = [
    { key: 'pending_review', label: 'Pending', count: filtered.filter(r => r.status === 'pending_review').length, accent: true },
    { key: 'needs_more_evidence', label: 'Needs evidence', count: filtered.filter(r => r.status === 'needs_more_evidence').length },
    { key: 'approved', label: 'Approved', count: filtered.filter(r => r.status === 'approved').length },
    { key: 'rejected', label: 'Rejected', count: filtered.filter(r => r.status === 'rejected').length },
    { key: 'all', label: 'All', count: filtered.length },
  ];
  const shown = activeTab === 'all' ? filtered : filtered.filter(r => r.status === activeTab);
  const [selectedId, setSelectedId] = useState(selectedParam || shown[0]?.id);
  useEffect(() => {
    if (selectedParam) setSelectedId(selectedParam);
  }, [selectedParam]);
  const selected = selectedId ? (shown.find(r => r.id === selectedId) || filtered.find(r => r.id === selectedId)) : null;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Request 검색…" />
          <Button variant="subtle" size="sm">Bulk assign reviewer</Button>
        </ListToolbar>
        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.map(r => (
            <TaskRequestRow key={r.id} r={r} selected={selected?.id === r.id} onSelect={(x) => setSelectedId(x.id)} />
          ))}
        </div>
      </div>
      {selected && <TaskRequestPanel r={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}

// ============================================================
// My Tasks (?view=my) — list of tasks assigned to current actor.
// Spec: routes-and-layout.md §Route Contract
// /tasks?view=my&selected=:taskId
// Tabs partition my workload by execution stage.
// ============================================================
const MY_TASK_TABS = [
  { key: 'active',    label: 'Active',    statuses: ['todo', 'doing', 'review'] },
  { key: 'backlog',   label: 'Backlog',   statuses: ['backlog'] },
  { key: 'released',  label: 'Released',  statuses: ['released'] },
  { key: 'done',      label: 'Done',      statuses: ['done'] },
];

function TaskMyView({ scope, currentActorId = 'u-1' }) {
  const mine = useMemo(() => {
    const base = window.Tasks.filter(t => t.assignee === currentActorId);
    return base.filter(t => scope.members.includes(t.managedSystem));
  }, [scope.id, currentActorId]);

  const [activeTab, setActiveTab] = useState('active');
  const tabsWithCount = MY_TASK_TABS.map(t => ({
    ...t,
    count: mine.filter(x => t.statuses.includes(x.status)).length,
  }));
  const shown = useMemo(() => {
    const tab = MY_TASK_TABS.find(t => t.key === activeTab);
    return mine
      .filter(t => tab.statuses.includes(t.status))
      .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }, [mine, activeTab]);

  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(t => t.id === selectedId) : null;

  // KPI strip — health signals specific to "my workload"
  const inFlight = mine.filter(t => ['doing', 'review'].includes(t.status)).length;
  const inReview = mine.filter(t => t.status === 'review').length;
  const blocked  = mine.filter(t => t.blocked).length;

  return (
    <>
      <div className="main-region">
        <ListToolbar
          tabs={tabsWithCount}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={<Button variant="primary" size="sm" icon="plus">New task</Button>}>
          <SearchInput placeholder="내 task 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="sort" size={12} />Priority</button>
        </ListToolbar>

        <div className="hstack" style={{
          gap: 18, padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-canvas)',
          flexShrink: 0,
        }}>
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>In flight</span>
            <span className="text-md tabular" style={{ fontWeight: 600 }}>{inFlight}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>In review</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-aether-blue)' }}>{inReview}</span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Blocked</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: blocked > 0 ? 'var(--text-warning)' : 'var(--text-muted)' }}>{blocked}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span className="text-xs muted hstack" style={{ gap: 6 }}>
            <Icon name="user" size={11} />
            나({window.userById(currentActorId).name})에게 할당된 task만 표시
          </span>
        </div>

        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.length === 0 ? (
            <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>
              표시할 task 가 없습니다.
            </div>
          ) : (
            <div className="object-list">
              {shown.map(t => (
                <TaskBacklogRow key={t.id} task={t} selected={selected?.id === t.id} onSelect={(x) => setSelectedId(x.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}

// ============================================================
// Tasks Inbox (?view=inbox) — open-processing workspace per the same
// inbox pattern as VOC Inbox: recent activity affecting the actor's
// tasks. Spec: routes-and-layout.md §Route Contract /tasks?view=inbox
// ============================================================
const INBOX_EVENT_KINDS = {
  assigned:    { icon: 'user',     color: 'var(--color-aether-blue)', label: '할당됨' },
  mention:     { icon: 'pulse',    color: 'var(--color-cyan-spark)',  label: '@mention' },
  status:      { icon: 'task',     color: 'var(--color-neon-lime)',   label: '상태 변경' },
  request:     { icon: 'inbox',    color: 'var(--color-amber)',       label: '검토 요청' },
  released:    { icon: 'check',    color: 'var(--color-emerald)',     label: 'Released' },
};

// Synthesize an activity feed from existing Tasks. Production should
// drive this from `events?subject=me&domain=tasks`.
function buildTaskInbox(currentActorId) {
  const events = [];
  window.Tasks.forEach(t => {
    if (t.assignee === currentActorId && ['todo', 'doing'].includes(t.status)) {
      events.push({ kind: 'assigned', task: t, at: t.createdAt || t.updatedAt, by: 'u-3' });
    }
    if (t.status === 'review' && t.assignee === currentActorId) {
      events.push({ kind: 'request', task: t, at: t.updatedAt, by: 'u-2', reason: 'Code review 요청' });
    }
    if (t.status === 'released') {
      events.push({ kind: 'released', task: t, at: t.updatedAt, by: t.assignee });
    }
    if (t.linkedVocCount > 2 && t.assignee === currentActorId) {
      events.push({ kind: 'mention', task: t, at: t.updatedAt, by: 'u-4', context: 'VOC linked' });
    }
  });
  // sort newest-first using mock string ordering (real impl: use ISO timestamps)
  return events.slice(0, 12);
}

function TaskInboxRow({ event, selected, onSelect }) {
  const kind = INBOX_EVENT_KINDS[event.kind];
  const actor = window.userById(event.by);
  const t = event.task;
  return (
    <div
      className={`object-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(event)}
      style={{ gridTemplateColumns: 'auto 1fr auto' }}>
      <div className="hstack" style={{ gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--surface-card)',
          display: 'grid', placeItems: 'center',
          boxShadow: 'var(--shadow-subtle)',
        }}>
          <Icon name={kind.icon} size={12} style={{ color: kind.color }} />
        </div>
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="text-xs" style={{
            color: kind.color, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{kind.label}</span>
          <span className="row-id">{t.id}</span>
          <span>{t.title}</span>
        </div>
        <div className="row-meta">
          {actor && <UserChip user={actor} size="xs" />}
          <span className="dot" />
          <InternalTaskBadge status={t.status} />
          <span className="dot" />
          <ManagedSystemPill id={t.managedSystem} />
          {event.context && <>
            <span className="dot" />
            <span>{event.context}</span>
          </>}
          {event.reason && <>
            <span className="dot" />
            <span style={{ color: 'var(--color-amber)' }}>{event.reason}</span>
          </>}
          <span className="dot" />
          <span>{event.at}</span>
        </div>
      </div>
      <div className="row-trailing">
        <Icon name="chevronRight" size={11} style={{ color: 'var(--text-muted)' }} />
      </div>
    </div>
  );
}

function TaskInboxView({ scope, currentActorId = 'u-1' }) {
  const events = useMemo(() => {
    const base = buildTaskInbox(currentActorId);
    return base.filter(e => scope.members.includes(e.task.managedSystem));
  }, [scope.id, currentActorId]);

  const [activeTab, setActiveTab] = useState('all');
  const tabs = [
    { key: 'all',       label: 'All',           count: events.length },
    { key: 'assigned',  label: 'Newly assigned', count: events.filter(e => e.kind === 'assigned').length },
    { key: 'request',   label: 'Review requested', count: events.filter(e => e.kind === 'request').length, accent: true },
    { key: 'mention',   label: '@Mentions',     count: events.filter(e => e.kind === 'mention').length },
    { key: 'released',  label: 'Released',      count: events.filter(e => e.kind === 'released').length },
  ];
  const shown = activeTab === 'all' ? events : events.filter(e => e.kind === activeTab);
  const [selectedId, setSelectedId] = useState(shown[0]?.task.id);
  const selectedEvent = selectedId ? shown.find(e => e.task.id === selectedId) : null;
  const selected = selectedEvent?.task;

  return (
    <>
      <div className="main-region">
        <ListToolbar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={<Button variant="subtle" size="sm" icon="check">모두 읽음으로</Button>}>
          <SearchInput placeholder="Inbox 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="filter" size={12} />Filter</button>
        </ListToolbar>

        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.length === 0 ? (
            <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>
              표시할 알림이 없습니다.
            </div>
          ) : (
            <div className="object-list">
              {shown.map(e => (
                <TaskInboxRow
                  key={`${e.kind}-${e.task.id}`}
                  event={e}
                  selected={selected?.id === e.task.id}
                  onSelect={(x) => setSelectedId(x.task.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function TasksScreen({ view, selectedParam, scope }) {
  if (view === 'requests')   return <TaskRequestView scope={scope} selectedParam={selectedParam} />;
  if (view === 'backlog')    return <TaskBacklogView scope={scope} />;
  if (view === 'my')         return <TaskMyView scope={scope} />;
  if (view === 'inbox')      return <TaskInboxView scope={scope} />;
  return <TaskBoardView scope={scope} selectedParam={selectedParam} />;
}

Object.assign(window, { TasksScreen, TaskBoardView, TaskRequestView, TaskBacklogView, TaskMyView, TaskInboxView });
