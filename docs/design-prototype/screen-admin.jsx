// ============================================================
// FeedbackOps — Admin · Managed Systems + Analytics Areas
// Split from screen-other.jsx (Pack 19) for Rule 2 compliance.
// Admin route family per routes-and-layout.md §Admin:
//   /admin/managed-systems       → AdminScreen
//   /admin/analytics-areas       → AdminAreasScreen (+ AnalyticsAreaSlideOver)
//   /admin/permissions/requests  → screen-permissions.jsx
//   /admin/settings              → screen-admin-settings.jsx
// ============================================================

function AdminScreen({ onNavigate }) {
  const pending = window.PermissionRequests
    ? window.PermissionRequests.filter(r => r.status === 'pending' || r.status === 'needs_more_info').length
    : 2;
  return (
    <PageShell
      title="Managed systems"
      subtitle="Managed System 은 MVP 의 권한·집계 단위입니다. Project 가 아닙니다. 각 시스템의 default owner, AA 매핑, 활성 상태를 관리합니다."
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="primary" size="sm" icon="plus">Register system</Button>
      </>}>

        <PanelSectionTitle action={
          <span className="text-xs muted">
            {window.ManagedSystems.length} systems · {window.AnalyticsAreas.length} analytics areas
          </span>
        }>
          Registry
        </PanelSectionTitle>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          {window.ManagedSystems.map((m, i) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.6fr 1.1fr 1.4fr 110px', gap: 12, padding: '12px 16px', alignItems: 'center', borderBottom: i < window.ManagedSystems.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div className="scope-mark" style={{ width: 28, height: 28, background: m.color, fontSize: 11 }}>{m.mark}</div>
              <div>
                <div className="text-sm" style={{ fontWeight: 500 }}>{m.name}</div>
                <div className="text-xs muted mono">managed-system/{m.id}</div>
              </div>
              <div className="vstack" style={{ gap: 2 }}>
                <span className="text-xs muted">Default owner</span>
                <UserChip user={window.userById('u-1')} size="sm" />
              </div>
              <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                {window.AnalyticsAreas.filter(a => a.managedSystem === m.id).map(a => (
                  <OutlineBadge key={a.id}>{a.name}</OutlineBadge>
                ))}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Button variant="subtle" size="sm">Configure</Button>
              </div>
            </div>
          ))}
        </div>

        <PanelSectionTitle action={
          <Button variant="primary" size="sm" onClick={() => onNavigate && onNavigate('admin-permissions')}>
            <Icon name="arrowRight" size={11} />Open review console
          </Button>
        }>
          Permission requests
        </PanelSectionTitle>
        <div className="card hstack" style={{ padding: 16, gap: 14 }}>
          <span className="hstack" style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(242,196,109,0.12)', color: 'var(--color-amber)',
            justifyContent: 'center',
          }}>
            <Icon name="shield" size={16} />
          </span>
          <div className="vstack" style={{ gap: 2, flex: 1 }}>
            <div className="text-md" style={{ fontWeight: 600 }}>
              {pending} requests awaiting decision
            </div>
            <span className="text-xs muted">
              Pending · Needs more info · High-risk · Self-approval 까지 검토 콘솔에서 확인합니다.
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate && onNavigate('admin-permissions')}>
            <Icon name="arrowRight" size={11} />Review
          </Button>
        </div>
    </PageShell>
  );
}

// ============================================================
// AdminAreasScreen — /admin/analytics-areas
// AA is a secondary classification, not a permission boundary
// (docs/design/09-permission-access.md §5.4 + routes-and-layout.md).
// ============================================================
function AdminAreasScreen({ onNavigate }) {
  const totalAreas = window.AnalyticsAreas.length;
  const [activeArea, setActiveArea] = useState(null);
  return (
    <>
    <PageShell
      title="Analytics areas"
      subtitle="Analytics Area 는 Managed System 하위의 분류 라벨입니다. 권한 경계가 아니라 dashboard·triage 의 필터 차원입니다."
      actions={<>
        <Button variant="subtle" size="sm" icon="filter">Filter</Button>
        <Button variant="primary" size="sm" icon="plus">New area</Button>
      </>}>

        <Callout tone="blue" icon="shield" title="Analytics Area 는 MVP 권한 경계가 아닙니다">
          AA 는 Managed System 안에서의 분류·집계 단위로만 사용됩니다. AA 별 권한 분기는
          MVP 범위 밖이며, scope 결정은 Managed System 만으로 이루어집니다.
        </Callout>

        <PanelSectionTitle action={
          <span className="text-xs muted">{totalAreas} areas · {window.ManagedSystems.length} systems</span>
        }>
          Catalog
        </PanelSectionTitle>
        <div className="vstack" style={{ gap: 16 }}>
          {window.ManagedSystems.map(m => {
            const areas = window.AnalyticsAreas.filter(a => a.managedSystem === m.id);
            return (
              <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="hstack" style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  gap: 10,
                }}>
                  <div className="scope-mark" style={{ width: 22, height: 22, background: m.color, fontSize: 10 }}>{m.mark}</div>
                  <span className="text-sm" style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className="text-xs muted">· {areas.length} {areas.length === 1 ? 'area' : 'areas'}</span>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-subtle btn-sm">
                    <Icon name="plus" size={11} />Add area
                  </button>
                </div>
                {areas.length === 0 ? (
                  <div className="text-xs muted" style={{ padding: 16, textAlign: 'center' }}>
                    등록된 Analytics Area 가 없습니다.
                  </div>
                ) : (
                  areas.map((a, i) => (
                    <div key={a.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.2fr 0.8fr 100px',
                      gap: 12, padding: '10px 16px',
                      borderBottom: i < areas.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      alignItems: 'center', fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveArea(a)}>
                      <div className="hstack" style={{ gap: 8 }}>
                        <Icon name="layers" size={12} className="muted" />
                        <span style={{ fontWeight: 500 }}>{a.name}</span>
                      </div>
                      <span className="text-xs muted mono">analytics-area/{a.id}</span>
                      <span className="text-xs muted">Lead: <span style={{ color: 'var(--text-secondary)' }}>{window.userById('u-1').name}</span></span>
                      <div style={{ textAlign: 'right' }}>
                        <Button variant="subtle" size="sm"
                          onClick={(e) => { e.stopPropagation(); setActiveArea(a); }}>
                          Detail
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
    </PageShell>
    {activeArea && <AnalyticsAreaSlideOver area={activeArea} onClose={() => setActiveArea(null)} />}
    </>
  );
}

// ============================================================
// AnalyticsAreaSlideOver — read-only AA detail surface (Pack 10).
// Drawer width matches detail-panel pattern so visual rhythm holds.
// ============================================================
function AnalyticsAreaSlideOver({ area, onClose }) {
  const ms = window.msById(area.managedSystem);
  const lead = window.userById('u-1');
  const scrollRef = useRef(null);
  const relatedFindings = (window.Findings || []).filter(f =>
    (window.EvidenceHighlights || []).some(e => e.linkedFindingId === f.id && e.analyticsArea === area.id)
  ).slice(0, 4);
  const evidenceCount = (window.EvidenceHighlights || [])
    .filter(e => e.analyticsArea === area.id).length;
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'definition', label: 'Definition' },
    { id: 'workload', label: 'Workload' },
    relatedFindings.length > 0 && { id: 'findings', label: 'Findings', count: relatedFindings.length },
    { id: 'used-by', label: 'Used by' },
  ].filter(Boolean);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,40,160,0.16)',
        backdropFilter: 'blur(4px)',
        zIndex: 400,
        display: 'grid',
        gridTemplateColumns: '1fr 460px',
      }}>
      <div />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-detail)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column',
          animation: 'cmdk-rise 140ms ease-out',
        }}>
        <div className="panel-header">
          <span className="badge" style={{
            background: 'rgba(94,106,210,0.15)', color: 'var(--color-aether-blue)',
          }}>
            <span className="badge-dot" />Analytics Area
          </span>
          <span className="panel-id mono">analytics-area/{area.id}</span>
          <div className="panel-header-actions">
            <Button variant="ghost" size="sm" icon="link" />
            <Button variant="ghost" size="sm" icon="close" onClick={onClose} title="Close" />
          </div>
        </div>

        <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

        <div className="panel-scroll" ref={scrollRef}>
          <div data-anchor="overview">
            <PanelTitleBlock title={area.name}>
              <ManagedSystemPill id={area.managedSystem} />
              <OutlineBadge>Filter dimension</OutlineBadge>
            </PanelTitleBlock>
          </div>

          <div data-anchor="guardrail" className="panel-section">
            <Callout tone="blue" icon="shield" title="Not a permission boundary">
              AA 는 권한 경계가 아닌 분류·집계 단위입니다. Triage filter, dashboard tab,
              survey targeting 같은 surface 에서만 사용되며 backend permission check 에는
              영향을 주지 않습니다.
            </Callout>
          </div>

          <div data-anchor="definition" className="panel-section">
            <PanelSectionTitle>Definition</PanelSectionTitle>
            <FieldRow label="Managed System">
              <span className="hstack" style={{ gap: 6 }}>
                {ms && <div className="scope-mark" style={{ width: 18, height: 18, background: ms.color, fontSize: 10 }}>{ms.mark}</div>}
                <span>{ms?.name || area.managedSystem}</span>
              </span>
            </FieldRow>
            <FieldRow label="Slug"><span className="mono text-xs">{area.id}</span></FieldRow>
            <FieldRow label="Lead"><UserChip user={lead} /></FieldRow>
            <FieldRow label="Created">2025-12-04</FieldRow>
            <FieldRow label="Default visibility">
              <span className="badge badge-internal-only"><Icon name="shield" size={9} />Internal · MS-scoped</span>
            </FieldRow>
          </div>

          <div data-anchor="workload" className="panel-section">
            <PanelSectionTitle>Workload signal</PanelSectionTitle>
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                <span className="text-xs muted">Active findings</span>
                <span className="text-lg" style={{ fontWeight: 600 }}>{relatedFindings.length || '—'}</span>
                <span className="text-xs muted">in this analytics area</span>
              </div>
              <div className="card-nested vstack" style={{ gap: 4, padding: 12 }}>
                <span className="text-xs muted">Evidence highlights</span>
                <span className="text-lg" style={{ fontWeight: 600 }}>{evidenceCount}</span>
                <span className="text-xs muted">tagged to this AA</span>
              </div>
            </div>
          </div>

          {relatedFindings.length > 0 && (
            <div data-anchor="findings" className="panel-section">
              <PanelSectionTitle>Recent findings</PanelSectionTitle>
              <div className="vstack" style={{ gap: 6 }}>
                {relatedFindings.map(f => (
                  <EntityRelationRow
                    key={f.id}
                    left={{ type: 'finding', id: f.id }}
                    title={f.title}
                    meta={<><span className="mono">{f.id}</span> · {f.impact} impact</>}
                    trailing={<FindingStatusBadge status={f.status} />}
                  />
                ))}
              </div>
            </div>
          )}

          <div data-anchor="used-by" className="panel-section">
            <PanelSectionTitle>Used by</PanelSectionTitle>
            <div className="vstack" style={{ gap: 6 }}>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="voc" size={12} className="muted" />
                <span className="text-sm">VOC Triage</span>
                <span className="text-xs muted">· filter dimension</span>
              </div>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="finding" size={12} className="muted" />
                <span className="text-sm">Findings list</span>
                <span className="text-xs muted">· filter + grouping</span>
              </div>
              <div className="hstack" style={{ gap: 8, padding: '8px 10px', background: 'var(--color-pitch-black)', borderRadius: 6 }}>
                <Icon name="survey" size={12} className="muted" />
                <span className="text-sm">Survey targeting</span>
                <span className="text-xs muted">· segment definition</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel-footer">
          <Button variant="secondary" className="btn-block">
            <Icon name="settings" size={12} />Edit area
          </Button>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { AdminScreen, AdminAreasScreen });
