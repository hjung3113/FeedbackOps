// ============================================================
// FeedbackOps — Entity Hover Preview
// Spec: docs/frontend/interaction-patterns.md §Linked Context Preview Rule
//   "Surfaces that show related objects should show only the minimum context
//    needed for the current task. Detailed linked-object content belongs in
//    that object's DetailPanel or route."
//
// This component wraps an entity reference (e.g. an inline `VOC-2814` mention)
// and shows a hover popover with the backend-safe summary — id, title,
// reporter-safe status, managed system, owner, and a jump action. Permission-
// limited targets render the restricted variant inline.
// ============================================================
const { useState: useEntPState, useRef: useEntPRef, useEffect: useEntPEffect, useMemo: useEntPMemo } = React;

const ENTITY_TYPE_META = {
  voc:      { label: 'VOC',      route: 'voc',           icon: 'voc',     accent: 'var(--color-aether-blue)' },
  finding:  { label: 'Finding',  route: 'findings',      icon: 'finding', accent: 'var(--color-neon-lime)' },
  task:     { label: 'Task',     route: 'tasks',         icon: 'task',    accent: 'var(--color-cyan-spark)' },
  cluster:  { label: 'Cluster',  route: 'voc-clusters',  icon: 'layers',  accent: 'var(--color-aether-blue)' },
  survey:   { label: 'Survey',   route: 'surveys',       icon: 'survey',  accent: 'var(--color-amber)' },
  request:  { label: 'Request',  route: 'tasks',         icon: 'inbox',   accent: 'var(--color-amber)', view: 'requests' },
  evidence: { label: 'Evidence', route: 'integration-evidence', icon: 'doc', accent: 'var(--color-cyan-spark)' },
};

function resolveEntity(type, id) {
  if (type === 'voc')      return (window.Vocs || []).find(v => v.id === id);
  if (type === 'finding')  return (window.Findings || []).find(f => f.id === id);
  if (type === 'task')     return (window.Tasks || []).find(t => t.id === id);
  if (type === 'cluster')  return (window.Clusters || []).find(c => c.id === id);
  if (type === 'survey')   return (window.Surveys || []).find(s => s.id === id);
  if (type === 'request')  return (window.TaskRequests || []).find(r => r.id === id);
  return null;
}

// Render the preview card body per entity type. Production should drive this
// from a backend-provided summary subset (already governed by FR-LINK-002).
function PreviewBody({ type, entity }) {
  if (!entity) {
    return (
      <div className="text-xs muted" style={{ padding: 4 }}>
        대상을 찾을 수 없습니다. 권한이 변경되었거나 항목이 보관되었을 수 있습니다.
      </div>
    );
  }

  // Resolve common fields
  const ms = entity.managedSystem;
  const owner = entity.owner || entity.assignee
    ? window.userById(entity.owner || entity.assignee)
    : null;

  if (type === 'voc') {
    return (
      <>
        <PreviewTitle type="voc" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <ReporterStatusBadge status={entity.reporterStatus} />
          <SeverityBadge severity={entity.severity} />
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        <PreviewFieldRow label="Owner">
          {owner ? <UserChip user={owner} size="xs" /> : <span className="text-xs muted">미배정</span>}
        </PreviewFieldRow>
        {entity.analyticsArea && <PreviewFieldRow label="Area">{entity.analyticsArea}</PreviewFieldRow>}
        <PreviewFieldRow label="Reported">{entity.createdAt}</PreviewFieldRow>
      </>
    );
  }
  if (type === 'finding') {
    return (
      <>
        <PreviewTitle type="finding" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <FindingStatusBadge status={entity.status} />
          {entity.confidence && <ConfidenceBadge confidence={entity.confidence} />}
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        <PreviewFieldRow label="Owner">
          {owner ? <UserChip user={owner} size="xs" /> : <span className="text-xs muted">미배정</span>}
        </PreviewFieldRow>
        {entity.evidenceCount != null && (
          <PreviewFieldRow label="Evidence">{entity.evidenceCount}개 근거</PreviewFieldRow>
        )}
        {entity.linkedTaskId && <PreviewFieldRow label="Task">{entity.linkedTaskId}</PreviewFieldRow>}
      </>
    );
  }
  if (type === 'task') {
    return (
      <>
        <PreviewTitle type="task" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <InternalTaskBadge status={entity.status} />
          <SeverityBadge severity={priorityToSeverity(entity.priority)} />
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        <PreviewFieldRow label="Assignee">
          {owner ? <UserChip user={owner} size="xs" /> : <span className="text-xs muted">미배정</span>}
        </PreviewFieldRow>
        {entity.milestone && <PreviewFieldRow label="Milestone">{entity.milestone}</PreviewFieldRow>}
        {entity.estimate && <PreviewFieldRow label="Estimate">{entity.estimate}</PreviewFieldRow>}
      </>
    );
  }
  if (type === 'cluster') {
    return (
      <>
        <PreviewTitle type="cluster" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <ClusterStatusBadge status={entity.status} />
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        <PreviewFieldRow label="Members">{entity.vocCount}개 VOC</PreviewFieldRow>
        {entity.linkedFindingId && <PreviewFieldRow label="Finding">{entity.linkedFindingId}</PreviewFieldRow>}
      </>
    );
  }
  if (type === 'request') {
    return (
      <>
        <PreviewTitle type="request" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <TaskRequestBadge status={entity.status} />
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        {entity.findingId && <PreviewFieldRow label="Finding">{entity.findingId}</PreviewFieldRow>}
        <PreviewFieldRow label="Evidence">{entity.evidenceCount}개</PreviewFieldRow>
      </>
    );
  }
  if (type === 'survey') {
    return (
      <>
        <PreviewTitle type="survey" id={entity.id} title={entity.title} />
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <SurveyStatusBadge status={entity.status} />
          {ms && <ManagedSystemPill id={ms} />}
        </div>
        {entity.responseCount != null && (
          <PreviewFieldRow label="Responses">{entity.responseCount}건</PreviewFieldRow>
        )}
      </>
    );
  }

  return <span className="text-xs muted">미리보기 사용 불가</span>;
}

function PreviewTitle({ type, id, title }) {
  const meta = ENTITY_TYPE_META[type];
  return (
    <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 22, height: 22, borderRadius: 5,
        background: 'var(--surface-card)',
        display: 'grid', placeItems: 'center',
        color: meta.accent, flexShrink: 0,
      }}>
        <Icon name={meta.icon} size={11} />
      </div>
      <div className="vstack" style={{ gap: 2, minWidth: 0 }}>
        <div className="text-xs muted hstack" style={{ gap: 6 }}>
          <span style={{ color: meta.accent, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {meta.label}
          </span>
          <span className="mono">{id}</span>
        </div>
        <div className="text-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
          {title}
        </div>
      </div>
    </div>
  );
}

function PreviewFieldRow({ label, children }) {
  return (
    <div className="hstack" style={{ gap: 8, padding: '3px 0' }}>
      <span className="text-xs muted" style={{
        width: 64, flexShrink: 0,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</span>
      <div className="text-xs" style={{ flex: 1, color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </div>
  );
}

// Positioning helper — clamp the popover within viewport bounds.
function computePosition(anchorRect, popoverEl) {
  if (!anchorRect || !popoverEl) return { left: 0, top: 0 };
  const margin = 8;
  const popW = popoverEl.offsetWidth || 320;
  const popH = popoverEl.offsetHeight || 180;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 4;
  if (left + popW > window.innerWidth - margin) {
    left = window.innerWidth - margin - popW;
  }
  if (left < margin) left = margin;
  if (top + popH > window.innerHeight - margin) {
    // flip above
    top = anchorRect.top - popH - 4;
  }
  return { left, top };
}

function EntityHoverPreview({ type, id, onNavigate, blocked, children, style }) {
  const [open, setOpen] = useEntPState(false);
  const [pos, setPos] = useEntPState({ left: 0, top: 0 });
  const anchorRef = useEntPRef(null);
  const popRef = useEntPRef(null);
  const enterTimer = useEntPRef(null);
  const leaveTimer = useEntPRef(null);

  const entity = useEntPMemo(() => resolveEntity(type, id), [type, id]);
  const meta = ENTITY_TYPE_META[type];

  const handleEnter = () => {
    clearTimeout(leaveTimer.current);
    clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => setOpen(true), 280);
  };
  const handleLeave = () => {
    clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // Reposition once the popover mounts and after content settles
  useEntPEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    // give the popover one frame to render so we can measure it
    requestAnimationFrame(() => {
      setPos(computePosition(rect, popRef.current));
    });
  }, [open]);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!meta) return;
    const nav = onNavigate || window.__feedbackOpsNavigate;
    if (nav) nav(meta.route, meta.view);
  };

  return (
    <span
      ref={anchorRef}
      className="entity-ref"
      style={style}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}>
      {children || id}
      {open && (
        <span
          ref={popRef}
          className="entity-preview-popover"
          style={{ left: pos.left, top: pos.top }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}>
          {blocked ? (
            <div style={{ padding: 12 }}>
              <PermissionBlockedPanel
                state={blocked.state}
                category={blocked.category || `${meta?.label || 'Entity'} · 접근 제한`}
                reason={blocked.reason}
                requiredScope={blocked.requiredScope}
                summary={blocked.summary} />
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 12px 8px' }}>
                <PreviewBody type={type} entity={entity} />
              </div>
              {entity && meta && (
                <div className="entity-preview-footer">
                  <span className="text-xs muted">상세 보기로 이동</span>
                  <Button variant="subtle" size="sm" onClick={handleClick}>
                    Open <Icon name="arrowRight" size={10} />
                  </Button>
                </div>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}

Object.assign(window, { EntityHoverPreview, ENTITY_TYPE_META, resolveEntity });
