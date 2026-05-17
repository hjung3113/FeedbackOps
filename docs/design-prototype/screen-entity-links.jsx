// ============================================================
// FeedbackOps — Integration · Entity links
// Route: integration-links
// ============================================================
// entity_links is the catch-all join table for cross-system,
// optional, or many-to-many relationships. This surface lets ops
// audit active vs stale vs detached links, and supports the
// missing-link queries by providing the actual link inventory.
//
// Spec sources:
//   - docs/design/11-entity-linking.md   (FR-LINK-001..003, lifecycle)
//   - docs/frontend/routes-and-layout.md (/integration/links)
// ============================================================

// ------------------------------------------------------------
// Mock data — entity_links rows.
// status: active | stale | detached | revoked
// rel_type: spec-defined relation tokens (evidence_of, executes,
//   public_update_of, derived_from, attached_to, blocked_by, ...).
// ------------------------------------------------------------
const ENTITY_LINKS = [
  {
    id: 'el-1042',
    source: { type: 'voc', id: 'VOC-2813' },
    target: { type: 'finding', id: 'FIN-181' },
    relType: 'evidence_of',
    managedSystem: 'powerbi',
    status: 'active',
    createdBy: 'u-2', createdAt: '1h ago', updatedAt: '1h ago',
  },
  {
    id: 'el-1041',
    source: { type: 'finding', id: 'FIN-181' },
    target: { type: 'task', id: 'TASK-902' },
    relType: 'executes',
    managedSystem: 'powerbi',
    status: 'active',
    createdBy: 'u-2', createdAt: '1h ago', updatedAt: '1h ago',
  },
  {
    id: 'el-1040',
    source: { type: 'finding', id: 'FIN-179' },
    target: { type: 'task', id: 'TASK-901' },
    relType: 'executes',
    managedSystem: 'tableau',
    status: 'active',
    createdBy: 'u-1', createdAt: '2h ago', updatedAt: '2h ago',
  },
  {
    id: 'el-1039',
    source: { type: 'task', id: 'TASK-901' },
    target: { type: 'voc', id: 'VOC-2809' },
    relType: 'public_update_of',
    managedSystem: 'tableau',
    status: 'active',
    createdBy: 'u-1', createdAt: '3h ago', updatedAt: '3h ago',
  },
  {
    id: 'el-1038',
    source: { type: 'survey', id: 'SRV-21·R-7' },
    target: { type: 'finding', id: 'FIN-179' },
    relType: 'evidence_of',
    managedSystem: 'tableau',
    status: 'active',
    createdBy: 'u-1', createdAt: '어제', updatedAt: '어제',
  },
  {
    id: 'el-1031',
    source: { type: 'voc', id: 'VOC-2785' },
    target: { type: 'finding', id: 'FIN-172' },
    relType: 'evidence_of',
    managedSystem: 'tableau',
    status: 'stale',
    staleReason: '94 days since last touch · source VOC reopened',
    createdBy: 'u-2', createdAt: '2026-02-08', updatedAt: '2026-02-09',
  },
  {
    id: 'el-1029',
    source: { type: 'task', id: 'TASK-880' },
    target: { type: 'voc', id: 'VOC-2808' },
    relType: 'public_update_of',
    managedSystem: 'tableau',
    status: 'stale',
    staleReason: 'Task released 12d ago, VOC reporter-facing status still in progress',
    createdBy: 'u-1', createdAt: '3주 전', updatedAt: '12일 전',
  },
  {
    id: 'el-1024',
    source: { type: 'finding', id: 'FIN-168' },
    target: { type: 'task', id: 'TASK-861' },
    relType: 'executes',
    managedSystem: 'looker',
    status: 'detached',
    detachReason: 'Finding marked not_actionable; execution unwound',
    actor: 'u-5',
    createdBy: 'u-5', createdAt: '2026-01-14', updatedAt: '2026-04-02',
  },
  {
    id: 'el-1019',
    source: { type: 'voc', id: 'VOC-2701' },
    target: { type: 'finding', id: 'FIN-155' },
    relType: 'evidence_of',
    managedSystem: 'metabase',
    status: 'revoked',
    detachReason: 'Audit: source VOC was a duplicate; merged into VOC-2702',
    actor: 'u-1',
    createdBy: 'u-1', createdAt: '2025-12-02', updatedAt: '2026-03-21',
  },
];

const REL_TYPE_LABEL = {
  evidence_of:      'evidence_of',
  executes:         'executes',
  public_update_of: 'public_update_of',
  derived_from:     'derived_from',
  attached_to:      'attached_to',
  blocked_by:       'blocked_by',
};

function LinkStatusBadge({ status }) {
  const meta = {
    active:   { label: 'Active',   color: 'var(--text-success)', bg: 'rgba(39,166,68,0.12)' },
    stale:    { label: 'Stale',    color: 'var(--color-amber)',  bg: 'rgba(242,196,109,0.12)' },
    detached: { label: 'Detached', color: 'var(--text-muted)',   bg: 'rgba(138,143,152,0.12)' },
    revoked:  { label: 'Revoked',  color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)' },
  }[status] || { label: status, color: 'var(--text-muted)', bg: 'transparent' };
  return (
    <span className="badge" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function EntityLinkRow({ link, selected, onSelect, checked, onToggleCheck }) {
  return (
    <div className={`object-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(link)}
      style={{ gridTemplateColumns: '24px auto 1fr auto' }}>
      <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleCheck(link.id, e.target.checked)}
        style={{ accentColor: 'var(--color-neon-lime)' }} />
      <div className="hstack" style={{ gap: 10, alignItems: 'center' }}>
        <span className="mono text-xs muted" style={{ minWidth: 64 }}>{link.id}</span>
      </div>
      <div className="row-body">
        {/* Pack 10 — shared <EntityRelationRow> covers both the source→target
            stem here and the single-entity cluster member row. */}
        <div className="row-title" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <EntityRelationRow
            left={link.source}
            right={link.target}
            relation={REL_TYPE_LABEL[link.relType] || link.relType}
            compact
            style={{
              padding: 0, background: 'transparent', boxShadow: 'none',
              display: 'inline-flex', minWidth: 0,
            }}
          />
          <LinkStatusBadge status={link.status} />
        </div>
        <div className="row-meta">
          <ManagedSystemPill id={link.managedSystem} />
          <span className="dot" />
          <span>by {window.userById(link.createdBy)?.name || link.createdBy}</span>
          <span className="dot" />
          <span>updated {link.updatedAt}</span>
          {link.staleReason && (<>
            <span className="dot" />
            <span style={{ color: 'var(--color-amber)' }}>{link.staleReason}</span>
          </>)}
        </div>
      </div>
      <div className="row-trailing" style={{ gap: 6 }}>
        {link.status === 'stale' && (
          <Button variant="subtle" size="sm">Refresh</Button>
        )}
        {link.status === 'active' && (
          <Button variant="ghost" size="sm" icon="more" />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Detail panel
// ------------------------------------------------------------
function EntityLinkDetailPanel({ link, onClose }) {
  const createdBy = window.userById(link.createdBy);
  const actor = link.actor ? window.userById(link.actor) : null;
  const scrollRef = useRef(null);
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'endpoints', label: 'Endpoints' },
    (link.status === 'stale' || link.status === 'detached' || link.status === 'revoked') &&
      { id: 'status', label: 'Status' },
    { id: 'properties', label: 'Properties' },
  ].filter(Boolean);
  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="evidence" id={link.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Entity link" entityId={link.id}
          copyHash={`#route=integration-links&param=${link.id}`} />
      } />

      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

      <div className="panel-scroll" ref={scrollRef}>
        <div data-anchor="overview">
          <PanelTitleBlock title={`${link.source.type} → ${link.target.type}`}>
            <OutlineBadge>{REL_TYPE_LABEL[link.relType] || link.relType}</OutlineBadge>
            <LinkStatusBadge status={link.status} />
            <ManagedSystemPill id={link.managedSystem} />
          </PanelTitleBlock>
        </div>

        {/* Endpoints */}
        <div data-anchor="endpoints" className="panel-section">
          <PanelSectionTitle>Endpoints</PanelSectionTitle>
          <div className="vstack" style={{ gap: 8 }}>
            <div className="entity-node">
              <EntityIconBadge type={link.source.type} />
              <div className="entity-node-body">
                <div className="entity-node-title mono">{link.source.id}</div>
                <div className="entity-node-meta">source · {link.source.type}</div>
              </div>
              <button className="btn btn-subtle btn-sm">
                <Icon name="arrowRight" size={10} />Open
              </button>
            </div>
            <div className="entity-node">
              <EntityIconBadge type={link.target.type} />
              <div className="entity-node-body">
                <div className="entity-node-title mono">{link.target.id}</div>
                <div className="entity-node-meta">target · {link.target.type}</div>
              </div>
              <button className="btn btn-subtle btn-sm">
                <Icon name="arrowRight" size={10} />Open
              </button>
            </div>
          </div>
        </div>

        {/* Status copy */}
        {link.status === 'stale' && (
          <div data-anchor="status" className="panel-section">
            <Callout tone="amber" icon="alert" title="Stale link"
              action={<Button variant="primary" size="sm">Refresh</Button>}>
              {link.staleReason}
            </Callout>
          </div>
        )}
        {(link.status === 'detached' || link.status === 'revoked') && (
          <div data-anchor="status" className="panel-section">
            <Callout tone="red" icon="shield" title={link.status === 'detached' ? 'Detached' : 'Revoked'}>
              {link.detachReason}{actor && ` · by ${actor.name}`}.
              Canonical history 는 유지되며 hard-delete 되지 않습니다 (FR-LINK-001A).
            </Callout>
          </div>
        )}

        {/* Properties */}
        <div data-anchor="properties" className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Relation"><OutlineBadge>{REL_TYPE_LABEL[link.relType] || link.relType}</OutlineBadge></FieldRow>
          <FieldRow label="Managed System"><ManagedSystemPill id={link.managedSystem} /></FieldRow>
          <FieldRow label="Created by"><UserChip user={createdBy} /></FieldRow>
          <FieldRow label="Created">{link.createdAt}</FieldRow>
          <FieldRow label="Last updated">{link.updatedAt}</FieldRow>
          <FieldRow label="Visibility">
            <span className="badge badge-internal-only"><Icon name="user" size={9} />Internal only</span>
          </FieldRow>
        </div>
      </div>

      <div className="panel-footer">
        {link.status === 'active' && (
          <Button variant="secondary" className="btn-block">
            <Icon name="link" size={12} />Detach link
          </Button>
        )}
        {link.status === 'stale' && (
          <Button variant="primary" className="btn-block">
            <Icon name="refresh" size={12} />Mark refreshed
          </Button>
        )}
        {(link.status === 'detached' || link.status === 'revoked') && (
          <Button variant="subtle" className="btn-block" disabled>
            Read-only · canonical history
          </Button>
        )}
        <Button variant="secondary" size="md"><Icon name="more" size={14} /></Button>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
function EntityLinksScreen({ scope, onNavigate }) {
  const filtered = ENTITY_LINKS.filter(l => scope.members.includes(l.managedSystem));
  const [activeTab, setActiveTab] = useState('all');
  const [selectedId, setSelectedId] = useState(filtered[0]?.id);
  // Bulk selection: ids checked for batch operations. Map id → true.
  const [checked, setChecked] = useState({});
  // Detached/revoked link ids — visually demote rows that the user just
  // bulk-acted on. Pure mock; production calls the detach endpoint.
  const [detachedIds, setDetachedIds] = useState(new Set());
  // Pack 10 — "Last refreshed at" stamp.  Production should hydrate from
  // the read model's freshness header; in the prototype we bump this on
  // mount and on every Refresh action so the LiveTimestamp animates.
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const handleRefresh = () => setRefreshedAt(new Date());

  const tabs = [
    { key: 'all',      label: 'All',      count: filtered.length },
    { key: 'active',   label: 'Active',   count: filtered.filter(l => l.status === 'active').length },
    { key: 'stale',    label: 'Stale',    count: filtered.filter(l => l.status === 'stale').length, urgent: true },
    { key: 'detached', label: 'Detached', count: filtered.filter(l => l.status === 'detached').length },
    { key: 'revoked',  label: 'Revoked',  count: filtered.filter(l => l.status === 'revoked').length },
  ];

  const shown = (activeTab === 'all' ? filtered : filtered.filter(l => l.status === activeTab))
    .map(l => detachedIds.has(l.id) ? { ...l, status: 'detached', detachReason: l.detachReason || 'Bulk-detached by current actor', actor: l.actor || 'u-1' } : l);
  const selected = shown.find(l => l.id === selectedId) || filtered.find(l => l.id === selectedId);

  // Only Active + Stale rows are bulk-actionable.
  const actionableIds = shown.filter(l => l.status === 'active' || l.status === 'stale').map(l => l.id);
  const allActionableChecked = actionableIds.length > 0 && actionableIds.every(id => checked[id]);
  const someActionableChecked = actionableIds.some(id => checked[id]);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  const toggleAll = (next) => {
    const c = { ...checked };
    actionableIds.forEach(id => { c[id] = next; });
    setChecked(c);
  };
  const toggleOne = (id, next) => setChecked(c => ({ ...c, [id]: next }));
  const clearSelection = () => setChecked({});
  const handleBulkDetach = () => {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    setDetachedIds(prev => new Set([...prev, ...ids]));
    clearSelection();
  };
  const handleBulkRefresh = () => {
    // Mock: nothing to refresh persistently — just clear selection.
    clearSelection();
  };

  return (
    <ListShell
      toolbar={
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer', paddingLeft: 4 }}>
            <input type="checkbox"
              checked={allActionableChecked}
              ref={(el) => { if (el) el.indeterminate = someActionableChecked && !allActionableChecked; }}
              onChange={(e) => toggleAll(e.target.checked)}
              style={{ accentColor: 'var(--color-neon-lime)' }} />
            <span className="text-xs muted">Select actionable</span>
          </label>
          <LiveTimestamp since={refreshedAt} label="Live" />
          <SearchInput placeholder="Entity link 검색…" />
          <button className="btn btn-subtle btn-sm" onClick={handleRefresh}>
            <Icon name="refresh" size={12} />Refresh
          </button>
          <button className="btn btn-subtle btn-sm">
            <Icon name="filter" size={12} />Rel type
          </button>
          <button className="btn btn-subtle btn-sm">
            <Icon name="sort" size={12} />Sort
          </button>
        </ListToolbar>
      }
      afterList={checkedCount > 0 && (
          <div className="hstack" style={{
            padding: '10px 16px',
            background: 'var(--surface-popover)',
            borderTop: '1px solid var(--border-strong)',
            gap: 12,
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <span className="hstack" style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(20, 40, 160,0.18)', color: 'var(--color-neon-lime)',
              justifyContent: 'center', fontWeight: 600, fontSize: 11,
            }}>{checkedCount}</span>
            <span className="text-sm">
              {checkedCount} {checkedCount === 1 ? 'link' : 'links'} selected
            </span>
            <span className="text-xs muted">· audited · canonical history 유지됨</span>
            <div style={{ flex: 1 }} />
            <Button variant="subtle" size="sm" onClick={handleBulkRefresh}>
              <Icon name="refresh" size={11} />Mark refreshed
            </Button>
            <Button variant="danger" size="sm" onClick={handleBulkDetach}>
              <Icon name="link" size={11} />Detach {checkedCount}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
          </div>
        )}
      detail={selected && <EntityLinkDetailPanel link={selected} onClose={() => setSelectedId(null)} />}>
      {shown.length === 0 ? (
        <div className="text-sm muted" style={{ padding: 24, textAlign: 'center' }}>
          해당 상태의 entity_link 가 없습니다.
        </div>
      ) : shown.map(l => (
        <EntityLinkRow key={l.id} link={l}
          selected={selectedId === l.id}
          onSelect={(x) => setSelectedId(x.id)}
          checked={!!checked[l.id]}
          onToggleCheck={toggleOne} />
      ))}
    </ListShell>
  );
}

Object.assign(window, { EntityLinksScreen, ENTITY_LINKS });
