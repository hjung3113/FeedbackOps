// ============================================================
// FeedbackOps — Permission Requests
// Route: /admin/permissions/requests  →  internally `admin-permissions`
// ============================================================
// Spec sources:
//   - docs/design/09-permission-access.md
//   - docs/frontend/interaction-patterns.md  (Permission Request state machine)
//   - docs/frontend/ui-design-system.md      (PermissionBlockedPanel anatomy)
//
// State machine:
//   blocked → request_opened → pending
//                            → needs_more_info → pending
//                            → approved | rejected | expired | revoked
//
// Hard rules visible in UI:
//   - Sensitive permission requests require an admin-entered reason before
//     submitting decisions.
//   - Self-approval requires explicit scoped capability + visible audit.
//   - Approval must NOT auto-run the originally blocked action.
//   - Explicit deny overrides allow.

// ------------------------------------------------------------
// Mock data — extending the small set previously inline in AdminScreen.
// Each request carries the full review payload the Admin needs to decide.
// ------------------------------------------------------------
const PermissionRequests = [
  {
    id: 'PR-19',
    requester: 'u-5',
    requesterRole: 'Developer',
    requesterCurrentScope: ['looker'],
    capability: 'managed_system.developer',
    capabilityLabel: 'Developer access',
    requestedScope: ['powerbi'],
    targetObject: { type: 'voc',     id: 'VOC-2813', title: 'Power BI 임베디드 보고서가 SSO 세션 만료 시 401 에러를 던짐' },
    sourceAction:  { id: 'create_finding', label: 'Create Finding from VOC' },
    reason: 'Power BI 임베디드 SSO 재인증 작업 (FIN-181) 에 참여해야 합니다. Task-902 진행을 위해 임시 Developer 권한이 필요합니다.',
    risk: 'medium',
    expiration: '2026-06-30',
    status: 'pending',
    createdAt: '2시간 전',
    selfApproval: false,
    audit: [
      { who: 'u-5', what: '권한 요청 제출', when: '2시간 전', note: '블록된 액션 create_finding 에서 시작' },
    ],
  },
  {
    id: 'PR-18',
    requester: 'u-3',
    requesterRole: 'Developer',
    requesterCurrentScope: ['tableau'],
    capability: 'analytics_area.edit',
    capabilityLabel: 'Analytics Area 편집',
    requestedScope: ['looker'],
    targetObject: { type: 'area', id: 'marketing', title: 'Marketing Attribution (Looker)' },
    sourceAction:  { id: 'edit_area', label: 'Edit Analytics Area' },
    reason: 'Looker 의 marketing area 를 더 작은 단위로 분리하려고 합니다. 알림 모니터링 정리 작업의 일부입니다.',
    risk: 'low',
    expiration: '2026-07-15',
    status: 'pending',
    createdAt: '어제',
    selfApproval: false,
    audit: [
      { who: 'u-3', what: '권한 요청 제출', when: '어제', note: '' },
    ],
  },
  {
    id: 'PR-17',
    requester: 'u-4',
    requesterRole: 'Developer',
    requesterCurrentScope: ['powerbi'],
    capability: 'workspace.read',
    capabilityLabel: 'Workspace-wide read',
    requestedScope: ['*'],
    targetObject: null,
    sourceAction:  { id: 'global_report', label: 'Generate monthly report' },
    reason: '월간 리포트 작성을 위해 모든 Managed System 의 VOC 카운트가 필요합니다.',
    risk: 'high',
    expiration: '2026-06-01',
    status: 'rejected',
    createdAt: '2일 전',
    selfApproval: false,
    audit: [
      { who: 'u-4', what: '권한 요청 제출', when: '2일 전', note: '' },
      { who: 'u-1', what: 'rejected', when: '1일 전', note: 'workspace-wide 는 정기 리포트 용도가 아닙니다. 필요한 MS 개별 권한으로 요청해 주세요.' },
    ],
  },
  {
    id: 'PR-16',
    requester: 'u-2',
    requesterRole: 'Developer',
    requesterCurrentScope: ['tableau','powerbi'],
    capability: 'task.self_approve_request',
    capabilityLabel: 'Self-approval of own Task Request',
    requestedScope: ['powerbi'],
    targetObject: { type: 'request', id: 'REQ-44', title: 'Power BI 임베디드 SSO 재인증 핸들러 구현' },
    sourceAction:  { id: 'self_approve', label: 'Self-approve Task Request' },
    reason: '같은 Managed System scope 안에서 본인이 작성한 Task Request 를 빠르게 승인하려고 합니다.',
    risk: 'high',
    expiration: '2026-05-30',
    status: 'needs_more_info',
    createdAt: '3시간 전',
    selfApproval: true,
    auditQuestion: 'self-approval 은 audit 가시성이 높습니다. 어떤 정책 근거로 self-approve 가 필요한지, 검토 가능한 동료가 정말 없는지 알려주세요.',
    audit: [
      { who: 'u-2', what: '권한 요청 제출', when: '3시간 전', note: 'self-approval scoped capability' },
      { who: 'u-1', what: 'needs_more_info', when: '2시간 전', note: 'self-approval 정책 근거 필요' },
    ],
  },
  {
    id: 'PR-15',
    requester: 'u-6',
    requesterRole: 'User',
    requesterCurrentScope: ['tableau'],
    capability: 'voc.view_outside_scope',
    capabilityLabel: 'Out-of-scope VOC 열람',
    requestedScope: ['powerbi','looker'],
    targetObject: { type: 'voc', id: 'VOC-2808', title: '모바일 뷰에서 필터 패널이 잘림' },
    sourceAction:  { id: 'view_voc', label: 'View VOC outside scope' },
    reason: '연관 VOC 와 비교 검토 필요',
    risk: 'low',
    expiration: '2026-08-01',
    status: 'approved',
    createdAt: '3일 전',
    selfApproval: false,
    audit: [
      { who: 'u-6', what: '권한 요청 제출', when: '3일 전', note: '' },
      { who: 'u-1', what: 'approved', when: '2일 전', note: 'temporary read access — expires 2026-08-01' },
    ],
  },
];

const PERMISSION_STATUS_META = {
  pending:         { label: 'Pending',          color: 'var(--color-amber)',       bg: 'rgba(242,196,109,0.12)' },
  needs_more_info: { label: 'Needs more info',  color: 'var(--color-amber)',       bg: 'rgba(242,196,109,0.12)' },
  approved:        { label: 'Approved',         color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.12)' },
  rejected:        { label: 'Rejected',         color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)' },
  expired:         { label: 'Expired',          color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)' },
  revoked:         { label: 'Revoked',          color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)' },
};

function PermissionStatusBadge({ status }) {
  const m = PERMISSION_STATUS_META[status] || PERMISSION_STATUS_META.pending;
  return (
    <span className="badge" style={{ background: m.bg, color: m.color }}>
      <span className="badge-dot" />{m.label}
    </span>
  );
}

const RISK_META = {
  low:    { label: 'Low risk',    color: 'var(--text-muted)' },
  medium: { label: 'Medium risk', color: 'var(--color-amber)' },
  high:   { label: 'High risk',   color: 'var(--color-warning-red)' },
};

function RiskChip({ level }) {
  const m = RISK_META[level] || RISK_META.medium;
  return (
    <span className="badge" style={{
      background: 'transparent',
      boxShadow: `inset 0 0 0 1px ${m.color}40`,
      color: m.color,
    }}>
      <Icon name="alert" size={10} />{m.label}
    </span>
  );
}

// ============================================================
// State machine visualization — small inline strip
// ============================================================
const STATE_FLOW = [
  { key: 'request_opened',  label: 'Opened' },
  { key: 'pending',         label: 'Pending' },
  { key: 'needs_more_info', label: 'More info' },
  { key: 'decision',        label: 'Decision' },
];
function PermissionStateFlow({ status }) {
  const decisionDone = ['approved','rejected','expired','revoked'].includes(status);
  const currentIdx =
    status === 'pending' ? 1 :
    status === 'needs_more_info' ? 2 :
    decisionDone ? 3 : 0;
  return (
    <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
      {STATE_FLOW.map((s, i) => (
        <span key={s.key} className="hstack" style={{ gap: 6 }}>
          <span className="badge" style={{
            background: i <= currentIdx
              ? (i === currentIdx ? 'var(--color-pitch-black)' : 'transparent')
              : 'transparent',
            color: i <= currentIdx
              ? (s.key === 'decision'
                  ? (status === 'approved' ? 'var(--color-emerald)'
                    : status === 'rejected' ? 'var(--color-warning-red)'
                    : 'var(--text-muted)')
                  : 'var(--text-primary)')
              : 'var(--text-muted)',
            boxShadow: i === currentIdx
              ? 'inset 0 0 0 1px var(--color-neon-lime)'
              : 'var(--shadow-subtle)',
          }}>
            {i === currentIdx && <span className="badge-dot" />}
            {s.key === 'decision' && decisionDone ? PERMISSION_STATUS_META[status].label : s.label}
          </span>
          {i < STATE_FLOW.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// List row
// ============================================================
function PermissionRequestRow({ r, selected, onSelect }) {
  const u = window.userById(r.requester);
  return (
    <div
      className={`object-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(r)}>
      <Avatar user={u} size="sm" />
      <div className="row-body">
        <div className="row-title">
          <span className="row-id">{r.id}</span>
          <span style={{ fontWeight: 500 }}>{r.capabilityLabel}</span>
          <PermissionStatusBadge status={r.status} />
          {r.selfApproval && (
            <span className="badge" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--color-amethyst)' }}>
              <Icon name="shield" size={10} />Self-approval
            </span>
          )}
        </div>
        <div className="row-meta">
          <span>{u.name}</span>
          <span className="dot" />
          <span>scope <span className="mono" style={{ color: 'var(--text-secondary)' }}>
            {r.requestedScope.includes('*') ? 'workspace-wide' : r.requestedScope.join(', ')}
          </span></span>
          <span className="dot" />
          <RiskChip level={r.risk} />
          {r.targetObject && (
            <>
              <span className="dot" />
              <span className="hstack" style={{ gap: 4 }}>
                <EntityIconBadge type={r.targetObject.type === 'voc' ? 'voc'
                                    : r.targetObject.type === 'request' ? 'request'
                                    : 'evidence'} size={14} />
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>{r.targetObject.id}</span>
              </span>
            </>
          )}
          <span className="dot" />
          <span>{r.createdAt}</span>
        </div>
      </div>
      <div className="row-trailing">
        {r.status === 'pending' || r.status === 'needs_more_info' ? (
          <span className="badge" style={{ background: 'rgba(228,242,34,0.12)', color: 'var(--color-neon-lime)' }}>
            Action required
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Detail panel — full review surface
// ============================================================
function PermissionRequestPanel({ r, onClose, onNavigate }) {
  const u = window.userById(r.requester);
  const isDecidable = r.status === 'pending' || r.status === 'needs_more_info';
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  // pendingAction → 'approve' | 'reject' | 'needs_info' | 'deny'

  // Pack 8 — Self-approval audit capture.
  // Self-approval bypasses peer review, so audit must capture extra context:
  //   - Policy citation (which scoped capability authorises it)
  //   - "Why no peer reviewer is available" justification
  //   - Decision id + capture timestamp (server-issued)
  // These map to the backend `permission_decision_audit.self_approval_meta`
  // envelope. Stored alongside the regular audit log entry so reviewers
  // downstream can replay the context.
  const [selfApprovalCitation, setSelfApprovalCitation] = useState('');
  const [selfApprovalNoReviewer, setSelfApprovalNoReviewer] = useState('');
  const selfApprovalReady = !r.selfApproval || pendingAction !== 'approve' || (
    selfApprovalCitation.trim().length >= 8 && selfApprovalNoReviewer.trim().length >= 8
  );

  // Risk-driven reason requirement.
  const reasonRequired = r.risk === 'high' || r.selfApproval || pendingAction === 'reject' || pendingAction === 'deny';
  const canSubmit = (!reasonRequired || reason.trim().length >= 8) && selfApprovalReady;

  return (
    <aside className="detail-panel">
      <DetailPanelHeader kind="permission" id={r.id} onClose={onClose} extras={
        <DetailPanelHeaderActions entityKind="Permission request" entityId={r.id}
          copyHash={`#route=admin-permissions&param=${r.id}`} />
      } />

      <div className="panel-scroll">
        <PanelTitleBlock title={r.capabilityLabel}>
          <PermissionStatusBadge status={r.status} />
          <RiskChip level={r.risk} />
          {r.selfApproval && (
            <span className="badge" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--color-amethyst)' }}>
              <Icon name="shield" size={10} />Self-approval
            </span>
          )}
          <span className="text-xs muted">· {r.createdAt}</span>
        </PanelTitleBlock>

        {/* State machine strip */}
        <div className="panel-section">
          <PanelSectionTitle>Lifecycle</PanelSectionTitle>
          <PermissionStateFlow status={r.status} />
        </div>

        {/* Decision — primary action above the fold for decidable states */}
        {isDecidable && (
          <div className="panel-section">
            <PanelSectionTitle>Decision</PanelSectionTitle>
            <div className="card-nested vstack" style={{ gap: 10, padding: 14 }}>

              {/* Action picker */}
              <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPendingAction('approve')}
                  className={`btn btn-${pendingAction === 'approve' ? 'primary' : 'subtle'} btn-sm`}>
                  <Icon name="check" size={11} />Approve
                </button>
                <button
                  onClick={() => setPendingAction('needs_info')}
                  className={`btn btn-${pendingAction === 'needs_info' ? 'secondary' : 'subtle'} btn-sm`}>
                  <Icon name="alert" size={11} />Need more info
                </button>
                <button
                  onClick={() => setPendingAction('reject')}
                  className={`btn btn-${pendingAction === 'reject' ? 'secondary' : 'subtle'} btn-sm`}
                  style={{
                    color: pendingAction === 'reject' ? 'white' : 'var(--text-danger)',
                    background: pendingAction === 'reject' ? 'var(--color-warning-red)' : undefined,
                  }}>
                  <Icon name="close" size={11} />Reject
                </button>
                <button
                  onClick={() => setPendingAction('deny')}
                  className={`btn btn-${pendingAction === 'deny' ? 'secondary' : 'subtle'} btn-sm`}
                  style={{
                    color: pendingAction === 'deny' ? 'white' : 'var(--text-danger)',
                    background: pendingAction === 'deny' ? 'var(--color-warning-red)' : undefined,
                  }}>
                  <Icon name="shield" size={11} />Explicit deny
                </button>
              </div>

              {/* Reason field */}
              <div className="vstack" style={{ gap: 4 }}>
                <span className="text-xs muted">
                  Reason {reasonRequired && <span style={{ color: 'var(--color-warning-red)' }}>· 필수 (≥ 8자)</span>}
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    pendingAction === 'approve' ? '승인 근거 — 만료일 / 추가 조건 등' :
                    pendingAction === 'reject'  ? '거절 근거 — 정책 위반 / 더 좁은 scope 제안' :
                    pendingAction === 'deny'    ? '명시 거부 근거 — 향후 appeal 불가 / 정책상 허용 안 됨' :
                    pendingAction === 'needs_info' ? '필요한 추가 정보 — 정책 근거 / 사용 범위 / 만료일 등' :
                    '액션을 먼저 선택하세요…'
                  }
                  rows={3}
                  style={{
                    background: 'var(--surface-field)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)', borderRadius: 6,
                    padding: 10, fontSize: 'var(--text-sm)', resize: 'vertical',
                    fontFamily: 'inherit',
                  }} />
              </div>

              {/* Audit-context disclosure for sensitive paths */}
              {r.selfApproval && pendingAction === 'approve' && (
                <div style={{
                  padding: 12,
                  background: 'rgba(139,92,246,0.06)',
                  borderRadius: 6,
                  boxShadow: 'inset 0 0 0 1px rgba(139,92,246,0.28)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div className="hstack" style={{ gap: 8, alignItems: 'center' }}>
                    <Icon name="shield" size={12} style={{ color: 'var(--color-amethyst)' }} />
                    <span className="text-xs" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-amethyst)' }}>
                      Self-approval audit capture
                    </span>
                    <span className="badge" style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-amethyst)', fontSize: 10 }}>
                      <Icon name="alert" size={9} />SENSITIVE
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    이 결정은 <strong style={{ color: 'var(--text-primary)' }}>{u.name}</strong> 본인이 작성한 요청을 본인이 승인하는 self-approval 입니다.
                    감사 로그에 <span className="mono" style={{ color: 'var(--color-amethyst)' }}>SELF_APPROVAL</span> 라벨이 부여되고
                    다음 두 항목이 함께 캡처됩니다.
                  </span>

                  <div className="vstack" style={{ gap: 4 }}>
                    <span className="text-xs muted">
                      Policy citation <span style={{ color: 'var(--color-warning-red)' }}>· 필수 (≥ 8자)</span>
                    </span>
                    <input
                      value={selfApprovalCitation}
                      onChange={(e) => setSelfApprovalCitation(e.target.value)}
                      placeholder="예: task.self_approve_request scoped capability — workspace policy §4.3"
                      style={{
                        background: 'var(--surface-field)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)', borderRadius: 6,
                        padding: '8px 10px', fontSize: 'var(--text-sm)',
                        fontFamily: 'inherit', outline: 'none',
                      }} />
                  </div>

                  <div className="vstack" style={{ gap: 4 }}>
                    <span className="text-xs muted">
                      Peer reviewer 부재 사유 <span style={{ color: 'var(--color-warning-red)' }}>· 필수 (≥ 8자)</span>
                    </span>
                    <textarea
                      value={selfApprovalNoReviewer}
                      onChange={(e) => setSelfApprovalNoReviewer(e.target.value)}
                      placeholder="예: powerbi scope 의 다른 reviewer 모두 PTO. 정시 release 마감 때문에 대기 불가."
                      rows={2}
                      style={{
                        background: 'var(--surface-field)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)', borderRadius: 6,
                        padding: 10, fontSize: 'var(--text-sm)', resize: 'vertical',
                        fontFamily: 'inherit', outline: 'none',
                      }} />
                  </div>

                  {/* Captured fields preview — what lands in the audit log envelope. */}
                  <div className="vstack" style={{ gap: 6, padding: 10, borderRadius: 4, background: 'var(--color-pitch-black)' }}>
                    <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      감사 envelope 미리보기
                    </span>
                    <div className="mono text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <div>label: <span style={{ color: 'var(--color-amethyst)' }}>SELF_APPROVAL</span></div>
                      <div>decision_id: <span style={{ color: 'var(--text-primary)' }}>{`pd-${r.id.toLowerCase()}-${Date.now().toString(36).slice(-4)}`}</span></div>
                      <div>actor: <span style={{ color: 'var(--text-primary)' }}>u-1 (Admin)</span> · subject: <span style={{ color: 'var(--text-primary)' }}>{r.requester} ({r.requesterRole})</span></div>
                      <div>capability: <span style={{ color: 'var(--text-primary)' }}>{r.capability}</span></div>
                      <div>scope: <span style={{ color: 'var(--text-primary)' }}>{r.requestedScope.join(', ')}</span> · expires {r.expiration}</div>
                      <div>policy_citation: <span style={{ color: selfApprovalCitation ? 'var(--text-primary)' : 'var(--text-muted)' }}>{selfApprovalCitation || '— (필수)'}</span></div>
                      <div>no_peer_reviewer: <span style={{ color: selfApprovalNoReviewer ? 'var(--text-primary)' : 'var(--text-muted)' }}>{selfApprovalNoReviewer ? `"${selfApprovalNoReviewer.slice(0, 56)}${selfApprovalNoReviewer.length > 56 ? '…' : ''}"` : '— (필수)'}</span></div>
                    </div>
                  </div>

                  <span className="text-xs muted hstack" style={{ gap: 6 }}>
                    <Icon name="alert" size={10} />
                    이 envelope 는 Workspace Admin Audit · Compliance Export 에 모두 노출됩니다. 정책 근거가 모호하면 self-approval 대신 Need more info 로 변경하세요.
                  </span>
                </div>
              )}
              {pendingAction === 'deny' && (
                <Callout tone="red" icon="alert" title="Explicit deny">
                  명시 거부는 allow 정책을 override 합니다. 향후 동일 사용자의 요청은 policy 가 appeal
                  을 허용하지 않는 한 non-requestable 로 표시됩니다.
                </Callout>
              )}

              {/* Submit */}
              <Button variant="primary" disabled={!pendingAction || !canSubmit}>
                {pendingAction === 'approve' ? (r.selfApproval ? 'Self-approve 확정 · 감사 캡처' : '승인 확정') :
                 pendingAction === 'reject'  ? '거절 확정' :
                 pendingAction === 'deny'    ? '명시 거부 확정' :
                 pendingAction === 'needs_info' ? '추가 정보 요청' :
                 '액션을 선택하세요'}
              </Button>

              <div className="text-xs muted hstack" style={{ gap: 6 }}>
                <Icon name="alert" size={10} />
                승인은 차단된 액션을 자동으로 실행하지 않습니다. 요청자는 다시 동일 액션을 명시적으로 실행해야 합니다.
              </div>
            </div>
          </div>
        )}

        {/* Requester identity */}
        <div className="panel-section">
          <PanelSectionTitle>Requester</PanelSectionTitle>
          <div className="card-nested hstack" style={{ gap: 12, padding: 12 }}>
            <Avatar user={u} size="md" />
            <div className="vstack" style={{ gap: 2, flex: 1 }}>
              <div className="text-sm" style={{ fontWeight: 600 }}>{u.name}</div>
              <div className="text-xs muted">{r.requesterRole} · current scope <span className="mono" style={{ color: 'var(--text-secondary)' }}>{r.requesterCurrentScope.join(', ')}</span></div>
            </div>
            <Button variant="subtle" size="sm">Profile</Button>
          </div>
        </div>

        {/* What is being requested */}
        <div className="panel-section">
          <PanelSectionTitle>Requested capability</PanelSectionTitle>
          <FieldRow label="Capability">
            <span className="mono text-xs" style={{
              background: 'var(--color-pitch-black)', padding: '3px 8px',
              borderRadius: 4, color: 'var(--text-primary)',
            }}>{r.capability}</span>
          </FieldRow>
          <FieldRow label="Scope">
            {r.requestedScope.includes('*') ? (
              <span className="badge" style={{ background: 'rgba(235,87,87,0.12)', color: 'var(--color-warning-red)' }}>
                <Icon name="shield" size={10} />Workspace-wide
              </span>
            ) : (
              <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                {r.requestedScope.map(s => <ManagedSystemPill key={s} id={s} />)}
              </div>
            )}
          </FieldRow>
          <FieldRow label="Expires">
            <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{r.expiration}</span>
          </FieldRow>
          <FieldRow label="Source action">
            <div className="hstack" style={{ gap: 6 }}>
              <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{r.sourceAction.id}</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.sourceAction.label}</span>
            </div>
          </FieldRow>
        </div>

        {/* Source object — safe summary only */}
        {r.targetObject && (
          <div className="panel-section">
            <PanelSectionTitle action={
              <button className="btn btn-subtle btn-sm">
                <Icon name="arrowRight" size={11} />Open source
              </button>
            }>Blocked source</PanelSectionTitle>
            <div className="card-nested hstack" style={{ gap: 10, padding: 12 }}>
              <EntityIconBadge type={r.targetObject.type === 'voc' ? 'voc'
                                  : r.targetObject.type === 'request' ? 'request'
                                  : 'evidence'} size={22} />
              <div className="vstack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <div className="hstack" style={{ gap: 6 }}>
                  <span className="row-id">{r.targetObject.id}</span>
                  <OutlineBadge style={{ textTransform: 'capitalize' }}>{r.targetObject.type}</OutlineBadge>
                </div>
                <span className="text-sm" style={{
                  color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.targetObject.title}</span>
                <span className="text-xs muted">safe summary only — 차단된 객체의 raw 내용은 표시되지 않습니다.</span>
              </div>
            </div>
          </div>
        )}

        {/* Requester reason */}
        <div className="panel-section">
          <PanelSectionTitle>Reason given</PanelSectionTitle>
          <NestedTextBlock>{r.reason}</NestedTextBlock>
        </div>

        {/* Outstanding question on needs_more_info */}
        {r.status === 'needs_more_info' && r.auditQuestion && (
          <div className="panel-section">
            <Callout tone="amber" icon="alert" title="Outstanding question">
              {r.auditQuestion}
            </Callout>
          </div>
        )}

        {/* Audit log */}
        <div className="panel-section">
          <PanelSectionTitle action={r.selfApproval ? (
            <span className="badge" style={{ background: 'rgba(139,92,246,0.16)', color: 'var(--color-amethyst)' }}>
              <Icon name="shield" size={10} />SELF_APPROVAL · 고가시
            </span>
          ) : null}>Audit log</PanelSectionTitle>
          <div className="vstack" style={{ gap: 0 }}>
            {r.audit.map((a, i) => {
              const aw = window.userById(a.who);
              const isSelfApprovalEntry = r.selfApproval && /self-approval/i.test(a.note || '');
              return (
                <div key={i} className="hstack" style={{
                  gap: 10, padding: '10px 0',
                  borderBottom: i < r.audit.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <Avatar user={aw} size="sm" />
                  <div className="vstack" style={{ gap: 2, flex: 1 }}>
                    <span className="text-sm hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{aw.name}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>· {a.what}</span>
                      {isSelfApprovalEntry && (
                        <span className="badge" style={{ background: 'rgba(139,92,246,0.16)', color: 'var(--color-amethyst)', fontSize: 10 }}>
                          SELF_APPROVAL
                        </span>
                      )}
                    </span>
                    {a.note && <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{a.note}</span>}
                    <span className="text-xs muted">{a.when}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Policy notes */}
        <div className="panel-section">
          <PanelSectionTitle>Policy notes</PanelSectionTitle>
          <ul className="vstack" style={{ gap: 6, padding: 0, margin: 0, listStyle: 'none' }}>
            <li className="text-xs muted hstack" style={{ gap: 6 }}>
              <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
              승인은 차단된 액션을 자동 실행하지 않습니다 — 사용자가 다시 명시적으로 실행해야 합니다.
            </li>
            <li className="text-xs muted hstack" style={{ gap: 6 }}>
              <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
              Explicit deny 는 allow 정책을 override 합니다.
            </li>
            <li className="text-xs muted hstack" style={{ gap: 6 }}>
              <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
              Workspace Admin 도 anonymity threshold 등 정책상 우회 불가 항목은 우회할 수 없습니다.
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// Screen
// ============================================================
function PermissionRequestsScreen({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('pending');
  const tabs = [
    { key: 'pending',         label: 'Pending',         count: PermissionRequests.filter(r => r.status === 'pending').length, accent: true },
    { key: 'needs_more_info', label: 'Needs info',      count: PermissionRequests.filter(r => r.status === 'needs_more_info').length },
    { key: 'approved',        label: 'Approved',        count: PermissionRequests.filter(r => r.status === 'approved').length },
    { key: 'rejected',        label: 'Rejected',        count: PermissionRequests.filter(r => r.status === 'rejected').length },
    { key: 'all',             label: 'All',             count: PermissionRequests.length },
  ];
  const shown = activeTab === 'all' ? PermissionRequests : PermissionRequests.filter(r => r.status === activeTab);
  const [selectedId, setSelectedId] = useState(shown[0]?.id);
  const selected = selectedId ? shown.find(r => r.id === selectedId) : null;

  return (
    <>
      <div className="main-region">
        <ListToolbar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <SearchInput placeholder="Permission request 검색…" />
          <Button variant="subtle" size="sm">Policy reference</Button>
        </ListToolbar>

        <div className="hstack" style={{
          gap: 18, padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-canvas)', flexShrink: 0,
        }}>
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Awaiting decision</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-amber)' }}>
              {PermissionRequests.filter(r => r.status === 'pending' || r.status === 'needs_more_info').length}
            </span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>High risk</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-warning-red)' }}>
              {PermissionRequests.filter(r => r.risk === 'high' && (r.status === 'pending' || r.status === 'needs_more_info')).length}
            </span>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          <div className="vstack" style={{ gap: 2 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Self-approval</span>
            <span className="text-md tabular" style={{ fontWeight: 600, color: 'var(--color-amethyst)' }}>
              {PermissionRequests.filter(r => r.selfApproval).length}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span className="text-xs muted hstack" style={{ gap: 6 }}>
            <Icon name="shield" size={11} />
            승인은 차단 액션을 자동 실행하지 않습니다 — 사용자가 다시 실행해야 합니다.
          </span>
        </div>

        <div className="main-scroll" style={{ padding: 0 }}>
          {shown.length === 0 ? (
            <div className="text-sm muted" style={{ padding: 40, textAlign: 'center' }}>표시할 요청이 없습니다.</div>
          ) : (
            <div className="object-list">
              {shown.map(r => (
                <PermissionRequestRow key={r.id} r={r}
                  selected={selected?.id === r.id}
                  onSelect={(x) => setSelectedId(x.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selected && (
        <PermissionRequestPanel r={selected} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />
      )}
    </>
  );
}

Object.assign(window, {
  PermissionRequestsScreen,
  PermissionRequests,
  PermissionRequestRow,
  PermissionRequestPanel,
  PermissionStatusBadge,
});
