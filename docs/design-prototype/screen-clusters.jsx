// ============================================================
// FeedbackOps — VOC Clusters
// ============================================================

const Clusters = [
  {
    id: 'CLU-31',
    title: '결제 흐름 — 재시도 안내 부재',
    status: 'confirmed',
    managedSystem: 'tableau',
    vocCount: 6,
    severity: 'high',
    confidence: 'high',
    owner: 'u-2',
    updatedAt: '1시간 전',
    linkedFindingId: 'FIN-181',
    rationale: '결제 실패 후 재시도 안내가 보이지 않는다는 동일 패턴의 VOC가 14일간 6건 누적.',
    sampleVocs: ['VOC-2813', 'VOC-2807', 'VOC-2795', 'VOC-2780'],
  },
  {
    id: 'CLU-30',
    title: 'Tableau 사이드 메뉴 사라짐',
    status: 'suggested',
    managedSystem: 'tableau',
    vocCount: 4,
    severity: 'high',
    confidence: 'medium',
    owner: 'u-1',
    updatedAt: '3시간 전',
    linkedFindingId: null,
    rationale: '특정 워크북에서 좌측 메뉴가 일시적으로 사라지는 케이스. 재현 환경이 유사.',
    sampleVocs: ['VOC-2814', 'VOC-2802', 'VOC-2790', 'VOC-2785'],
  },
  {
    id: 'CLU-29',
    title: '초대 메일 도달률 저하',
    status: 'confirmed',
    managedSystem: 'tableau',
    vocCount: 3,
    severity: 'medium',
    confidence: 'medium',
    owner: 'u-2',
    updatedAt: '어제',
    linkedFindingId: 'FIN-180',
    rationale: 'Outlook 보안 정책 변경 이후 스팸 분류 패턴 발견.',
    sampleVocs: ['VOC-2811', 'VOC-2799', 'VOC-2788'],
    // Demo: one cluster member sits in a Managed System scope the actor
    // can't request access to (workspace policy locks cross-MS appeals).
    blockedVocs: {
      'VOC-2799': {
        state: 'blocked_not_requestable',
        category: 'Cluster member · cross-MS access locked',
        reason: '이 VOC 는 Power BI scope 에 있으며 cross-MS 열람이 정책으로 차단되어 있습니다. 요청 대상이 아닙니다.',
      },
    },
  },
  {
    id: 'CLU-28',
    title: 'Looker 알림 미발송',
    status: 'suggested',
    managedSystem: 'looker',
    vocCount: 2,
    severity: 'medium',
    confidence: 'low',
    owner: null,
    updatedAt: '오늘',
    linkedFindingId: null,
    rationale: '알림 미수신 보고가 동시기에 다수 접수. 워커 토큰 이슈로 추정.',
    sampleVocs: ['VOC-2812', 'VOC-2806'],
  },
  {
    id: 'CLU-27',
    title: '리포트 다운로드 지연',
    status: 'confirmed',
    managedSystem: 'tableau',
    vocCount: 7,
    severity: 'high',
    confidence: 'high',
    owner: 'u-1',
    updatedAt: '2일 전',
    linkedFindingId: 'FIN-179',
    rationale: '월간 매출 리포트 추출 시간 증가 — 분석 영역 변경 이후.',
    sampleVocs: ['VOC-2809', 'VOC-2800', 'VOC-2786', 'VOC-2774'],
  },
];

function ClusterRow({ c, selected, onSelect }) {
  const owner = c.owner ? window.userById(c.owner) : null;
  return (
    <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(c)}>
      <div className="hstack gap-12">
        <SeverityIndicator severity={c.severity} />
        <div className="entity-node-icon" style={{ width: 28, height: 28, background: c.status === 'confirmed' ? 'rgba(94,106,210,0.18)' : 'rgba(138,143,152,0.12)', color: c.status === 'confirmed' ? 'var(--color-aether-blue)' : 'var(--text-muted)', fontSize: 11, borderRadius: 6 }}>
          <Icon name="layers" size={13} />
        </div>
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{c.id}</span>{c.title}
          <ClusterStatusBadge status={c.status} />
        </div>
        <div className="row-meta">
          <span><strong style={{ color: 'var(--text-secondary)' }}>{c.vocCount}</strong> VOCs</span>
          <span className="dot" />
          <SeverityBadge severity={c.severity} />
          <ConfidenceBadge confidence={c.confidence} />
          <ManagedSystemPill id={c.managedSystem} />
          <span className="dot" />
          <span>{c.updatedAt}</span>
          {c.linkedFindingId && (<><span className="dot" /><span style={{ color: 'var(--color-neon-lime)' }}>↔ {c.linkedFindingId}</span></>)}
        </div>
      </div>
      <div className="row-trailing">
        {owner ? <Avatar user={owner} size="sm" /> : <span className="badge badge-blocked">No owner</span>}
      </div>
    </div>
  );
}

function ClusterDetailPanel({ c, onClose, onNavigate }) {
  const owner = c.owner ? window.userById(c.owner) : null;
  const finding = c.linkedFindingId ? window.findingById(c.linkedFindingId) : null;
  const scrollRef = useRef(null);
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'rationale', label: 'Why' },
    { id: 'execution', label: 'Execution' },
    { id: 'members', label: 'Members', count: c.vocCount },
    { id: 'properties', label: 'Properties' },
  ];

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="cluster" id={c.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Cluster" entityId={c.id}
          copyHash={`#route=voc-clusters&param=${c.id}`} />
      } />
      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />
      <div className="panel-scroll" ref={scrollRef}>
        <div data-anchor="overview">
          <PanelTitleBlock title={c.title}>
            <ClusterStatusBadge status={c.status} />
            <SeverityBadge severity={c.severity} />
            <ConfidenceBadge confidence={c.confidence} />
            <span className="text-xs muted">· {c.vocCount} VOCs · {c.updatedAt}</span>
          </PanelTitleBlock>
        </div>

        <div data-anchor="rationale" className="panel-section">
          <PanelSectionTitle>Why grouped</PanelSectionTitle>
          <NestedTextBlock padding={14}>{c.rationale}</NestedTextBlock>
          {c.status === 'suggested' && (
            <div style={{ marginTop: 12 }}>
              <Callout tone="amber">
                자동 클러스터링은 추천만 합니다. Admin 또는 같은 Managed System Developer 의 명시적 확정이 필요합니다.
              </Callout>
            </div>
          )}
        </div>

        <div data-anchor="execution" className="panel-section">
          <PanelSectionTitle>Execution</PanelSectionTitle>
          {finding ? (
            <div className="card-nested vstack" style={{ gap: 8 }}>
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="text-xs muted">Created finding</span>
                <FindingStatusBadge status={finding.status} />
              </div>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                <span className="row-id" style={{ marginRight: 6 }}>{finding.id}</span>
                {finding.title}
              </div>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('findings')}>
                <Icon name="arrowRight" size={11} />Open finding
              </Button>
            </div>
          ) : (
            <div className="hstack" style={{ gap: 8 }}>
              <Button variant="primary" size="md">
                <Icon name="finding" size={12} />Create finding from cluster
              </Button>
              <Button variant="secondary" size="md">Link existing finding</Button>
            </div>
          )}
        </div>

        <div data-anchor="members" className="panel-section">
          <PanelSectionTitle action={<button className="btn btn-subtle btn-sm">Bulk public update</button>}>
            Member VOCs · {c.vocCount}
          </PanelSectionTitle>
          <div className="vstack" style={{ gap: 6 }}>
            {c.sampleVocs.map(vocId => {
              const blocked = c.blockedVocs && c.blockedVocs[vocId];
              if (blocked) {
                return (
                  <div key={vocId}>
                    <PermissionBlockedPanel
                      state={blocked.state}
                      category={blocked.category}
                      reason={blocked.reason}
                      requiredScope={blocked.requiredScope}
                      summary={blocked.summary}
                    />
                  </div>
                );
              }
              const v = window.vocById(vocId);
              if (!v) {
                // Pack 10 — EntityRelationRow common shape for both
                // archived and active cluster members (HANDOFF §11).
                return (
                  <EntityRelationRow
                    key={vocId}
                    left={{ type: 'voc', id: vocId }}
                    title={vocId}
                    meta="아카이브된 VOC"
                  />
                );
              }
              return (
                <EntityRelationRow
                  key={v.id}
                  left={{ type: 'voc', id: v.id }}
                  title={v.title}
                  meta={<><span className="mono">{v.id}</span> · {v.severity} · {v.createdAt}</>}
                  trailing={<ReporterStatusBadge status={v.reporterStatus} />}
                  onClick={() => onNavigate('voc')}
                />
              );
            })}
            {c.vocCount > c.sampleVocs.length && (
              <button className="btn btn-subtle btn-sm" style={{ alignSelf: 'flex-start' }}>
                + {c.vocCount - c.sampleVocs.length}건 더 보기
              </button>
            )}
          </div>
        </div>

        <div data-anchor="properties" className="panel-section">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Managed System"><ManagedSystemPill id={c.managedSystem} /></FieldRow>
          <FieldRow label="Owner">
            {owner ? <UserChip user={owner} /> : <button className="btn btn-subtle btn-sm">Assign owner</button>}
          </FieldRow>
          <FieldRow label="Confirmed by">
            {c.status === 'confirmed' && owner ? (
              <UserChip user={owner} sub={c.updatedAt} />
            ) : <span className="muted">대기 중</span>}
          </FieldRow>
        </div>
      </div>
    </aside>
  );
}

function ClustersScreen({ scope, onNavigate }) {
  const filtered = Clusters.filter(c => scope.members.includes(c.managedSystem));
  const [activeTab, setActiveTab] = useState('all');
  const tabs = [
    { key: 'all', label: 'All', icon: 'layers', count: filtered.length },
    { key: 'confirmed', label: 'Confirmed', icon: 'check', count: filtered.filter(c => c.status === 'confirmed').length },
    { key: 'suggested', label: 'Suggested', icon: 'sparkles', count: filtered.filter(c => c.status === 'suggested').length },
    { key: 'unlinked', label: 'No finding', icon: 'link', count: filtered.filter(c => !c.linkedFindingId).length },
  ];
  const shown = useMemo(() => {
    if (activeTab === 'unlinked') return filtered.filter(c => !c.linkedFindingId);
    if (activeTab === 'all') return filtered;
    return filtered.filter(c => c.status === activeTab);
  }, [activeTab, filtered]);
  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(c => c.id === selectedId) : null;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Cluster 검색…" />
          <button className="btn btn-subtle btn-sm"><Icon name="sparkles" size={12} />Similarity 추천</button>
          <Button variant="primary" size="sm" icon="plus">New cluster</Button>
        </ListToolbar>
        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.map(c => (
            <ClusterRow key={c.id} c={c} selected={selected?.id === c.id} onSelect={(x) => setSelectedId(x.id)} />
          ))}
          {shown.length === 0 && (
            <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="layers" size={24} style={{ marginBottom: 12 }} />
              <div className="text-sm" style={{ marginBottom: 4 }}>이 필터에 해당하는 cluster가 없습니다</div>
              <div className="text-xs">Managed System scope을 변경하거나 새 cluster를 만들어보세요</div>
            </div>
          )}
        </div>
      </div>
      {selected && <ClusterDetailPanel c={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>
  );
}

Object.assign(window, { ClustersScreen });
