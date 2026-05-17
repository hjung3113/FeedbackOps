// ============================================================
// FeedbackOps — Survey Preview pane + Launch validation modal
// Split from screen-survey-builder.jsx (Pack 19) for Rule 2 compliance.
// Loaded AFTER screen-survey-builder.jsx; SurveyBuilderScreen references
// these via window so file load order is enforced.
// ============================================================

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


Object.assign(window, { SurveyPreviewPane, LaunchValidationModal });
