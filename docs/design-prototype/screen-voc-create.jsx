// ============================================================
// FeedbackOps — Create VOC + Triage Console
// ============================================================

// ---------------------------------------------------------------
// Create VOC
// ---------------------------------------------------------------
function CreateVocScreen({ onNavigate, scope }) {
  const me = window.userById('u-3');
  const [title, setTitle] = useState('Tableau 대시보드 로딩 시 사이드 메뉴가 사라지는 문제');
  const [body, setBody] = useState('재무 분석 워크북을 열면 좌측 사이드 메뉴가 일시적으로 사라집니다. 새로고침해야 다시 보입니다. Chrome 124, macOS 14에서 재현됩니다.');
  const [ms, setMs] = useState(scope.members[0] || 'tableau');
  const [area, setArea] = useState('finance');
  const [sourceContext, setSourceContext] = useState('Direct Use');
  const [proxyFor, setProxyFor] = useState('');
  const [observedSituation, setObservedSituation] = useState('');
  // Attachment state — for prototype, store File-like records {name, size, type}.
  // Production uploads to ADR-0011 storage and stores ids. 25MB per file limit.
  const [attachments, setAttachments] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const accepted = [];
    const rejected = [];
    files.forEach(f => {
      if (f.size > MAX_FILE_SIZE) rejected.push({ name: f.name, reason: '용량 25MB 초과' });
      else accepted.push({ name: f.name, size: f.size, type: f.type, id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}` });
    });
    if (accepted.length) setAttachments(prev => [...prev, ...accepted]);
    if (rejected.length) console.warn('첨부 거부:', rejected);
  };

  const areas = window.AnalyticsAreas.filter(a => a.managedSystem === ms);
  const similar = window.Vocs.filter(v => v.managedSystem === ms).slice(0, 3);
  const isValid = title.trim() && body.trim() && ms;

  return (
    <PageShell
      back={
        <PageShellBackButton onClick={() => onNavigate('voc')}>Inbox</PageShellBackButton>
      }
      eyebrow={
        <span className="badge" style={{ background: 'rgba(94,106,210,0.15)', color: 'var(--color-aether-blue)' }}>
          <span className="badge-dot" />New VOC
        </span>
      }
      title="VOC 작성">

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 28 }}>
          {/* ---- Main form (single compact card) ---- */}
          <section className="card" style={{ padding: 20 }}>
            {/* Title */}
            <div className="form-block">
              <FieldLabel required>제목</FieldLabel>
              <input className="input"
                style={{ height: 36, width: '100%', fontSize: 'var(--text-md)' }}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="간단히 어떤 문제 / 요청인가요?" />
            </div>

            <FormDivider />

            {/* Body */}
            <div className="form-block">
              <FieldLabel required tip="언제·어디서·어떤 상황에서 발생했는지, 재현 방법과 기대 동작을 적어주세요. 마크다운은 필요 없습니다 — 인라인 이미지·파일은 첨부로 저장됩니다.">
                {sourceContext === 'Proxy Report' ? '관찰한 상황' : '상세 설명'}
              </FieldLabel>
              <RichEditor
                surface="voc-description"
                defaultValue={body}
                onChange={(html) => {
                  // Strip tags for the simple validation in this form
                  const text = html.replace(/<[^>]*>/g, '').trim();
                  setBody(text);
                }}
                placeholder={sourceContext === 'Proxy Report'
                  ? '관찰한 상황을 사실 위주로 적어주세요.'
                  : '재현 방법과 기대 동작도 함께 적어주세요.'}
                minHeight={140}
              />
            </div>

            <FormDivider />

            {/* Source context — segmented inline */}
            <div className="form-block">
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <FieldLabel tip="기본은 Direct Use. 다른 팀원·고객사 경험을 대신 등록할 때는 Proxy Report.">Source</FieldLabel>
              </div>
              <div className="segmented">
                <button className={`segmented-item ${sourceContext === 'Direct Use' ? 'active' : ''}`} onClick={() => setSourceContext('Direct Use')}>
                  <Icon name="user" size={11} />직접 사용
                </button>
                <button className={`segmented-item ${sourceContext === 'Proxy Report' ? 'active' : ''}`} onClick={() => setSourceContext('Proxy Report')}>
                  <Icon name="megaphone" size={11} />대신 보고
                </button>
              </div>
              {sourceContext === 'Proxy Report' && (
                <div className="grid-2" style={{ marginTop: 10, gap: 8 }}>
                  <input className="input" style={{ height: 32, width: '100%' }}
                    value={proxyFor} onChange={e => setProxyFor(e.target.value)}
                    placeholder="누구·어느 팀을 대신해?" />
                  <input className="input" style={{ height: 32, width: '100%' }}
                    value={observedSituation} onChange={e => setObservedSituation(e.target.value)}
                    placeholder="관찰한 핵심 상황 한 줄" />
                </div>
              )}
            </div>

            <FormDivider />

            {/* Routing: MS + Area in one row */}
            <div className="form-block">
              <FieldLabel required tip="제출 후 변경할 수 없습니다. 어느 시스템에 대한 VOC인지 정확히 골라주세요.">Managed System</FieldLabel>
              <div className="hstack gap-4" style={{ flexWrap: 'wrap' }}>
                {window.ManagedSystems.map(m => (
                  <button key={m.id} className="ms-chip" data-active={ms === m.id}
                    onClick={() => { setMs(m.id); setArea(null); }}>
                    <div className="scope-mark" style={{ width: 16, height: 16, background: m.color, fontSize: 8 }}>{m.mark}</div>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-block" style={{ marginTop: 14 }}>
              <FieldLabel tip="선택사항. 선택한 Managed System 안의 분석 영역만 고를 수 있어요. 권한 경계가 아니라 분류·기본값 용도입니다.">Analytics Area</FieldLabel>
              <div className="hstack gap-4" style={{ flexWrap: 'wrap' }}>
                <button className="ms-chip" data-active={!area} onClick={() => setArea(null)}>
                  <span className="muted">없음</span>
                </button>
                {areas.map(a => (
                  <button key={a.id} className="ms-chip" data-active={area === a.id} onClick={() => setArea(a.id)}>
                    {a.name}
                  </button>
                ))}
                {areas.length === 0 && <span className="text-xs muted">등록된 Area 없음</span>}
              </div>
            </div>

            <FormDivider />

            {/* Attachments — dropzone + file list. Spec ADR-0011 (storage). */}
            <div className="form-block">
              <FieldLabel tip="최대 25MB. 큰 스프레드시트는 본문이 아니라 파일 첨부로 저장됩니다.">첨부</FieldLabel>
              <label
                className="dropzone-compact"
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); e.dataTransfer.dropEffect = 'copy'; }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  border: `1px dashed ${dragOver ? 'var(--color-neon-lime)' : 'var(--border-subtle)'}`,
                  background: dragOver ? 'rgba(20, 40, 160,0.06)' : 'transparent',
                  borderRadius: 6,
                  transition: 'background 100ms ease, border-color 100ms ease',
                }}>
                <Icon name="attach" size={13} style={{ color: dragOver ? 'var(--color-neon-lime)' : 'var(--text-muted)' }} />
                <span className="text-sm">파일을 드래그하거나 클릭해서 추가</span>
                <span style={{ flex: 1 }} />
                <span className="text-xs muted">최대 25MB · 다중 선택</span>
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
              </label>

              {attachments.length > 0 && (
                <div className="vstack" style={{ gap: 6, marginTop: 10 }}>
                  {attachments.map(a => (
                    <AttachmentRow
                      key={a.id}
                      file={a}
                      onRemove={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} />
                  ))}
                  <div className="text-xs muted" style={{ marginTop: 4 }}>
                    {attachments.length}개 첨부 · 총 {formatFileSize(attachments.reduce((s, a) => s + a.size, 0))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ---- Compact sidebar ---- */}
          <aside className="vstack" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="text-xs muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Reporter
              </div>
              <div className="hstack" style={{ gap: 8 }}>
                <Avatar user={me} size="md" />
                <div className="vstack" style={{ gap: 1 }}>
                  <span className="text-sm" style={{ fontWeight: 500 }}>{me.name}</span>
                  <span className="text-xs muted">Role: User</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  유사 VOC
                </span>
                <span className="text-xs muted">{similar.length}건</span>
              </div>
              <div className="vstack" style={{ gap: 4 }}>
                {similar.slice(0, 3).map(v => (
                  <div key={v.id} className="similar-mini">
                    <span className="similar-mini-title">{v.title}</span>
                    <span className="similar-mini-meta">{v.id} · {v.createdAt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 14, background: 'rgba(94,106,210,0.04)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <Icon name="shield" size={11} style={{ marginRight: 5, verticalAlign: '-1px', color: 'var(--color-aether-blue)' }} />
                Severity는 Reporter가 정하지 않습니다. 담당자가 triage 단계에서 결정합니다.
              </div>
            </div>
          </aside>
        </div>

        {/* Compact bottom action bar */}
        <div className="create-action-bar">
          <span className="text-xs muted">
            제출 후 Managed System은 변경 불가
          </span>
          <div style={{ flex: 1 }} />
          <Button variant="subtle" size="md" onClick={() => onNavigate('voc')}>취소</Button>
          <Button variant="secondary" size="md">초안 저장</Button>
          <Button variant="primary" size="md" disabled={!isValid} className={!isValid ? 'btn-disabled' : ''}>
            <Icon name="check" size={12} />VOC 제출
          </Button>
        </div>
    </PageShell>
  );
}

// Compact form helpers
function FieldLabel({ required, tip, children }) {
  return (
    <label className="field-label-compact">
      <span>{children}</span>
      {required && <span className="field-required">*</span>}
      {tip && <HelpTip text={tip} />}
    </label>
  );
}

function FormDivider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '14px 0' }} />;
}

// File-type icon mapping for attachment rows. The Icon set only has a few
// glyphs so we collapse types into rough buckets.
function fileKind(file) {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|svg)$/.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|mov|webm|avi)$/.test(n)) return 'video';
  if (/\.(pdf|doc|docx|xls|xlsx|csv|md|txt|json|log)$/.test(n)) return 'doc';
  return 'doc';
}
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function AttachmentRow({ file, onRemove }) {
  const kind = fileKind(file);
  const icon = kind === 'image' ? 'image' : kind === 'video' ? 'survey' : 'doc';
  const isOversize = file.size > 25 * 1024 * 1024;
  return (
    <div className="hstack" style={{
      gap: 10,
      padding: '8px 10px',
      background: 'var(--surface-card)',
      borderRadius: 6,
      boxShadow: 'var(--shadow-subtle)',
      alignItems: 'center',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 5,
        background: 'var(--color-deep-slate)',
        color: kind === 'image' ? 'var(--color-cyan-spark)' : 'var(--text-secondary)',
        display: 'grid', placeItems: 'center',
        flexShrink: 0,
      }}>
        <Icon name={icon} size={12} />
      </div>
      <div className="vstack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
        <span className="text-sm" style={{
          fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{file.name}</span>
        <span className="text-xs muted">
          {formatFileSize(file.size)}
          {isOversize && <span style={{ color: 'var(--text-danger)', marginLeft: 6 }}>· 용량 초과</span>}
          {!isOversize && <span style={{ marginLeft: 6 }}>· 업로드 대기</span>}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="btn btn-ghost btn-sm"
        title="첨부 제거">
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}

function SourceContextRadio({ value, onChange, options }) {
  return (
    <div className="vstack" style={{ gap: 8 }}>
      {options.map(o => (
        <button key={o.value}
          className="source-radio"
          data-active={value === o.value}
          onClick={() => onChange(o.value)}>
          <div className={`source-radio-dot ${value === o.value ? 'on' : ''}`} />
          <div className="vstack" style={{ gap: 2, alignItems: 'flex-start' }}>
            <span className="text-sm" style={{ fontWeight: 500 }}>{o.label}</span>
            <span className="text-xs muted">{o.sub}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function FormRow({ label, required, hint, children }) {
  return (
    <div className="vstack" style={{ gap: 6 }}>
      <div className="form-field-label" style={{ marginBottom: 0 }}>
        {label}{required && <span style={{ color: 'var(--color-warning-red)' }}> *</span>}
      </div>
      {hint && <div className="text-xs muted" style={{ lineHeight: 1.5 }}>{hint}</div>}
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------
// Triage Console
// ---------------------------------------------------------------
function TriageQueueRow({ voc, selected, onSelect }) {
  const reporter = window.userById(voc.reporter);
  const ms = window.msById(voc.managedSystem);
  return (
    <div className={`object-row expanded ${selected ? 'selected' : ''}`} onClick={() => onSelect(voc)}>
      <div className="hstack gap-12">
        <SeverityIndicator severity={voc.severity} />
      </div>
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{voc.id}</span>{voc.title}
        </div>
        <div className="row-meta">
          <ReporterStatusBadge status={voc.reporterStatus} />
          <span className="dot" />
          <span>by {reporter.name}</span>
          <span className="dot" />
          <span style={{ color: 'var(--text-secondary)' }}>{ms?.name}</span>
          {!voc.analyticsArea && <><span className="dot" /><span style={{ color: 'var(--color-amber)' }}>Area 미지정</span></>}
          {!voc.owner && <><span className="dot" /><span style={{ color: 'var(--color-warning-red)' }}>Owner 없음</span></>}
          {voc.similarCount > 0 && <><span className="dot" /><span style={{ color: 'var(--color-aether-blue)' }}>↔ similar {voc.similarCount}</span></>}
        </div>
      </div>
      <div className="row-trailing">
        <span className="text-xs muted">{voc.createdAt}</span>
      </div>
    </div>
  );
}

function TriagePanel({ voc, onAct }) {
  const reporter = window.userById(voc.reporter);
  const [severity, setSeverity] = useState(voc.severity);
  const [owner, setOwner] = useState(voc.owner);
  const [area, setArea] = useState(voc.analyticsArea);
  const [clusterAction, setClusterAction] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setSeverity(voc.severity);
    setOwner(voc.owner);
    setArea(voc.analyticsArea);
    setClusterAction(null);
  }, [voc.id]);

  const areas = window.AnalyticsAreas.filter(a => a.managedSystem === voc.managedSystem);
  const teamCandidates = window.Users.slice(0, 5);
  const dirty = severity !== voc.severity || owner !== voc.owner || area !== voc.analyticsArea;
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'body', label: 'Body' },
    { id: 'severity', label: 'Severity' },
    { id: 'owner', label: 'Owner' },
    { id: 'area', label: 'Area' },
    voc.similarCount > 0 && { id: 'cluster', label: 'Cluster', count: voc.similarCount },
    { id: 'summary', label: 'Summary' },
  ].filter(Boolean);

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="triage" id={voc.id} extras={<>
        <Button variant="ghost" size="sm" icon="expand" />
        <Button variant="ghost" size="sm" icon="more" />
      </>} />

      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />

      <div className="panel-scroll" ref={scrollRef}>
        <div data-anchor="overview">
          <PanelTitleBlock title={voc.title}>
            <ReporterStatusBadge status={voc.reporterStatus} />
            <span className="text-xs muted">· {reporter.name} · {voc.createdAt}</span>
          </PanelTitleBlock>
        </div>

        {/* Body preview */}
        <div data-anchor="body" className="panel-section">
          <PanelSectionTitle>Body</PanelSectionTitle>
          <NestedTextBlock padding={14}>{voc.description}</NestedTextBlock>
        </div>

        {/* Severity selector */}
        <div data-anchor="severity" className="panel-section">
          <PanelSectionTitle>Severity 결정</PanelSectionTitle>
          <div className="severity-grid">
            {['low', 'medium', 'high', 'critical'].map(s => {
              const tip = {
                low: '관찰만 · 운영 영향 없음',
                medium: '주기적 발생 · 사용성 저하',
                high: '주요 흐름 차단 · 빠른 대응 필요',
                critical: '서비스 영향 · 즉시 대응',
              }[s];
              return (
                <button key={s} className="severity-pick" data-active={severity === s} data-sev={s} onClick={() => setSeverity(s)}>
                  <span className={`severity-pick-bar severity-${s}`} />
                  <span className="severity-pick-label">{s}</span>
                  <HelpTip text={tip} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Assign owner */}
        <div data-anchor="owner" className="panel-section">
          <PanelSectionTitle>Owner 배정</PanelSectionTitle>
          <div className="vstack" style={{ gap: 6 }}>
            {teamCandidates.map(u => (
              <button key={u.id}
                className="entity-node"
                data-active={owner === u.id}
                onClick={() => setOwner(u.id)}
                style={owner === u.id ? { background: 'rgba(20, 40, 160,0.06)', boxShadow: 'rgba(20, 40, 160,0.4) 0px 0px 0px 1px inset' } : {}}>
                <Avatar user={u} size="sm" />
                <div className="entity-node-body">
                  <div className="entity-node-title">{u.name}</div>
                  <div className="entity-node-meta">
                    {u.id === 'u-1' && '담당 시스템: Tableau Revenue · 대기 4건'}
                    {u.id === 'u-2' && '담당 시스템: Tableau Admin · 대기 2건'}
                    {u.id === 'u-3' && '담당 시스템: Tableau Finance · 대기 1건'}
                    {u.id === 'u-4' && '담당 시스템: Power BI · 대기 5건'}
                    {u.id === 'u-5' && '담당 시스템: Looker · 대기 2건'}
                  </div>
                </div>
                {owner === u.id && <Icon name="check" size={12} style={{ color: 'var(--color-neon-lime)' }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Analytics area */}
        <div data-anchor="area" className="panel-section">
          <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="ms-chip" data-active={!area} onClick={() => setArea(null)}>
              <span className="muted">없음</span>
            </button>
            {areas.map(a => (
              <button key={a.id} className="ms-chip" data-active={area === a.id} onClick={() => setArea(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          <div className="text-xs muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            <Icon name="alert" size={10} style={{ color: 'var(--color-amber)', marginRight: 4 }} />
            Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
          </div>
        </div>

        {/* Cluster suggestion */}
        {voc.similarCount > 0 && (
          <div data-anchor="cluster" className="panel-section">
            <PanelSectionTitle action={
              <span className="badge" style={{ background: 'rgba(94,106,210,0.12)', color: 'var(--color-aether-blue)' }}>
                <Icon name="sparkles" size={9} />Similarity {voc.similarCount}
              </span>
            }>
              Cluster 추천
            </PanelSectionTitle>
            <div className="card-nested vstack" style={{ gap: 10 }}>
              <div className="text-sm">
                유사한 VOC <strong>{voc.similarCount}</strong>건이 발견됐어요. 자동 클러스터링은 추천만 합니다 — 확정이 필요합니다.
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <button
                  className={`btn btn-${clusterAction === 'confirm' ? 'primary' : 'secondary'} btn-sm`}
                  onClick={() => setClusterAction('confirm')}>
                  <Icon name="check" size={11} />Cluster 확정
                </button>
                <button
                  className={`btn btn-${clusterAction === 'dismiss' ? 'primary' : 'subtle'} btn-sm`}
                  onClick={() => setClusterAction('dismiss')}>
                  추천 무시
                </button>
                <button className="btn btn-subtle btn-sm">유사 VOC 보기</button>
              </div>
            </div>
          </div>
        )}

        {/* Decision summary */}
        <div data-anchor="summary" className="panel-section">
          <PanelSectionTitle>Triage 결과 미리보기</PanelSectionTitle>
          <div className="card-nested vstack" style={{ gap: 10 }}>
            <FieldRow label="Severity">
              {severity ? <SeverityBadge severity={severity} /> : <span className="muted">미지정</span>}
            </FieldRow>
            <FieldRow label="Owner">
              {owner ? <UserChip user={window.userById(owner)} /> : <span className="muted">미지정</span>}
            </FieldRow>
            <FieldRow label="Analytics Area">
              {area ? window.areaById(area).name : <span className="muted">없음</span>}
            </FieldRow>
            <FieldRow label="Cluster">
              {clusterAction === 'confirm' && <span className="badge" style={{ background: 'rgba(94,106,210,0.12)', color: 'var(--color-aether-blue)' }}>새 cluster 생성</span>}
              {clusterAction === 'dismiss' && <span className="muted">추천 무시</span>}
              {!clusterAction && <span className="muted">미결정</span>}
            </FieldRow>
            <FieldRow label="Reporter status 변경">
              <span className="hstack" style={{ gap: 6 }}>
                <ReporterStatusBadge status={voc.reporterStatus} />
                <Icon name="arrowRight" size={10} className="muted" />
                <ReporterStatusBadge status={owner ? 'assigned' : 'reviewing'} />
              </span>
            </FieldRow>
          </div>
        </div>
      </div>

      <div className="panel-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Button variant="primary" disabled={!dirty} className={`btn-block ${!dirty ? 'btn-disabled' : ''}`} onClick={() => onAct('confirm')}>
          <Icon name="check" size={12} />Triage 확정 & 다음 VOC
        </Button>
        <div className="hstack" style={{ gap: 8 }}>
          <Button variant="secondary" size="md" style={{ flex: 1 }} onClick={() => onAct('finding')}>
            <Icon name="finding" size={11} />Finding 만들기
          </Button>
          <Button variant="subtle" size="md" style={{ flex: 1 }} onClick={() => onAct('skip')}>
            <Icon name="chevronRight" size={11} />보류
          </Button>
        </div>
      </div>
    </aside>
  );
}

function TriageScreen({ scope, onNavigate }) {
  const filtered = window.Vocs.filter(v => scope.members.includes(v.managedSystem));
  const queue = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      const aUn = a.owner ? 1 : 0;
      const bUn = b.owner ? 1 : 0;
      if (aUn !== bUn) return aUn - bUn;
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });
  }, [filtered]);

  const [selectedId, setSelectedId] = useState(queue[0]?.id);
  // Optimistic mutation state — track which VOCs have been triaged in this
  // session. Removed from the live queue immediately; backend confirmation
  // is faked with a 600ms latency. Production POSTs /vocs/:id/triage and
  // rolls back on error. Spec: docs/design/04-voc-system.md §Triage.
  const [triagedIds, setTriagedIds] = useState({}); // id → { kind, at }
  const [toast, setToast] = useState(null);         // { vocId, kind, undoUntil }

  const liveQueue = useMemo(() => queue.filter(v => !triagedIds[v.id]), [queue, triagedIds]);
  const selected = liveQueue.find(v => v.id === selectedId) || liveQueue[0];

  const handleAct = (kind) => {
    if (!selected) return;
    const actingOn = selected.id;
    // Move to next item BEFORE marking, so we don't briefly land on a
    // disappearing row.
    const idx = liveQueue.findIndex(v => v.id === actingOn);
    const next = liveQueue[idx + 1] || liveQueue.filter(v => v.id !== actingOn)[0];
    if (next) setSelectedId(next.id);
    // Apply optimistic mutation
    setTriagedIds(prev => ({ ...prev, [actingOn]: { kind, at: Date.now() } }));
    setToast({ vocId: actingOn, kind, undoUntil: Date.now() + 4000 });
    setTimeout(() => {
      // Clear toast if still showing for this action
      setToast(prev => (prev && prev.vocId === actingOn ? null : prev));
    }, 4000);
    if (kind === 'finding') {
      // Brief delay so user sees the toast before navigating
      setTimeout(() => onNavigate('findings'), 240);
    }
  };

  const undoLast = () => {
    if (!toast) return;
    setTriagedIds(prev => {
      const next = { ...prev };
      delete next[toast.vocId];
      return next;
    });
    setSelectedId(toast.vocId);
    setToast(null);
  };

  return (
    <>
      <WorkbenchShell
        toolbar={
          <>
            <ShellTitle icon="flag" iconColor="var(--color-amber)" title="Triage queue">
            <OutlineBadge>{liveQueue.length} VOC</OutlineBadge>
            <span className="text-xs muted">정렬: 미배정 → severity</span>
            {Object.keys(triagedIds).length > 0 && (
              <span className="text-xs" style={{ color: 'var(--color-emerald)' }}>
                · {Object.keys(triagedIds).length}건 처리됨
              </span>
            )}
            </ShellTitle>
            <div className="toolbar-spacer" />
            <SearchInput placeholder="VOC 검색…" />
            <button className="btn btn-subtle btn-sm"><Icon name="filter" size={12} />Filter</button>
            <Button variant="secondary" size="sm">Skip to unassigned</Button>
          </>
        }
        bodyClassName="workbench-body-scroll"
        detail={selected && <TriagePanel voc={selected} onAct={handleAct} />}>
          {/* Permission-limited peek — when the backend signals that some
              VOCs in the actor's effective scope union were filtered out
              of this triage view (e.g. high-severity in a restricted MS),
              show a summary-visible peek so the actor knows they exist
              without leaking content. (docs/frontend/interaction-patterns.md
              §Permission-Limited Linked Objects) */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <PermissionBlockedPanel
              state="summary_visible"
              category="Out-of-scope VOCs · summary peek"
              summary={
                <div className="vstack" style={{ gap: 4 }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Triage 큐에 보이지 않는 <strong style={{ color: 'var(--color-aether-blue)' }}>2건</strong> 의 untriaged VOC 가 있습니다.
                  </span>
                  <span className="text-xs muted">
                    Managed System 권한 밖이며, severity 분포만 노출됩니다 · high · critical
                  </span>
                </div>
              }
            />
          </div>
          {liveQueue.map(v => (
            <TriageQueueRow key={v.id} voc={v} selected={selected?.id === v.id} onSelect={(x) => setSelectedId(x.id)} />
          ))}
          {liveQueue.length === 0 && (
            <div className="vstack" style={{ padding: 48, alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <Icon name="check" size={24} style={{ color: 'var(--color-emerald)' }} />
              <strong className="text-md">큐가 비었습니다</strong>
              <span className="text-xs muted">모든 VOC를 triage 처리했습니다. 새 VOC가 들어오면 자동으로 추가됩니다.</span>
            </div>
          )}
      </WorkbenchShell>
      {toast && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          background: 'var(--surface-popover)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'cmdk-rise 140ms ease-out',
          minWidth: 360,
        }}>
          <Icon name="check" size={13} style={{ color: 'var(--color-emerald)' }} />
          <span className="text-sm" style={{ flex: 1 }}>
            <strong className="mono">{toast.vocId}</strong>
            <span className="muted" style={{ marginLeft: 8 }}>
              {toast.kind === 'confirm'
                ? 'Triage 확정됨'
                : toast.kind === 'finding'
                  ? 'Finding 만들기로 이동'
                  : '보류 처리됨'}
            </span>
          </span>
          <Button variant="subtle" size="sm" onClick={undoLast}>실행 취소</Button>
        </div>
      )}
    </>
  );
}

Object.assign(window, { CreateVocScreen, TriageScreen });
