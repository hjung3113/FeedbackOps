// ============================================================
// FeedbackOps — Desktop linked-flow draft panels
// ============================================================
// Shared inline flow used by VOC / Evidence / Finding / Survey result.
// Keeps Pack 14 scope desktop-first: detail-panel rhythm, editable draft,
// and explicit next route without mobile sheets or new navigation modes.

function FlowField({ label, children }) {
  return (
    <label className="vstack" style={{ gap: 6 }}>
      <span className="text-xs muted">{label}</span>
      {children}
    </label>
  );
}

function DesktopFlowDraftPanel({
  type = 'task-request',
  sourceKind,
  sourceId,
  sourceTitle,
  targetKind,
  targetId,
  targetTitle,
  intentAction,
  defaultSummary,
  onNavigate,
  onClose,
}) {
  const spec = {
    'evidence-draft': {
      badge: 'Evidence Highlight draft',
      title: 'Draft evidence highlight',
      primary: 'Stage highlight',
      secondary: 'Open Evidence',
      route: ['integration-evidence', null],
      routeLabel: 'Review in Evidence',
      icon: 'doc',
      fields: [
        ['Evidence type', ['Quote', 'Summary', 'Survey free-text']],
        ['Visibility', ['Internal only', 'Reporter-visible after review']],
      ],
    },
    'task-request': {
      badge: 'Task Request draft',
      title: 'Draft task request',
      primary: 'Stage request',
      secondary: 'Open Requests',
      route: ['tasks', 'requests'],
      routeLabel: 'Review in Task Requests',
      icon: 'task',
      fields: [
        ['Priority', ['High', 'Medium', 'Low']],
        ['Execution owner', ['Unassigned', 'Platform Team', 'Analytics Engineering']],
      ],
    },
    'finding-draft': {
      badge: 'Finding draft',
      title: 'Promote evidence to Finding',
      primary: 'Stage finding',
      secondary: 'Open Findings',
      route: ['findings', null],
      routeLabel: 'Review in Findings',
      icon: 'finding',
      fields: [
        ['Confidence', ['Medium', 'High', 'Low']],
        ['Impact', ['High', 'Medium', 'Critical']],
      ],
    },
    'attach-voc': {
      badge: 'VOC evidence attach',
      title: 'Attach survey evidence to existing VOC',
      primary: 'Stage attachment',
      secondary: 'Open VOC Inbox',
      route: ['voc', 'inbox'],
      routeLabel: 'Choose VOC in Inbox',
      icon: 'attach',
      fields: [
        ['Match rule', ['Same managed system + similar issue', 'Manual selection']],
        ['Attachment note', ['Append as evidence', 'Needs owner review']],
      ],
    },
  }[type];

  const [summary, setSummary] = useState(defaultSummary || sourceTitle || '');
  const [first, setFirst] = useState(spec.fields[0][1][0]);
  const [second, setSecond] = useState(spec.fields[1][1][0]);
  const [staged, setStaged] = useState(false);
  const routeParam = targetId || sourceId;
  const intentLabel = intentAction || spec.primary;

  const routeToTarget = () => {
    if (!spec.route || !onNavigate) return;
    onNavigate(spec.route[0], spec.route[1], routeParam);
  };

  return (
    <div className="card-nested vstack" style={{
      gap: 10,
      marginTop: 10,
      border: '1px solid color-mix(in oklch, var(--border-selected) 52%, var(--border-subtle))',
      background: 'linear-gradient(180deg, color-mix(in oklch, var(--color-aether-blue) 8%, var(--surface-card)), var(--surface-card))',
    }}>
      <div className="hstack" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div className="vstack" style={{ gap: 4, minWidth: 0 }}>
          <OutlineBadge><Icon name={spec.icon} size={10} />{spec.badge}</OutlineBadge>
          <strong className="text-sm">{spec.title}</strong>
          <span className="text-xs muted">
            From <span className="mono">{sourceId}</span> · {sourceKind}
          </span>
          {targetId && (
            <span className="text-xs muted">
              Target <span className="mono">{targetId}</span> · {targetKind || 'linked entity'}
            </span>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} title="Close draft" />
        )}
      </div>

      <FlowField label="Draft summary">
        <textarea
          value={summary}
          onChange={(e) => { setSummary(e.target.value); setStaged(false); }}
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 88,
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            background: 'var(--surface-canvas)',
            color: 'var(--text-primary)',
            padding: '9px 10px',
            font: 'inherit',
            lineHeight: 1.45,
          }}
        />
      </FlowField>

      <div className="card-nested vstack" style={{ gap: 6, padding: 10, background: 'var(--surface-canvas)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span className="text-xs muted">Route-resolution intent</span>
          <span className="mono text-xs">{spec.route[0]}{spec.route[1] ? `/${spec.route[1]}` : ''}{routeParam ? ` · ${routeParam}` : ''}</span>
        </div>
        <div className="text-xs muted">
          {intentLabel}: <span className="mono">{sourceKind}:{sourceId}</span>
          {targetId ? <> → <span className="mono">{targetKind || 'Target'}:{targetId}</span></> : ' → backend resolves the created entity id'}
        </div>
        {targetTitle && <div className="text-xs muted">Target title · {targetTitle}</div>}
      </div>

      <div className="hstack" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <FlowField label={spec.fields[0][0]}>
          <select className="input" value={first} onChange={(e) => { setFirst(e.target.value); setStaged(false); }}>
            {spec.fields[0][1].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FlowField>
        <FlowField label={spec.fields[1][0]}>
          <select className="input" value={second} onChange={(e) => { setSecond(e.target.value); setStaged(false); }}>
            {spec.fields[1][1].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FlowField>
      </div>

      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm" onClick={() => setStaged(true)}>
          <Icon name="check" size={11} />{spec.primary}
        </Button>
        <Button variant="secondary" size="sm" onClick={routeToTarget}>
          <Icon name="arrowRight" size={11} />{spec.routeLabel}
        </Button>
        <Button variant="subtle" size="sm" onClick={() => setSummary(defaultSummary || sourceTitle || '')}>
          Reset
        </Button>
      </div>

      {staged && (
        <Callout tone="blue" icon="check" title="Intent staged">
          {first} · {second}. API-pending: persist this intent, then redirect with the resolved entity id.
        </Callout>
      )}
    </div>
  );
}

Object.assign(window, { DesktopFlowDraftPanel });
