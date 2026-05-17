// ============================================================
// FeedbackOps — Survey Builder (full page)
// Route: survey-builder
// ============================================================
// Builder is the only full-page surface in the prototype outside
// the Survey Result Summary. Per FR-SURVEY-002 it supports the four
// basic question kinds — single / multiple / rating / text — plus
// one-level conditional branching. No advanced logic builder.
//
// Spec sources:
//   - docs/design/07-survey-system.md   §FR-SURVEY-002 Basic Builder
//   - docs/frontend/routes-and-layout.md (/surveys/:surveyId)
//   - docs/frontend/ui-design-system.md  (Layout patterns: full page)
// ============================================================

const QUESTION_KINDS = [
  { key: 'single',   label: 'Single choice',   icon: 'check',   desc: '하나의 옵션 선택' },
  { key: 'multiple', label: 'Multiple choice', icon: 'layers',  desc: '여러 옵션 선택' },
  { key: 'rating',   label: 'Rating',          icon: 'pulse',   desc: '1–5 또는 1–7 척도' },
  { key: 'text',     label: 'Free text',       icon: 'doc',     desc: '서술형 응답' },
];

// Builder fixtures keyed by survey id. Production should hydrate from
// the survey's draft state — this is mock starting content.
const BUILDER_FIXTURES = {
  'SRV-20': {
    title: 'SSO 재인증 흐름 변경 — Outcome',
    type: 'outcome',
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    target: 80,
    anonymity: 'segment-only',
    schedule: 'manual',
    branchAllowed: true,
    questions: [
      {
        id: 'q-1', kind: 'rating',
        title: 'SSO 재인증 흐름 개선 후, 401 에러를 다시 마주친 빈도는?',
        required: true,
        scale: { min: 1, max: 5, minLabel: '훨씬 자주', maxLabel: '거의 없음' },
      },
      {
        id: 'q-2', kind: 'single',
        title: '재인증 안내가 표시될 때 가장 도움이 된 부분은?',
        required: true,
        options: [
          { id: 'o-1', label: '"세션이 만료되었습니다" 명시 메시지' },
          { id: 'o-2', label: '재로그인 링크 한 번에' },
          { id: 'o-3', label: '재인증 후 원래 화면 복귀' },
          { id: 'o-4', label: '도움이 되지 않았다' },
        ],
        branch: {
          enabled: true,
          condition: { optionId: 'o-4' },
          showQuestionId: 'q-3',
        },
      },
      {
        id: 'q-3', kind: 'text',
        title: '재인증 흐름에서 추가로 개선되었으면 하는 부분이 있다면 자유롭게 적어주세요.',
        required: false,
        placeholder: '예: 재인증 후에도 화면이 깨졌습니다 …',
      },
      {
        id: 'q-4', kind: 'multiple',
        title: '재인증 흐름을 어디에서 자주 마주치셨나요? (복수 선택)',
        required: false,
        options: [
          { id: 'o-5', label: '임베디드 리포트' },
          { id: 'o-6', label: '대시보드 직접 열기' },
          { id: 'o-7', label: '모바일 뷰' },
          { id: 'o-8', label: '공유 링크 열기' },
        ],
      },
    ],
  },
};

const DEFAULT_FIXTURE = BUILDER_FIXTURES['SRV-20'];

// Empty starting point when the user clicks "New survey" on the Surveys
// list — Builder hydrates from this when the surveyId doesn't match any
// known fixture and starts with "SRV-DRAFT-".
const BLANK_FIXTURE = {
  title: 'Untitled survey',
  type: 'discovery',
  managedSystem: 'tableau',
  analyticsArea: '',
  target: 100,
  anonymity: 'segment-only',
  schedule: 'manual',
  branchAllowed: true,
  questions: [
    {
      id: 'q-blank-1', kind: 'single',
      title: '',
      required: true,
      options: [
        { id: 'o-blank-1', label: '옵션 1' },
        { id: 'o-blank-2', label: '옵션 2' },
      ],
    },
  ],
};

// ------------------------------------------------------------
// Outline (left column) — sortable list of questions with kind glyphs.
// HTML5 drag-reorder mutates the local draft and marks it dirty.
// ------------------------------------------------------------
function OutlineRow({ q, index, selected, onSelect, onDelete, branchTargetIds, onReorder, dragState, setDragState }) {
  const meta = QUESTION_KINDS.find(k => k.key === q.kind) || QUESTION_KINDS[0];
  const isBranchTarget = branchTargetIds.has(q.id);
  const isDraggedOver = dragState?.overIndex === index && dragState?.fromIndex !== index;
  const isBeingDragged = dragState?.fromIndex === index;

  return (
    <button
      onClick={() => onSelect(q.id)}
      draggable
      onDragStart={(e) => {
        setDragState({ fromIndex: index, overIndex: null });
        // Firefox needs setData to start the drag
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(index)); } catch (err) { /* noop */ }
      }}
      onDragOver={(e) => {
        if (dragState?.fromIndex == null || dragState.fromIndex === index) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragState.overIndex !== index) {
          setDragState({ ...dragState, overIndex: index });
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragState?.fromIndex != null && dragState.fromIndex !== index) {
          onReorder(dragState.fromIndex, index);
        }
        setDragState(null);
      }}
      onDragEnd={() => setDragState(null)}
      className={`outline-row ${selected ? 'selected' : ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 16px 22px 1fr auto',
        gap: 8, padding: '10px 10px',
        background: selected ? 'var(--surface-row-selected)' : 'transparent',
        border: 'none',
        boxShadow: isDraggedOver
          ? 'inset 0 2px 0 var(--color-neon-lime)'
          : selected ? 'inset 0 0 0 1px var(--border-selected)' : 'inset 0 0 0 1px transparent',
        borderRadius: 6,
        textAlign: 'left',
        cursor: 'grab',
        alignItems: 'center',
        width: '100%',
        opacity: isBeingDragged ? 0.4 : 1,
        transition: 'opacity 80ms ease, box-shadow 80ms ease',
      }}>
      <span style={{
        color: 'var(--text-muted)',
        cursor: 'grab',
        userSelect: 'none',
        lineHeight: 1,
        fontSize: 13,
      }} title="드래그해서 순서 변경">⋮⋮</span>
      <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
      <span className="hstack" style={{
        width: 22, height: 22, borderRadius: 6,
        background: 'var(--surface-card)',
        color: 'var(--text-secondary)',
        justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={meta.icon} size={11} />
      </span>
      <div className="vstack" style={{ gap: 2, minWidth: 0 }}>
        <span className="text-sm" style={{
          fontWeight: 500, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{q.title || '제목 없음'}</span>
        <div className="hstack" style={{ gap: 6 }}>
          <span className="text-xs muted">{meta.label}</span>
          {q.required && <span className="text-xs" style={{ color: 'var(--color-warning-red)' }}>· required</span>}
          {q.branch?.enabled && <span className="text-xs" style={{ color: 'var(--color-aether-blue)' }}>· branch</span>}
          {isBranchTarget && <span className="text-xs" style={{ color: 'var(--color-amethyst)' }}>· conditional</span>}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm"
        onClick={(ev) => { ev.stopPropagation(); onDelete(q.id); }}
        style={{ opacity: selected ? 1 : 0.4 }}>
        <Icon name="close" size={11} />
      </button>
    </button>
  );
}

// ------------------------------------------------------------
// Question editors per kind
// ------------------------------------------------------------
function ChoiceEditor({ q, onPatch, multi }) {
  const addOption = () => {
    const next = [...(q.options || [])];
    next.push({ id: `o-${Date.now()}`, label: `옵션 ${next.length + 1}` });
    onPatch({ options: next });
  };
  const removeOption = (id) => {
    if ((q.options || []).length <= 2) return;
    onPatch({ options: (q.options || []).filter(o => o.id !== id) });
  };
  const updateOption = (id, label) => {
    onPatch({
      options: (q.options || []).map(o => o.id === id ? { ...o, label } : o),
    });
  };
  return (
    <div className="vstack" style={{ gap: 8 }}>
      {(q.options || []).map((o) => (
        <div key={o.id} className="hstack" style={{ gap: 8 }}>
          <Icon name={multi ? 'layers' : 'check'} size={12} className="muted" />
          <input
            className="builder-input"
            value={o.label}
            onChange={(e) => updateOption(o.id, e.target.value)}
            style={{
              flex: 1, padding: '8px 10px',
              background: 'var(--color-pitch-black)',
              border: 'none',
              borderRadius: 6,
              boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit', fontSize: 'var(--text-sm)',
              outline: 'none',
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => removeOption(o.id)} title="옵션 삭제">
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      <button className="btn btn-subtle btn-sm" onClick={addOption} style={{ alignSelf: 'flex-start' }}>
        <Icon name="plus" size={11} />옵션 추가
      </button>
    </div>
  );
}

function RatingEditor({ q, onPatch }) {
  const scale = q.scale || { min: 1, max: 5, minLabel: '', maxLabel: '' };
  return (
    <div className="vstack" style={{ gap: 12 }}>
      <div className="hstack" style={{ gap: 12 }}>
        <BuilderField label="Min">
          <input type="number" value={scale.min}
            onChange={(e) => onPatch({ scale: { ...scale, min: Number(e.target.value) } })}
            style={builderInputStyle({ width: 70 })} />
        </BuilderField>
        <BuilderField label="Max">
          <input type="number" value={scale.max}
            onChange={(e) => onPatch({ scale: { ...scale, max: Number(e.target.value) } })}
            style={builderInputStyle({ width: 70 })} />
        </BuilderField>
      </div>
      <BuilderField label="Min label">
        <input value={scale.minLabel || ''} placeholder="예: 매우 불만족"
          onChange={(e) => onPatch({ scale: { ...scale, minLabel: e.target.value } })}
          style={builderInputStyle()} />
      </BuilderField>
      <BuilderField label="Max label">
        <input value={scale.maxLabel || ''} placeholder="예: 매우 만족"
          onChange={(e) => onPatch({ scale: { ...scale, maxLabel: e.target.value } })}
          style={builderInputStyle()} />
      </BuilderField>
      {/* Live preview */}
      <div className="card-nested vstack" style={{ gap: 8, padding: 12 }}>
        <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Preview</span>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span className="text-xs muted">{scale.minLabel || '—'}</span>
          <span className="hstack" style={{ gap: 6 }}>
            {Array.from({ length: Math.max(1, scale.max - scale.min + 1) }).map((_, i) => (
              <span key={i} className="hstack" style={{
                width: 32, height: 32, borderRadius: 6,
                background: 'var(--surface-card)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                justifyContent: 'center',
                boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
              }}>{scale.min + i}</span>
            ))}
          </span>
          <span className="text-xs muted">{scale.maxLabel || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function TextEditor({ q, onPatch }) {
  return (
    <div className="vstack" style={{ gap: 12 }}>
      <BuilderField label="Placeholder">
        <input value={q.placeholder || ''} placeholder="응답자에게 보여줄 힌트 …"
          onChange={(e) => onPatch({ placeholder: e.target.value })}
          style={builderInputStyle()} />
      </BuilderField>
      <div className="card-nested vstack" style={{ gap: 6, padding: 12 }}>
        <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Preview</span>
        <textarea readOnly
          placeholder={q.placeholder || '자유롭게 적어주세요…'}
          rows={3}
          style={{
            ...builderInputStyle(),
            resize: 'vertical', lineHeight: 1.5,
          }} />
      </div>
      <Callout tone="blue" icon="shield" title="익명 응답의 free-text 는 명시 승인 후에만 evidence 로 사용됩니다">
        Survey System 정책상 free-text 응답은 redaction · explicit approval 후에만
        Evidence Highlight 로 승격됩니다 (07-survey-system.md).
      </Callout>
    </div>
  );
}

// ------------------------------------------------------------
// Branch editor — one-level conditional. Per FR-SURVEY-002 the
// builder must NOT support complex multi-level logic.
// ------------------------------------------------------------
function BranchEditor({ q, allQuestions, onPatch }) {
  const isChoice = q.kind === 'single' || q.kind === 'multiple';
  if (!isChoice) {
    return (
      <span className="text-xs muted">분기는 single / multiple choice 질문에서만 설정할 수 있습니다.</span>
    );
  }
  const branch = q.branch || { enabled: false };
  const downstream = allQuestions.filter(other => other.id !== q.id);
  return (
    <div className="vstack" style={{ gap: 10 }}>
      <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!branch.enabled}
          onChange={(e) => onPatch({ branch: { ...branch, enabled: e.target.checked } })} />
        <span className="text-sm">조건부로 다음 질문을 보여주기 (one-level)</span>
      </label>
      {branch.enabled && (
        <div className="vstack" style={{ gap: 8, paddingLeft: 22 }}>
          <BuilderField label="When option">
            <select
              value={branch.condition?.optionId || ''}
              onChange={(e) => onPatch({ branch: { ...branch, condition: { optionId: e.target.value } } })}
              style={builderInputStyle()}>
              <option value="">— 옵션 선택 —</option>
              {(q.options || []).map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </BuilderField>
          <BuilderField label="Show question">
            <select
              value={branch.showQuestionId || ''}
              onChange={(e) => onPatch({ branch: { ...branch, showQuestionId: e.target.value } })}
              style={builderInputStyle()}>
              <option value="">— 질문 선택 —</option>
              {downstream.map(d => (
                <option key={d.id} value={d.id}>
                  {d.title.slice(0, 50)}{d.title.length > 50 ? '…' : ''}
                </option>
              ))}
            </select>
          </BuilderField>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Reusable little parts
// ------------------------------------------------------------
function BuilderField({ label, children, sub }) {
  return (
    <div className="vstack" style={{ gap: 4 }}>
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
      {sub && <span className="text-xs muted" style={{ lineHeight: 1.5 }}>{sub}</span>}
    </div>
  );
}

function builderInputStyle(extra) {
  return {
    padding: '8px 10px',
    background: 'var(--color-pitch-black)',
    border: 'none',
    borderRadius: 6,
    boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit', fontSize: 'var(--text-sm)',
    outline: 'none',
    width: '100%',
    ...(extra || {}),
  };
}

// ------------------------------------------------------------
// Edit pane (center)
// ------------------------------------------------------------
function QuestionEditPane({ q, allQuestions, onPatch }) {
  if (!q) {
    return (
      <div className="vstack" style={{
        flex: 1, padding: 32, gap: 8,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="doc" size={28} className="muted" />
        <span className="text-sm muted">질문을 선택하거나 새로 추가하세요.</span>
      </div>
    );
  }
  return (
    <div className="vstack" style={{ padding: 24, gap: 18, flex: 1, minWidth: 0, overflow: 'auto' }}>
      {/* Kind chooser */}
      <BuilderField label="Question kind">
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          {QUESTION_KINDS.map(k => (
            <button key={k.key}
              onClick={() => {
                // Pack 10 — preserve options + scale + placeholder across
                // kind switches so the user can experiment without losing
                // work.  We keep the field even when the new kind doesn't
                // use it; it'll be visible again on switch-back.
                const next = { kind: k.key };
                if ((k.key === 'single' || k.key === 'multiple')
                    && (!q.options || q.options.length === 0)) {
                  next.options = [
                    { id: `o-${Date.now()}-1`, label: '옵션 1' },
                    { id: `o-${Date.now()}-2`, label: '옵션 2' },
                  ];
                }
                if (k.key === 'rating' && !q.scale) {
                  next.scale = { min: 1, max: 5, minLabel: '', maxLabel: '' };
                }
                onPatch(next);
              }}
              className={`btn btn-${q.kind === k.key ? 'primary' : 'subtle'} btn-sm`}>
              <Icon name={k.icon} size={11} />{k.label}
            </button>
          ))}
        </div>
        {/* Preservation hint — show only when latent fields are stashed
            but currently unused.  Helps the user trust the round-trip. */}
        {(() => {
          const stashed = [];
          if ((q.kind !== 'single' && q.kind !== 'multiple')
              && (q.options || []).length > 0) stashed.push(`${q.options.length}개 선택지`);
          if (q.kind !== 'rating' && q.scale) stashed.push('rating scale');
          if (q.kind !== 'text' && q.placeholder) stashed.push('text placeholder');
          if (stashed.length === 0) return null;
          return (
            <span className="text-xs muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
              <Icon name="info" size={10} style={{ marginRight: 4, verticalAlign: '-1px' }} />
              {stashed.join(' · ')} 가 저장되어 있어요. kind 를 되돌리면 그대로 사용됩니다.
            </span>
          );
        })()}
      </BuilderField>

      <BuilderField label="Question title">
        <textarea value={q.title} rows={2}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="응답자에게 보여줄 질문 …"
          style={{ ...builderInputStyle(), resize: 'vertical', lineHeight: 1.5 }} />
      </BuilderField>

      <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!q.required}
          onChange={(e) => onPatch({ required: e.target.checked })} />
        <span className="text-sm">필수 응답</span>
      </label>

      <BuilderField label="Answer">
        {q.kind === 'single' && <ChoiceEditor q={q} onPatch={onPatch} multi={false} />}
        {q.kind === 'multiple' && <ChoiceEditor q={q} onPatch={onPatch} multi={true} />}
        {q.kind === 'rating' && <RatingEditor q={q} onPatch={onPatch} />}
        {q.kind === 'text' && <TextEditor q={q} onPatch={onPatch} />}
      </BuilderField>

      <BuilderField label="Conditional branch (one-level)"
        sub="FR-SURVEY-002 — Survey Builder는 one-level conditional 만 허용합니다. 복잡한 분기 로직은 MVP 범위 밖.">
        <BranchEditor q={q} allQuestions={allQuestions} onPatch={onPatch} />
      </BuilderField>
    </div>
  );
}

// ------------------------------------------------------------
// Settings pane (right)
// ------------------------------------------------------------
function BuilderSettingsPane({ draft, onPatch }) {
  return (
    <div className="vstack" style={{ padding: 18, gap: 16, overflow: 'auto' }}>
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Survey settings</span>

      <BuilderField label="Type">
        <div className="hstack" style={{ gap: 4 }}>
          {['discovery', 'validation', 'outcome'].map(t => (
            <button key={t}
              onClick={() => onPatch({ type: t })}
              className={`btn btn-${draft.type === t ? 'primary' : 'subtle'} btn-sm`}
              style={{ flex: 1, textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
      </BuilderField>

      <BuilderField label="Managed System">
        <select value={draft.managedSystem}
          onChange={(e) => onPatch({ managedSystem: e.target.value })}
          style={builderInputStyle()}>
          {window.ManagedSystems.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </BuilderField>

      <BuilderField label="Analytics Area">
        <select value={draft.analyticsArea}
          onChange={(e) => onPatch({ analyticsArea: e.target.value })}
          style={builderInputStyle()}>
          <option value="">— None —</option>
          {window.AnalyticsAreas
            .filter(a => a.managedSystem === draft.managedSystem)
            .map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
        </select>
      </BuilderField>

      <BuilderField label="Target responses" sub="Outcome 발표 임계값으로도 사용됩니다.">
        <input type="number" min={1} value={draft.target}
          onChange={(e) => onPatch({ target: Number(e.target.value) })}
          style={builderInputStyle()} />
      </BuilderField>

      <BuilderField label="Anonymity"
        sub="Personal — 응답자 식별 가능 / Segment-only — segment 단위만 노출 / Full anonymous — 식별 불가">
        <select value={draft.anonymity}
          onChange={(e) => onPatch({ anonymity: e.target.value })}
          style={builderInputStyle()}>
          <option value="personal">Personal</option>
          <option value="segment-only">Segment-only</option>
          <option value="full-anonymous">Full anonymous</option>
        </select>
      </BuilderField>

      <BuilderField label="Schedule" sub="Manual — 직접 발송 / Trigger — release · cluster 이벤트로 자동 발송">
        <select value={draft.schedule}
          onChange={(e) => onPatch({ schedule: e.target.value })}
          style={builderInputStyle()}>
          <option value="manual">Manual</option>
          <option value="trigger-release">On Task release</option>
          <option value="trigger-cluster">On Cluster confirm</option>
        </select>
      </BuilderField>

      <Callout tone="red" icon="alert" title="Survey Response → VOC 금지">
        응답을 VOC 로 변환하는 흐름은 정책상 금지됩니다. 발송 후 follow-up
        은 Create Finding / Link Finding / Request Task / Add Evidence /
        기존 VOC 에 근거 연결 5가지만 허용됩니다.
      </Callout>
    </div>
  );
}

// ------------------------------------------------------------
// Builder screen
// ------------------------------------------------------------
function SurveyBuilderScreen({ surveyId, onNavigate }) {
  const isNew = !!surveyId && surveyId.startsWith('SRV-DRAFT');
  const fixture = isNew
    ? BLANK_FIXTURE
    : (BUILDER_FIXTURES[surveyId] || DEFAULT_FIXTURE);
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(fixture)));
  const [selectedId, setSelectedId] = useState(draft.questions[0]?.id);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(isNew); // new drafts start dirty so Save is enabled

  const selected = draft.questions.find(q => q.id === selectedId);
  const branchTargetIds = useMemo(() => {
    const s = new Set();
    draft.questions.forEach(q => {
      if (q.branch?.enabled && q.branch.showQuestionId) s.add(q.branch.showQuestionId);
    });
    return s;
  }, [draft.questions]);

  const patchQuestion = (patch) => {
    setDraft(d => ({
      ...d,
      questions: d.questions.map(q => q.id === selectedId ? { ...q, ...patch } : q),
    }));
    setDirty(true);
  };
  const patchDraft = (patch) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); };

  const addQuestion = () => {
    const id = `q-${Date.now()}`;
    setDraft(d => ({
      ...d,
      questions: [...d.questions, {
        id, kind: 'single',
        title: '',
        required: false,
        options: [
          { id: `${id}-o-1`, label: '옵션 1' },
          { id: `${id}-o-2`, label: '옵션 2' },
        ],
      }],
    }));
    setSelectedId(id);
    setDirty(true);
  };

  const deleteQuestion = (id) => {
    setDraft(d => {
      const next = d.questions.filter(q => q.id !== id);
      return { ...d, questions: next };
    });
    if (selectedId === id) {
      const remaining = draft.questions.filter(q => q.id !== id);
      setSelectedId(remaining[0]?.id || null);
    }
    setDirty(true);
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleTimeString());
    setDirty(false);
  };

  // Preview pane state — toggled by Preview button.
  // Spec: 07-survey-system.md FR-SURVEY-002 (preview before launch).
  const [previewOpen, setPreviewOpen] = useState(false);

  // Launch validation — gather actionable issues before allowing publish.
  // Spec: 07-survey-system.md FR-SURVEY-002 (required questions, option count,
  // branch target existence).
  const launchIssues = useMemo(() => {
    const issues = [];
    if (!draft.title || !draft.title.trim()) {
      issues.push({ kind: 'missing-title', label: '제목이 비어있습니다.' });
    }
    if (!draft.questions || draft.questions.length === 0) {
      issues.push({ kind: 'no-questions', label: '질문이 한 개도 없습니다.' });
    }
    const requiredCount = (draft.questions || []).filter(q => q.required).length;
    if (requiredCount === 0 && (draft.questions || []).length > 0) {
      issues.push({ kind: 'no-required', label: '필수 질문이 없습니다 — 응답 품질이 떨어질 수 있어요.', severity: 'warn' });
    }
    (draft.questions || []).forEach((q, i) => {
      if (!q.title || !q.title.trim()) {
        issues.push({ kind: 'q-empty-title', label: `Q${i + 1} — 질문 본문이 비어있습니다.`, qid: q.id });
      }
      if ((q.kind === 'single' || q.kind === 'multiple') && (q.options || []).filter(o => o.label.trim()).length < 2) {
        issues.push({ kind: 'q-need-options', label: `Q${i + 1} — 선택형 질문은 최소 2개의 옵션이 필요합니다.`, qid: q.id });
      }
      if (q.branch?.enabled) {
        const target = (draft.questions || []).find(x => x.id === q.branch.showQuestionId);
        if (!target) {
          issues.push({ kind: 'q-branch-target', label: `Q${i + 1} — 분기 조건의 대상 질문이 설정되지 않았습니다.`, qid: q.id });
        }
        if (!q.branch.condition?.optionId) {
          issues.push({ kind: 'q-branch-option', label: `Q${i + 1} — 분기 조건의 옵션이 지정되지 않았습니다.`, qid: q.id });
        }
      }
    });
    return issues;
  }, [draft]);

  const blockingIssues = launchIssues.filter(i => i.severity !== 'warn');
  const canLaunch = blockingIssues.length === 0;
  const [launchOpen, setLaunchOpen] = useState(false);

  // Outline drag-reorder state — { fromIndex, overIndex }
  const [dragState, setDragState] = useState(null);
  const reorderQuestions = (fromIdx, toIdx) => {
    setDraft(d => {
      const next = [...d.questions];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...d, questions: next };
    });
    setDirty(true);
  };

  return (
    <WorkbenchShell
      toolbar={
        <>
        <Button variant="subtle" size="sm" icon="chevronLeft" onClick={() => onNavigate && onNavigate('surveys')}>
          Back
        </Button>
        <span className="mono text-xs muted">{surveyId}</span>
        <input value={draft.title}
          onChange={(e) => patchDraft({ title: e.target.value })}
          style={{
            ...builderInputStyle({ width: 320, fontSize: 'var(--text-md)', fontWeight: 600 }),
            background: 'transparent',
            boxShadow: 'inset 0 0 0 1px transparent',
          }} />
        <SurveyStatusBadge status="draft" />
        <OutlineBadge style={{ textTransform: 'capitalize' }}>{draft.type}</OutlineBadge>
        <ManagedSystemPill id={draft.managedSystem} />
        <div className="toolbar-spacer" style={{ flex: 1 }} />
        <span className="text-xs muted">
          {dirty ? '저장되지 않은 변경 사항' : savedAt ? `Saved at ${savedAt}` : 'Synced'}
        </span>
        <Button variant="subtle" size="sm" icon="expand" onClick={() => setPreviewOpen(true)}>Preview</Button>
        <Button variant="secondary" size="sm" onClick={handleSave} disabled={!dirty}>
          <Icon name="check" size={11} />Save draft
        </Button>
        <Button variant="primary" size="sm" onClick={() => setLaunchOpen(true)}>
          <Icon name="megaphone" size={11} />Launch
        </Button>
        </>
      }
      bodyStyle={{ display: 'grid', gridTemplateColumns: '280px 1fr 300px' }}>

      {/* Three columns */}
        {/* Outline */}
        <div className="vstack" style={{
          padding: 12,
          gap: 6,
          borderRight: '1px solid var(--border-subtle)',
          overflow: 'auto',
        }}>
          <div className="hstack" style={{ padding: '4px 6px', alignItems: 'center' }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Questions
            </span>
            <span className="text-xs muted" style={{ marginLeft: 6 }}>{draft.questions.length}</span>
            <div style={{ flex: 1 }} />
          </div>
          {draft.questions.map((q, i) => (
            <OutlineRow key={q.id} q={q} index={i} selected={selectedId === q.id}
              onSelect={setSelectedId} onDelete={deleteQuestion}
              branchTargetIds={branchTargetIds}
              onReorder={reorderQuestions}
              dragState={dragState} setDragState={setDragState} />
          ))}
          <button className="btn btn-subtle btn-sm"
            onClick={addQuestion}
            style={{ marginTop: 6, alignSelf: 'stretch', justifyContent: 'center' }}>
            <Icon name="plus" size={11} />새 질문 추가
          </button>

          {/* Branch overview */}
          <div className="vstack" style={{ marginTop: 18, gap: 4, padding: '8px 6px' }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Conditional branches
            </span>
            {draft.questions.filter(q => q.branch?.enabled).length === 0 ? (
              <span className="text-xs muted">아직 설정된 분기 없음</span>
            ) : (
              draft.questions.filter(q => q.branch?.enabled).map(q => {
                const target = draft.questions.find(d => d.id === q.branch.showQuestionId);
                const optionLabel = (q.options || []).find(o => o.id === q.branch.condition?.optionId)?.label;
                return (
                  <div key={q.id} className="vstack" style={{ gap: 2, fontSize: 'var(--text-xs)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Q{draft.questions.indexOf(q) + 1} · {optionLabel || '—'}
                    </span>
                    <span className="muted" style={{ paddingLeft: 8 }}>
                      → {target ? `Q${draft.questions.indexOf(target) + 1}` : 'unset'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Edit pane */}
        <QuestionEditPane q={selected} allQuestions={draft.questions} onPatch={patchQuestion} />

        {/* Settings pane */}
        <div style={{
          borderLeft: '1px solid var(--border-subtle)',
          overflow: 'auto',
        }}>
          <BuilderSettingsPane draft={draft} onPatch={patchDraft} />
        </div>

      {previewOpen && (
        <SurveyPreviewPane draft={draft} onClose={() => setPreviewOpen(false)} />
      )}

      {launchOpen && (
        <LaunchValidationModal
          draft={draft}
          issues={launchIssues}
          canLaunch={canLaunch}
          onClose={() => setLaunchOpen(false)}
          onLaunch={() => { setLaunchOpen(false); /* prototype — no real POST */ }}
          onJumpToQuestion={(qid) => { setSelectedId(qid); setLaunchOpen(false); }}
        />
      )}
    </WorkbenchShell>
  );
}

// ============================================================
// Survey Preview — respondent UI rendered inside a side-drawer.
// Spec: 07-survey-system.md FR-SURVEY-002 — preview must show the
// respondent experience before launch, including branching logic.
// ============================================================
function SurveyPreviewPane({ draft, onClose }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // Apply one-level branching: if a parent question's branch is active and
  // unmet, hide the target question from the rendered list.
  const visibleQuestions = useMemo(() => {
    const hidden = new Set();
    draft.questions.forEach(q => {
      if (!q.branch?.enabled || !q.branch.showQuestionId) return;
      const target = q.branch.showQuestionId;
      const parentAnswer = answers[q.id];
      const targetOption = q.branch.condition?.optionId;
      // Show target only when parent has been answered AND value matches
      const matches = Array.isArray(parentAnswer)
        ? parentAnswer.includes(targetOption)
        : parentAnswer === targetOption;
      if (!matches) hidden.add(target);
    });
    return draft.questions.filter(q => !hidden.has(q.id));
  }, [draft.questions, answers]);

  const setAnswer = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,40,160,0.18)',
        backdropFilter: 'blur(4px)',
        zIndex: 500,
        display: 'grid',
        gridTemplateColumns: '1fr 480px',
      }}
      onClick={onClose}>
      <div /> {/* left side closes on click */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-canvas)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'cmdk-rise 140ms ease-out',
        }}>
        <div className="drawer-header">
          <Icon name="survey" size={14} style={{ color: 'var(--color-amber)' }} />
          <strong className="text-sm">Respondent preview</strong>
          <OutlineBadge style={{ textTransform: 'capitalize' }}>{draft.type}</OutlineBadge>
          <ManagedSystemPill id={draft.managedSystem} />
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {submitted ? (
            <div className="vstack" style={{ gap: 8, padding: '40px 0', alignItems: 'center', textAlign: 'center' }}>
              <Icon name="check" size={28} style={{ color: 'var(--color-emerald)' }} />
              <strong className="text-md">응답이 제출되었습니다</strong>
              <span className="text-xs muted">미리보기 — 실제 응답은 저장되지 않습니다.</span>
              <Button variant="subtle" size="sm" onClick={() => { setAnswers({}); setSubmitted(false); }}>
                다시 시작
              </Button>
            </div>
          ) : (
            <div className="vstack" style={{ gap: 28 }}>
              <div className="vstack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{draft.title || '제목 없음'}</h2>
                <span className="text-sm muted">{draft.description || '아직 설명이 추가되지 않았습니다.'}</span>
                <Callout tone="cyan" icon="info" title="익명성 안내">
                  {draft.anonymity === 'full-anonymous'
                    ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
                    : draft.anonymity === 'segment-only'
                      ? '응답은 세그먼트 단위로만 집계됩니다.'
                      : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
                </Callout>
              </div>

              {visibleQuestions.map((q, idx) => (
                <PreviewQuestionRender
                  key={q.id}
                  q={q}
                  index={draft.questions.indexOf(q) + 1}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)} />
              ))}

              <div className="hstack" style={{
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <span className="text-xs muted">
                  {visibleQuestions.length}개 질문 ·
                  {' '}{Object.keys(answers).length}개 응답
                </span>
                <Button variant="primary" size="md" onClick={() => setSubmitted(true)}>
                  제출 (미리보기)
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewQuestionRender({ q, index, value, onChange }) {
  return (
    <div className="vstack" style={{ gap: 10 }}>
      <div className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span className="mono text-xs muted" style={{ paddingTop: 3 }}>Q{index}</span>
        <div className="vstack" style={{ gap: 4, flex: 1 }}>
          <span className="text-sm" style={{ fontWeight: 500 }}>
            {q.title || <em className="text-xs muted">(제목 없음)</em>}
            {q.required && <span style={{ color: 'var(--text-danger)', marginLeft: 4 }}>*</span>}
          </span>
          {q.help && <span className="text-xs muted">{q.help}</span>}
        </div>
      </div>

      <div style={{ paddingLeft: 28 }}>
        {(q.kind === 'single' || q.kind === 'multiple') && (
          <div className="vstack" style={{ gap: 6 }}>
            {(q.options || []).map(opt => {
              const checked = q.kind === 'single'
                ? value === opt.id
                : Array.isArray(value) && value.includes(opt.id);
              return (
                <label key={opt.id} className="hstack" style={{
                  gap: 10, padding: '8px 10px',
                  border: `1px solid ${checked ? 'var(--color-neon-lime)' : 'var(--border-subtle)'}`,
                  background: checked ? 'rgba(20, 40, 160,0.08)' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}>
                  <input type={q.kind === 'single' ? 'radio' : 'checkbox'}
                    name={q.id}
                    checked={checked}
                    onChange={() => {
                      if (q.kind === 'single') onChange(opt.id);
                      else {
                        const list = Array.isArray(value) ? value : [];
                        onChange(checked ? list.filter(v => v !== opt.id) : [...list, opt.id]);
                      }
                    }} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
        {q.kind === 'rating' && (
          <div className="vstack" style={{ gap: 6 }}>
            <div className="hstack" style={{ gap: 6 }}>
              {Array.from({ length: (q.scale?.max || 5) - (q.scale?.min || 1) + 1 }).map((_, i) => {
                const n = (q.scale?.min || 1) + i;
                const checked = value === n;
                return (
                  <button key={n}
                    onClick={() => onChange(n)}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      border: `1px solid ${checked ? 'var(--color-neon-lime)' : 'var(--border-subtle)'}`,
                      background: checked ? 'var(--color-neon-lime)' : 'transparent',
                      color: checked ? 'var(--color-pitch-black)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}>{n}</button>
                );
              })}
            </div>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span className="text-xs muted">{q.scale?.minLabel || ''}</span>
              <span className="text-xs muted">{q.scale?.maxLabel || ''}</span>
            </div>
          </div>
        )}
        {q.kind === 'text' && (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder || '자유롭게 적어주세요…'}
            style={{
              width: '100%',
              minHeight: 96,
              padding: 10,
              background: 'var(--color-pitch-black)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Launch Validation Modal
// Spec: 07-survey-system.md FR-SURVEY-002 — validate required questions,
// option count, and branch target existence before allowing publish.
// Production should POST /surveys/:id/launch only when validation passes.
// ============================================================
function LaunchValidationModal({ draft, issues, canLaunch, onClose, onLaunch, onJumpToQuestion }) {
  const blocking = issues.filter(i => i.severity !== 'warn');
  const warnings = issues.filter(i => i.severity === 'warn');

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,40,160,0.18)',
        backdropFilter: 'blur(4px)',
        zIndex: 500,
        display: 'grid',
        placeItems: 'center',
      }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface-popover)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'cmdk-rise 120ms ease-out',
        }}>
        <div className="hstack" style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 10,
        }}>
          <Icon name="megaphone" size={14} style={{ color: 'var(--color-neon-lime)' }} />
          <strong className="text-md">Launch survey</strong>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
        </div>

        <div className="vstack" style={{ padding: 16, gap: 14 }}>
          <div className="vstack" style={{ gap: 4 }}>
            <span className="text-sm" style={{ fontWeight: 500 }}>{draft.title || '제목 없음'}</span>
            <div className="hstack" style={{ gap: 6 }}>
              <OutlineBadge style={{ textTransform: 'capitalize' }}>{draft.type}</OutlineBadge>
              <ManagedSystemPill id={draft.managedSystem} />
              <span className="text-xs muted">{draft.questions?.length || 0}개 질문</span>
            </div>
          </div>

          {blocking.length === 0 && warnings.length === 0 && (
            <Callout tone="emerald" icon="check" title="검증 통과">
              모든 필수 검증을 통과했습니다. Launch 시 응답 수집이 시작됩니다.
            </Callout>
          )}

          {blocking.length > 0 && (
            <div className="vstack" style={{ gap: 6 }}>
              <span className="text-xs muted" style={{
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: 'var(--text-danger)',
              }}>
                Blocking · {blocking.length}
              </span>
              <div className="vstack" style={{
                gap: 6,
                background: 'rgba(232,118,118,0.06)',
                border: '1px solid rgba(232,118,118,0.2)',
                borderRadius: 6,
                padding: 10,
              }}>
                {blocking.map((iss, i) => (
                  <div key={i} className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <Icon name="warn" size={11} style={{ color: 'var(--text-danger)', marginTop: 2 }} />
                    <span className="text-xs" style={{ color: 'var(--text-primary)', flex: 1 }}>{iss.label}</span>
                    {iss.qid && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onJumpToQuestion(iss.qid)}>
                        Jump
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="vstack" style={{ gap: 6 }}>
              <span className="text-xs muted" style={{
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: 'var(--color-amber)',
              }}>
                Warnings · {warnings.length}
              </span>
              <div className="vstack" style={{
                gap: 6,
                background: 'rgba(242,196,109,0.06)',
                border: '1px solid rgba(242,196,109,0.2)',
                borderRadius: 6,
                padding: 10,
              }}>
                {warnings.map((iss, i) => (
                  <div key={i} className="hstack" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <Icon name="warn" size={11} style={{ color: 'var(--color-amber)', marginTop: 2 }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)', flex: 1 }}>{iss.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hstack" style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-canvas)',
          justifyContent: 'flex-end', gap: 8,
        }}>
          <Button variant="subtle" size="sm" onClick={onClose}>취소</Button>
          <Button variant="primary" size="sm" disabled={!canLaunch} onClick={onLaunch}>
            <Icon name="megaphone" size={11} />
            {canLaunch ? 'Launch' : `${blocking.length}개 항목 수정 필요`}
          </Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SurveyBuilderScreen, BUILDER_FIXTURES, SurveyPreviewPane, LaunchValidationModal });
