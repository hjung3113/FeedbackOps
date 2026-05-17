// ============================================================
// FeedbackOps — Admin · Workspace Settings
// Route: /admin/settings  →  internally `admin-settings`
// ============================================================
// Workspace-level policy toggles. Form-first surface per
// routes-and-layout.md §Layout patterns. Controlled inputs + dirty
// save bar (mock — values reset on reload).
//
// Pack 8 — Cross-MS policy retro warning.
// Policy changes (cross-MS linking, self-approval) don't retroactively
// detach existing links or revoke past self-approvals. The retro panel
// makes that explicit before save so Admin doesn't expect cleanup the
// system won't do.

const SETTING_DEFAULTS = {
  selfApproval: 'capability-gated',
  crossMsLinking: 'blocked',
  appealWindow: 0,
  anonymityThreshold: 5,
  surveyResponseToVoc: 'forbidden', // locked, read-only
  developerDefaultScope: 'assigned',
  workspaceWideAll: 'admin-only',
};

const SETTING_OPTIONS = {
  selfApproval: [
    { value: 'capability-gated', label: 'Capability-gated', tone: 'amber' },
    { value: 'allowed',          label: 'Allowed',           tone: 'default' },
    { value: 'forbidden',        label: 'Forbidden',         tone: 'red' },
  ],
  crossMsLinking: [
    { value: 'blocked',         label: 'Blocked (request only)', tone: 'default' },
    { value: 'allowed',         label: 'Allowed with audit',     tone: 'default' },
    { value: 'forbidden',       label: 'Forbidden',              tone: 'red' },
  ],
  developerDefaultScope: [
    { value: 'assigned', label: 'Assigned systems only', tone: 'default' },
    { value: 'all',      label: 'All Managed Systems',   tone: 'default' },
  ],
  workspaceWideAll: [
    { value: 'admin-only', label: 'Admin only',     tone: 'default' },
    { value: 'all-roles',  label: 'All roles',      tone: 'amber' },
  ],
};

const SETTINGS_LABEL = {
  selfApproval: 'Self-approval',
  crossMsLinking: 'Cross-MS linking',
  appealWindow: 'Appeal window',
  anonymityThreshold: 'Anonymity threshold',
  developerDefaultScope: 'Developer scope',
  workspaceWideAll: 'all = workspace',
};

// Pack 8 — mock affected-population for retro warnings.
// Wired off backend impact_preview endpoint in production. Numbers reflect
// `entity_links`, `permission_grants`, `permission_requests` that would
// be affected by the new policy — non-retroactive, so existing rows stay.
const POLICY_IMPACT_MOCK = {
  crossMsLinking: {
    existingCrossMsLinks: 7,
    activeMultiMsGrants: 3,
    pendingMultiMsRequests: 2,
  },
  selfApproval: {
    historicalSelfApprovals: 14,
    activeCapabilityGrants: 4,
    pendingRequests: 1,
  },
};

// Retro tone matrix per (saved → next) transition. Returns one of:
//   - 'tighten'  : new value is stricter; existing rows grandfathered.
//   - 'loosen'   : new value is more permissive; backlog may unlock.
//   - 'neutral'  : same family of behaviour, mostly informational.
function classifyPolicyTransition(key, saved, next) {
  if (saved === next) return null;
  if (key === 'crossMsLinking') {
    const rank = { allowed: 0, blocked: 1, forbidden: 2 };
    if (rank[next] > rank[saved]) return 'tighten';
    if (rank[next] < rank[saved]) return 'loosen';
  }
  if (key === 'selfApproval') {
    const rank = { allowed: 0, 'capability-gated': 1, forbidden: 2 };
    if (rank[next] > rank[saved]) return 'tighten';
    if (rank[next] < rank[saved]) return 'loosen';
  }
  return 'neutral';
}

function PolicyRetroWarning({ k, saved, next }) {
  const direction = classifyPolicyTransition(k, saved, next);
  if (!direction) return null;
  const impact = POLICY_IMPACT_MOCK[k];
  if (!impact) return null;

  const heading = direction === 'tighten' ? 'Retro 영향: 기존 데이터는 그대로 유지됩니다'
                : direction === 'loosen'  ? 'Retro 영향: 백로그 일부가 자동 해제될 수 있습니다'
                : 'Retro 영향 검토';
  const tone = direction === 'tighten' ? 'amber' : direction === 'loosen' ? 'cyan' : 'blue';
  const TONE = tone === 'amber'
    ? { bg: 'rgba(242,196,109,0.08)', ring: 'rgba(242,196,109,0.32)', color: 'var(--color-amber)' }
    : tone === 'cyan'
    ? { bg: 'rgba(2,184,204,0.06)',   ring: 'rgba(2,184,204,0.3)',    color: 'var(--color-cyan-spark)' }
    : { bg: 'rgba(94,106,210,0.06)',  ring: 'rgba(94,106,210,0.3)',   color: 'var(--color-aether-blue)' };

  // Wording is policy-aware. Each line states (a) the number, (b) what
  // happens to that population, (c) when the change takes effect.
  const lines = (() => {
    if (k === 'crossMsLinking' && direction === 'tighten') {
      return [
        { n: impact.existingCrossMsLinks, label: 'cross-MS entity link', behaviour: '저장 시점부터 read-only · 새 cross-MS 연결 시도는 PermissionBlockedPanel 로 차단' },
        { n: impact.activeMultiMsGrants, label: 'active multi-MS grant', behaviour: '기존 grant 는 만료일까지 유지 · 갱신은 새 정책 기준으로 재심사' },
        { n: impact.pendingMultiMsRequests, label: 'pending cross-MS permission request', behaviour: '새 정책으로 자동 재평가됨 · 요청자에게 needs_more_info 알림' },
      ];
    }
    if (k === 'crossMsLinking' && direction === 'loosen') {
      return [
        { n: impact.existingCrossMsLinks, label: 'cross-MS entity link', behaviour: '기존 link 는 변경 없음 · 새 연결은 audit 와 함께 즉시 허용' },
        { n: impact.pendingMultiMsRequests, label: 'pending request', behaviour: '큐에 그대로 유지 · 요청자가 직접 다시 시도하지 않으면 자동 승인되지 않습니다' },
      ];
    }
    if (k === 'selfApproval' && direction === 'tighten') {
      return [
        { n: impact.historicalSelfApprovals, label: '과거 self-approval 기록', behaviour: '감사 로그에 SELF_APPROVAL 라벨로 영구 보존 · 회수되지 않음' },
        { n: impact.activeCapabilityGrants, label: 'active self-approval capability', behaviour: '만료일까지 유지 · 갱신 시 새 정책 기준으로 평가' },
        { n: impact.pendingRequests, label: 'pending self-approval request', behaviour: '저장 시점부터 reviewer 배정 필요 · 요청자에게 알림 발송' },
      ];
    }
    if (k === 'selfApproval' && direction === 'loosen') {
      return [
        { n: impact.activeCapabilityGrants, label: 'active capability grant', behaviour: '기존 grant 유지 · 새 self-approval 은 capability 없이도 허용 (감사 라벨은 동일)' },
      ];
    }
    return [];
  })();

  return (
    <div style={{
      padding: 14, borderRadius: 6, marginTop: 14,
      background: TONE.bg,
      boxShadow: `inset 0 0 0 1px ${TONE.ring}`,
    }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
        <Icon name={direction === 'loosen' ? 'info' : 'alert'} size={14} style={{ color: TONE.color, marginTop: 2 }} />
        <div className="vstack" style={{ gap: 2 }}>
          <span className="text-sm" style={{ fontWeight: 600, color: TONE.color }}>{heading}</span>
          <span className="text-xs muted" style={{ lineHeight: 1.5 }}>
            정책 변경은 <strong style={{ color: 'var(--text-secondary)' }}>비소급</strong>입니다.
            저장 시점부터 적용되며, 과거 데이터는 표시된 규칙에 따라 처리됩니다.
          </span>
        </div>
      </div>

      <div className="vstack" style={{ gap: 6 }}>
        {lines.map((line, i) => (
          <div key={i} className="hstack" style={{
            gap: 10, padding: '8px 10px',
            background: 'var(--color-pitch-black)', borderRadius: 4,
            alignItems: 'flex-start',
          }}>
            <span className="mono text-sm" style={{ color: TONE.color, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
              {line.n}
            </span>
            <div className="vstack" style={{ gap: 2, flex: 1 }}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{line.label}</span>
              <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{line.behaviour}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hstack" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {k === 'crossMsLinking' && (
          <Button variant="subtle" size="sm" onClick={() => window.__feedbackOpsNavigate && window.__feedbackOpsNavigate('integration-links')}>
            <Icon name="arrowRight" size={11} />Affected entity links 보기
          </Button>
        )}
        {k === 'selfApproval' && (
          <Button variant="subtle" size="sm" onClick={() => window.__feedbackOpsNavigate && window.__feedbackOpsNavigate('admin-permissions')}>
            <Icon name="arrowRight" size={11} />Permission requests 보기
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminSettingsScreen({ onNavigate }) {
  const [values, setValues] = useState(SETTING_DEFAULTS);
  const [saved, setSaved] = useState(SETTING_DEFAULTS);
  const [editingKey, setEditingKey] = useState(null);

  const patch = (k, v) => setValues(prev => ({ ...prev, [k]: v }));
  const dirtyKeys = Object.keys(values).filter(k => values[k] !== saved[k]);
  const dirty = dirtyKeys.length > 0;

  const handleSave = () => { setSaved(values); setEditingKey(null); };
  const handleDiscard = () => { setValues(saved); setEditingKey(null); };

  return (
    <>
      <PageShell
        title="Workspace settings"
        subtitle="권한 정책 · 익명 임계값 · cross-MS 정책 같이 워크스페이스 전역 동작을 결정하는 설정입니다.">

          <PanelSectionTitle>Permission policy</PanelSectionTitle>
          <div className="card vstack" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
            <SettingsControlledRow
              k="selfApproval"
              label="Self-approval of Task Request"
              desc="요청자가 직접 자기 Task Request 를 승인하려면 scoped capability 가 필요합니다. 감사 로그에 SELF_APPROVAL 라벨로 표시됩니다."
              kind="options"
              options={SETTING_OPTIONS.selfApproval}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('selfApproval')} savedValue={saved.selfApproval}
            />
            <SettingsControlledRow
              k="crossMsLinking"
              label="Cross-Managed-System linking"
              desc="다른 Managed System 의 entity 를 참조·연결할 수 있는지 결정합니다. 차단된 경우 PermissionBlockedPanel 로 표시됩니다."
              kind="options"
              options={SETTING_OPTIONS.crossMsLinking}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('crossMsLinking')} savedValue={saved.crossMsLinking}
            />
            <SettingsControlledRow
              k="appealWindow"
              label="Permission request appeal window"
              desc="명시 거부(denied) 이후 재요청을 허용하는 기간입니다. 0 이면 정책 갱신 전까지 재요청 불가."
              kind="number"
              suffix="days" min={0} max={365}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('appealWindow')} savedValue={saved.appealWindow}
              isLast
            />
          </div>

          {/* Pack 8 — retro warning fires when a policy with non-retroactive
              semantics is dirty. Per-key so Admin sees exactly what changes. */}
          {dirtyKeys.includes('crossMsLinking') && (
            <PolicyRetroWarning k="crossMsLinking" saved={saved.crossMsLinking} next={values.crossMsLinking} />
          )}
          {dirtyKeys.includes('selfApproval') && (
            <PolicyRetroWarning k="selfApproval" saved={saved.selfApproval} next={values.selfApproval} />
          )}

          <div style={{ marginTop: 24 }} />
          <PanelSectionTitle>Survey policy</PanelSectionTitle>
          <div className="card vstack" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
            <SettingsControlledRow
              k="anonymityThreshold"
              label="Anonymity threshold"
              desc="결과 요약·필터에서 가시 응답이 이 값 미만으로 줄어들면 버킷이 자동으로 머지·가려집니다."
              kind="number"
              suffix="responses" min={1} max={50}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('anonymityThreshold')} savedValue={saved.anonymityThreshold}
            />
            <SettingsControlledRow
              k="surveyResponseToVoc"
              label="Survey Response → VOC"
              desc="응답을 VOC 로 자동 변환하는 것은 정책으로 금지됩니다. Create Finding / Link Finding / Request Task / Add Evidence Highlight / 기존 VOC 에 근거 연결 만 허용됩니다."
              kind="locked"
              lockedValue="Forbidden" lockedTone="red"
              lockedReason="MVP 정책으로 잠겨 있습니다. 변경하려면 워크스페이스 정책 ADR 갱신이 필요합니다."
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={false} savedValue={saved.surveyResponseToVoc}
              isLast
            />
          </div>

          <PanelSectionTitle>Scope defaults</PanelSectionTitle>
          <div className="card vstack" style={{ padding: 0, overflow: 'hidden' }}>
            <SettingsControlledRow
              k="developerDefaultScope"
              label="Default Managed System scope (Developer)"
              desc="Developer 가 처음 로그인할 때 적용되는 효과적 scope 의 union 기준값입니다."
              kind="options"
              options={SETTING_OPTIONS.developerDefaultScope}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('developerDefaultScope')} savedValue={saved.developerDefaultScope}
            />
            <SettingsControlledRow
              k="workspaceWideAll"
              label="all = workspace-wide"
              desc="Admin 만 all 을 workspace-wide 로 해석합니다. 다른 역할은 effective scope union (교집합 = workspace ∩ grants) 으로 해석합니다."
              kind="options"
              options={SETTING_OPTIONS.workspaceWideAll}
              values={values} editingKey={editingKey} setEditingKey={setEditingKey} onChange={patch}
              dirty={dirtyKeys.includes('workspaceWideAll')} savedValue={saved.workspaceWideAll}
              isLast
            />
          </div>
      </PageShell>

      {/* Dirty save bar — sticky, only when any value changed */}
      {dirty && (
        <div className="hstack" style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-popover)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: '10px 14px',
          gap: 14,
          boxShadow: 'var(--shadow-xl)',
          zIndex: 100,
          alignItems: 'center',
        }}>
          <span className="hstack" style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(242,196,109,0.12)', color: 'var(--color-amber)',
            justifyContent: 'center',
          }}>
            <Icon name="alert" size={11} />
          </span>
          <span className="text-sm">
            <strong>{dirtyKeys.length}</strong> unsaved {dirtyKeys.length === 1 ? 'change' : 'changes'}
          </span>
          <span className="text-xs muted">
            {dirtyKeys.map(k => SETTINGS_LABEL[k]).join(' · ')}
          </span>
          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />
          <Button variant="subtle" size="sm" onClick={handleDiscard}>Discard</Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            <Icon name="check" size={11} />Save changes
          </Button>
        </div>
      )}
    </>
  );
}

function SettingsControlledRow({
  k, label, desc, kind, options, suffix, min, max,
  lockedValue, lockedTone, lockedReason,
  values, editingKey, setEditingKey, onChange,
  dirty, savedValue, isLast,
}) {
  const editing = editingKey === k;
  const currentValue = values[k];

  // Display string
  const displayString = (() => {
    if (kind === 'locked') return lockedValue;
    if (kind === 'options') return (options.find(o => o.value === currentValue) || {}).label || currentValue;
    if (kind === 'number') return `${currentValue} ${suffix}`;
    return String(currentValue);
  })();
  const displayTone = (() => {
    if (kind === 'locked') return lockedTone;
    if (kind === 'options') return (options.find(o => o.value === currentValue) || {}).tone || 'default';
    return 'default';
  })();
  const valueColor =
    displayTone === 'red' ? 'var(--color-warning-red)' :
    displayTone === 'amber' ? 'var(--color-amber)' :
    'var(--text-primary)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: editing ? '1fr 240px 90px' : '1fr 200px 90px',
      gap: 16, padding: '14px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      alignItems: 'flex-start',
      background: dirty ? 'rgba(20, 40, 160,0.04)' : 'transparent',
    }}>
      <div className="vstack" style={{ gap: 4, minWidth: 0 }}>
        <div className="hstack" style={{ gap: 6 }}>
          <span className="text-sm" style={{ fontWeight: 500 }}>{label}</span>
          {dirty && (
            <span className="badge" style={{
              background: 'rgba(20, 40, 160,0.18)',
              color: 'var(--color-neon-lime)',
              fontSize: 10,
            }}>Unsaved</span>
          )}
        </div>
        <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{desc}</span>
        {dirty && (
          <span className="text-xs" style={{ color: 'var(--color-amber)' }}>
            Previously: <strong>{kind === 'options'
              ? (options.find(o => o.value === savedValue) || {}).label || savedValue
              : kind === 'number' ? `${savedValue} ${suffix}` : savedValue}</strong>
          </span>
        )}
      </div>

      <div className="hstack" style={{ justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
        {!editing && (
          <span className="text-sm" style={{ color: valueColor, fontWeight: 500, textAlign: 'right' }}>
            {displayString}
          </span>
        )}
        {editing && kind === 'options' && (
          <select value={currentValue}
            onChange={(e) => onChange(k, e.target.value)}
            style={{
              padding: '6px 8px',
              background: 'var(--color-pitch-black)',
              border: 'none', borderRadius: 6,
              boxShadow: 'inset 0 0 0 1px var(--border-strong)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit', fontSize: 'var(--text-sm)',
              outline: 'none', width: '100%',
            }}>
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        {editing && kind === 'number' && (
          <div className="hstack" style={{ gap: 6, width: '100%' }}>
            <input type="number" min={min} max={max}
              value={currentValue}
              onChange={(e) => onChange(k, Number(e.target.value))}
              style={{
                padding: '6px 8px',
                background: 'var(--color-pitch-black)',
                border: 'none', borderRadius: 6,
                boxShadow: 'inset 0 0 0 1px var(--border-strong)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit', fontSize: 'var(--text-sm)',
                outline: 'none', flex: 1,
              }} />
            <span className="text-xs muted">{suffix}</span>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        {kind === 'locked' ? (
          <span title={lockedReason} className="badge" style={{
            background: 'rgba(138,143,152,0.12)', color: 'var(--text-muted)',
          }}>
            <Icon name="shield" size={10} />Locked
          </span>
        ) : editing ? (
          <Button variant="subtle" size="sm" onClick={() => setEditingKey(null)}>Done</Button>
        ) : (
          <Button variant="subtle" size="sm" onClick={() => setEditingKey(k)}>Edit</Button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminSettingsScreen,
  PolicyRetroWarning,
  classifyPolicyTransition,
});
