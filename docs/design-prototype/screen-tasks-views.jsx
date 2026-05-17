// ============================================================
// FeedbackOps — My Tasks + Tasks Inbox views
// Split from screen-tasks.jsx (Pack 19) for Rule 2 compliance.
// Loaded AFTER screen-tasks.jsx so we can read TaskDetailPanel +
// TaskBacklogRow from window. Local PRIORITY_ORDER mirrors the one
// in screen-tasks.jsx to keep this file self-contained.
// ============================================================

const MY_TASK_TABS = [
  { key: 'active',    label: 'Active',    statuses: ['todo', 'doing', 'review'] },
  { key: 'backlog',   label: 'Backlog',   statuses: ['backlog'] },
  { key: 'released',  label: 'Released',  statuses: ['released'] },
  { key: 'done',      label: 'Done',      statuses: ['done'] },
];
const MY_PRIORITY_ORDER = { urgent: 4, high: 3, medium: 2, low: 1 };

function TaskMyView({ scope, currentActorId = 'u-1' }) {
  const { TaskDetailPanel, TaskBacklogRow } = window;
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
      .sort((a, b) => MY_PRIORITY_ORDER[b.priority] - MY_PRIORITY_ORDER[a.priority]);
  }, [mine, activeTab]);

  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(t => t.id === selectedId) : null;

  const inFlight = mine.filter(t => ['doing', 'review'].includes(t.status)).length;
  const inReview = mine.filter(t => t.status === 'review').length;
  const blocked  = mine.filter(t => t.blocked).length;

  return (
    <ListShell
      toolbar={
        <ListToolbar
          tabs={tabsWithCount}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={<Button variant="primary" size="sm" icon="plus">New task</Button>}>
          <SearchInput placeholder="내 task 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="sort" size={12} />Priority</button>
        </ListToolbar>
      }
      beforeList={
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
      }
      detail={selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />}>
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
    </ListShell>
  );
}

// ============================================================
// Tasks Inbox (?view=inbox) — same inbox pattern as VOC Inbox.
// Spec: routes-and-layout.md §Route Contract /tasks?view=inbox
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
  const { TaskDetailPanel } = window;
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
    <ListShell
      toolbar={
        <ListToolbar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={<Button variant="subtle" size="sm" icon="check">모두 읽음으로</Button>}>
          <SearchInput placeholder="Inbox 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="filter" size={12} />Filter</button>
        </ListToolbar>
      }
      detail={selected && <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />}>
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
    </ListShell>
  );
}

Object.assign(window, { TaskMyView, TaskInboxView });
