// ============================================================
// FeedbackOps — Survey Result Summary
// Route: /surveys/:id/results  →  internally `survey-result` + selected id
// ============================================================
// Result summary-first per docs/design/07-survey-system.md FR-SURVEY-004/005
// and docs/frontend/ui-design-system.md (Survey Result section).
//
// Hard rules enforced here:
//   - NO "Create VOC" anywhere on this surface (forbidden label list).
//   - Allowed follow-up CTAs: Add Evidence Highlight, Create Finding,
//     Link Finding, Request Task, Attach to Existing VOC.
//   - Anonymity threshold (MVP default = 5). When a filter would drop a
//     bucket below 5 responses, we hide the bucket and surface a notice.
//   - Free-text highlights require explicit approval before they leave
//     this surface as Evidence.

// ------------------------------------------------------------
// Mock result data for SRV-21 ("Q3 매출 리포트 사용성 진단")
// In production this is /surveys/:id/results from the Survey System.
// ------------------------------------------------------------
const SURVEY_RESULT_FIXTURES = {
  'SRV-21': {
    overallScore: 6.4,
    scoreLabel: 'Mixed',
    scoreTone: 'warn',
    responseRate: 36,
    responses: 218,
    target: 600,
    completion: 84,
    avgTime: '4m 12s',
    segments: [
      { id: 'all',       name: 'All',          responses: 218 },
      { id: 'analyst',   name: 'Analyst',      responses: 102 },
      { id: 'pm',        name: 'PM',           responses: 64 },
      { id: 'leader',    name: 'Team lead',    responses: 38 },
      { id: 'finance',   name: 'Finance ops',  responses: 14 },   // below threshold!
    ],
    questions: [
      {
        id: 'q1', kind: 'rating',
        title: '월간 매출 리포트의 다운로드 속도에 만족하시나요?',
        responses: 218,
        distribution: [
          { label: '1 — Very poor', count: 64,  pct: 29.4 },
          { label: '2',             count: 71,  pct: 32.6 },
          { label: '3',             count: 38,  pct: 17.4 },
          { label: '4',             count: 27,  pct: 12.4 },
          { label: '5 — Excellent', count: 18,  pct: 8.3 },
        ],
        signal: 'high-friction',
      },
      {
        id: 'q2', kind: 'single',
        title: '리포트 사용 중 가장 자주 마주치는 문제는?',
        responses: 218,
        distribution: [
          { label: '로딩이 너무 느림',           count: 98, pct: 45.0 },
          { label: '특정 필터에서 결과가 비어있음', count: 41, pct: 18.8 },
          { label: '내보내기 실패',              count: 36, pct: 16.5 },
          { label: '권한 오류',                 count: 22, pct: 10.1 },
          { label: '기타',                     count: 21, pct: 9.6 },
        ],
      },
      {
        id: 'q3', kind: 'multiple',
        title: '대시보드에서 사용하는 기능 (복수 선택)',
        responses: 218,
        distribution: [
          { label: '필터링',     count: 197, pct: 90.4 },
          { label: '드릴다운',   count: 142, pct: 65.1 },
          { label: '내보내기',   count: 124, pct: 56.9 },
          { label: '구독',       count: 78,  pct: 35.8 },
          { label: '주석/공유',  count: 41,  pct: 18.8 },
        ],
      },
      {
        id: 'q4', kind: 'text',
        title: '한 가지만 개선된다면 무엇이길 바라시나요? (자유 응답)',
        responses: 174,
        highlights: [
          { id: 'H-9201', responseId: 'R-2049',
            quote: '"월간 매출 리포트 다운로드 속도가 느려졌고, 실패해도 알 수 없습니다."',
            who: 'Analyst', sentiment: 'negative', importance: 'high',
            status: 'approved', approvedBy: 'u-1', approvedAt: '어제' },
          { id: 'H-9183', responseId: 'R-2031',
            quote: '"필터 조합에 따라 결과가 비어있는데, 데이터가 없는 건지 쿼리가 실패한 건지 구분이 안 됩니다."',
            who: 'PM', sentiment: 'negative', importance: 'medium',
            status: 'pending' },
          { id: 'H-9177', responseId: 'R-2026',
            quote: '"내보내기는 자주 사용하는데 큰 워크북에서 30초 이상 걸려서 흐름이 끊깁니다."',
            who: 'Team lead', sentiment: 'negative', importance: 'high',
            status: 'pending' },
          { id: 'H-9162', responseId: 'R-2018', anonymous: true,
            quote: '[redacted — pending approval]',
            who: '익명 응답자', sentiment: 'neutral', importance: 'low',
            status: 'pending', protected: true },
        ],
      },
    ],
  },
};

const RESULT_NEXT_ACTIONS = [
  { id: 'add_evidence_highlight',            label: 'Add Evidence Highlight', icon: 'doc',         priority: 'primary' },
  { id: 'create_finding',                    label: 'Create Finding',         icon: 'finding',     priority: 'primary' },
  { id: 'link_finding',                      label: 'Link Finding',           icon: 'link' },
  { id: 'request_task',                      label: 'Request Task',           icon: 'task' },
  { id: 'attach_evidence_to_existing_voc',   label: '기존 VOC에 근거 연결',   icon: 'arrowRight',
    note: '응답을 기존 VOC 의 근거로 첨부 — 새 VOC 를 만들지 않습니다.' },
];

const ANONYMITY_THRESHOLD = 5;

// ============================================================
// Atoms
// ============================================================
function ResultScoreCard({ score, label, tone }) {
  const color =
    tone === 'good' ? 'var(--text-success)'  :
    tone === 'warn' ? 'var(--text-warning)'  :
    tone === 'bad'  ? 'var(--text-danger)'   : 'var(--text-primary)';
  return (
    <div className="card-nested vstack" style={{ gap: 4, padding: 16, minWidth: 140 }}>
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overall</span>
      <span className="tabular" style={{ fontSize: 32, fontWeight: 600, color, lineHeight: 1.1 }}>{score}</span>
      <span className="text-xs" style={{ color }}>{label}</span>
    </div>
  );
}

function DistributionBar({ count, pct, total, signal }) {
  // dim if below anonymity threshold
  const dim = count < ANONYMITY_THRESHOLD;
  return (
    <div style={{
      flex: 1, height: 16, background: 'var(--color-pitch-black)',
      borderRadius: 3, position: 'relative', overflow: 'hidden',
      boxShadow: 'var(--shadow-subtle)',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: signal === 'high-friction'
          ? 'linear-gradient(90deg, var(--color-warning-red), var(--color-amber))'
          : 'var(--color-aether-blue)',
        opacity: dim ? 0.3 : 0.85, borderRadius: 3,
      }} />
    </div>
  );
}

function SentimentChip({ tone }) {
  const map = {
    positive: { color: 'var(--color-emerald)',     bg: 'rgba(39,166,68,0.12)',  label: 'Positive' },
    neutral:  { color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)', label: 'Neutral' },
    negative: { color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)',  label: 'Negative' },
  };
  const m = map[tone] || map.neutral;
  return <span className="badge" style={{ background: m.bg, color: m.color }}><span className="badge-dot" />{m.label}</span>;
}

function ImportanceChip({ level }) {
  const map = {
    high:   { color: 'var(--color-warning-red)', bg: 'rgba(235,87,87,0.12)' },
    medium: { color: 'var(--color-amber)',       bg: 'rgba(242,196,109,0.12)' },
    low:    { color: 'var(--text-muted)',        bg: 'rgba(138,143,152,0.1)' },
  };
  const m = map[level] || map.medium;
  return <span className="badge" style={{ background: m.bg, color: m.color, textTransform: 'capitalize' }}>{level} importance</span>;
}

// ============================================================
// Question cards
// ============================================================
function ResultQuestionCard({ q, index, segmentBelowThreshold, segmentName }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 4 }}>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>Q{index + 1}</span>
        <OutlineBadge style={{ textTransform: 'capitalize' }}>{q.kind}</OutlineBadge>
        <span className="text-xs muted">· {q.responses} responses</span>
        {q.signal === 'high-friction' && (
          <span className="badge" style={{
            background: 'rgba(235,87,87,0.12)', color: 'var(--color-warning-red)',
          }}>
            <span className="badge-dot" />High friction
          </span>
        )}
      </div>
      <div className="text-md" style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-primary)' }}>
        {q.title}
      </div>

      {q.kind !== 'text' ? (
        <div className="vstack" style={{ gap: 6 }}>
          {q.distribution.map((d, i) => (
            <div key={i} className="hstack" style={{ gap: 10, alignItems: 'center' }}>
              <span className="text-xs" style={{
                width: 180, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{d.label}</span>
              <DistributionBar count={d.count} pct={d.pct} total={q.responses} signal={q.signal} />
              <span className="text-xs tabular" style={{
                width: 80, textAlign: 'right',
                color: d.count < ANONYMITY_THRESHOLD ? 'var(--text-muted)' : 'var(--text-primary)',
                fontWeight: 600,
              }}>
                {d.count < ANONYMITY_THRESHOLD ? '< 5' : `${d.count}`}
                <span className="muted" style={{ fontWeight: 400 }}> · {d.pct.toFixed(1)}%</span>
              </span>
            </div>
          ))}
          {q.distribution.some(d => d.count < ANONYMITY_THRESHOLD) && (
            <div className="text-xs muted hstack" style={{ gap: 6, marginTop: 4 }}>
              <Icon name="shield" size={11} />
              일부 버킷이 익명 임계값({ANONYMITY_THRESHOLD}) 미만이라 정확한 카운트가 가려졌습니다.
            </div>
          )}
        </div>
      ) : (
        <ResultTextHighlights highlights={q.highlights || []} below={segmentBelowThreshold} segmentName={segmentName} />
      )}
    </div>
  );
}

function ResultTextHighlights({ highlights, below, segmentName }) {
  // Anonymity threshold is policy-enforced privacy, not permission, but
  // the UX contract is the same — never disappear silently. Use the
  // PermissionBlockedPanel summary_visible variant so the actor sees
  // the bucket exists without leaking content.
  // (ui-design-system.md §PermissionBlockedPanel)
  if (below) {
    return (
      <PermissionBlockedPanel
        state="summary_visible"
        category="Free-text highlights · privacy-protected"
        summary={
          <div className="vstack" style={{ gap: 4 }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--color-aether-blue)' }}>{segmentName}</strong> segment 의 응답이 익명 임계값 {ANONYMITY_THRESHOLD} 미만이라
              free-text highlight 는 표시되지 않습니다.
            </span>
            <span className="text-xs muted">
              personal_response.view 권한이 있는 actor 만 raw 응답을 열람할 수 있습니다.
            </span>
          </div>
        }
      />
    );
  }
  return (
    <div className="vstack" style={{ gap: 8 }}>
      {highlights.map(h => <ResultTextHighlight key={h.id} h={h} />)}
    </div>
  );
}

function ResultTextHighlight({ h }) {
  return (
    <div className="card-nested vstack" style={{ gap: 8, padding: 12 }}>
      <div className="evidence-quote" style={{
        borderLeftColor: h.protected ? 'var(--text-muted)' : 'var(--color-amethyst)',
        opacity: h.protected ? 0.7 : 1,
      }}>
        {h.protected ? <em style={{ color: 'var(--text-muted)' }}>{h.quote}</em> : h.quote}
      </div>

      <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{h.id}</span>
        <span className="dot" />
        <span className="text-xs muted">from <span className="mono" style={{ color: 'var(--text-secondary)' }}>{h.responseId}</span></span>
        <span className="dot" />
        <span className="text-xs muted">{h.who}</span>
        <span className="dot" />
        <SentimentChip tone={h.sentiment} />
        <ImportanceChip level={h.importance} />
        {h.protected && (
          <span className="badge" style={{ background: 'rgba(138,143,152,0.1)', color: 'var(--text-muted)' }}>
            <Icon name="shield" size={10} />Identity protected
          </span>
        )}
      </div>

      <div className="hstack" style={{ gap: 6 }}>
        {h.status === 'approved' ? (
          <>
            <span className="badge" style={{
              background: 'rgba(39,166,68,0.12)', color: 'var(--text-success)',
            }}>
              <span className="badge-dot" />Approved as Evidence
            </span>
            <span className="text-xs muted">· {window.userById(h.approvedBy)?.name} · {h.approvedAt}</span>
            <div style={{ flex: 1 }} />
            <Button variant="subtle" size="sm"><Icon name="finding" size={11} />Create finding</Button>
            <Button variant="subtle" size="sm"><Icon name="link" size={11} />Attach to VOC</Button>
          </>
        ) : (
          <>
            <span className="badge" style={{
              background: 'rgba(242,196,109,0.12)', color: 'var(--color-amber)',
            }}>
              <span className="badge-dot" />Pending approval
            </span>
            {h.protected && (
              <span className="text-xs muted">· redaction + 명시적 승인 필요</span>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" disabled={h.protected}>
              <Icon name="check" size={11} />Approve as evidence
            </Button>
            <Button variant="subtle" size="sm">Reject</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Filter bar
// ============================================================
function ResultFilterBar({ segments, activeSegment, onSegmentChange, msFilter, onMsFilter, areaFilter, onAreaFilter, scope }) {
  return (
    <div className="hstack" style={{
      gap: 8, padding: '10px 24px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--surface-canvas)',
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      <span className="text-xs muted" style={{ marginRight: 4 }}>Segment</span>
      {segments.map(s => {
        const below = s.responses < ANONYMITY_THRESHOLD;
        return (
          <button key={s.id}
            onClick={() => onSegmentChange(s.id)}
            className={`btn btn-${activeSegment === s.id ? 'secondary' : 'subtle'} btn-sm`}
            style={{ position: 'relative' }}>
            {s.name}
            <span className="mono" style={{
              fontSize: 10, color: below ? 'var(--color-warning-red)' : 'var(--text-muted)',
              marginLeft: 4,
            }}>{below ? '< 5' : s.responses}</span>
          </button>
        );
      })}
      <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

      <span className="text-xs muted">Managed System</span>
      <OutlineBadge>{scope.name}</OutlineBadge>

      <span className="text-xs muted">Analytics Area</span>
      <select
        value={areaFilter}
        onChange={(e) => onAreaFilter(e.target.value)}
        style={{
          background: 'var(--surface-field)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 6,
          padding: '4px 8px', fontSize: 'var(--text-xs)',
        }}>
        <option value="all">All</option>
        {window.AnalyticsAreas.filter(a => scope.members.includes(a.managedSystem)).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      <div style={{ flex: 1 }} />
      <Button variant="subtle" size="sm" icon="download">Export</Button>
    </div>
  );
}

// ============================================================
// Screen
// ============================================================
function SurveyResultScreen({ surveyId, onNavigate, scope }) {
  const survey = window.SURVEYS.find(s => s.id === surveyId) || window.SURVEYS[0];
  const result = SURVEY_RESULT_FIXTURES[survey.id] || SURVEY_RESULT_FIXTURES['SRV-21'];

  const [segment, setSegment] = useState('all');
  const [area, setArea] = useState('all');
  const [activeFollowupFlow, setActiveFollowupFlow] = useState(null);
  const activeSegment = result.segments.find(s => s.id === segment);
  const segmentBelowThreshold = activeSegment.responses < ANONYMITY_THRESHOLD;

  const isOutcomeSurvey = survey.type === 'outcome';
  const isPoorOutcome = isOutcomeSurvey && result.overallScore < 7;
  const followupFlowByAction = {
    add_evidence_highlight: 'evidence-draft',
    create_finding: 'finding-draft',
    link_finding: 'finding-draft',
    request_task: 'task-request',
    attach_evidence_to_existing_voc: 'attach-voc',
  };
  const highlightedText = result.questions.find(q => q.kind === 'text')?.highlights?.[0]?.quote || survey.title;

  return (
    <div className="main-region">
      {/* Sticky topbar with back nav + meta */}
      <div className="hstack" style={{
        padding: '12px 24px', gap: 12,
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-canvas)',
        flexShrink: 0,
      }}>
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => onNavigate('surveys')}>Surveys</Button>
        <span className="text-xs muted">/</span>
        <span className="row-id">{survey.id}</span>
        <span className="text-sm" style={{ fontWeight: 600 }}>{survey.title}</span>
        <OutlineBadge style={{ textTransform: 'capitalize' }}>{survey.type}</OutlineBadge>
        <SurveyStatusBadge status={survey.status} />
        <ManagedSystemPill id={survey.managedSystem} />
        <div style={{ flex: 1 }} />
        <Button variant="subtle" size="sm"><Icon name="more" size={12} />Options</Button>
      </div>

      <ResultFilterBar
        segments={result.segments}
        activeSegment={segment}
        onSegmentChange={setSegment}
        areaFilter={area}
        onAreaFilter={setArea}
        scope={scope} />

      <div className="main-scroll" style={{ padding: '24px 32px 48px' }}>
        {/* Poor outcome callout near the top — per spec, recommended action
            highlighted near the result, BUT result interpretation stays
            primary. We surface it as an annotation, not a recovery queue. */}
        {isPoorOutcome && (
          <div style={{ marginBottom: 18 }}>
            <Callout tone="amber" icon="alert"
              title="Outcome 점수가 낮습니다"
              action={<Button variant="primary" size="sm"><Icon name="finding" size={11} />Create follow-up finding</Button>}>
              점수가 임계값(7) 미만입니다. Result 해석을 끝낸 다음, 권장 후속 액션으로 진행하세요.
            </Callout>
          </div>
        )}

        {/* KPI strip */}
        <div className="hstack" style={{ gap: 12, marginBottom: 18 }}>
          <ResultScoreCard score={result.overallScore} label={result.scoreLabel} tone={result.scoreTone} />
          <div className="card-nested vstack" style={{ gap: 4, padding: 16, flex: 1 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responses</span>
            <span className="text-lg tabular" style={{ fontWeight: 600 }}>{result.responses}<span className="muted" style={{ fontWeight: 400, fontSize: 14 }}> / {result.target}</span></span>
            <CoverageBar percent={result.responseRate} status={result.responseRate > 60 ? 'good' : result.responseRate > 30 ? 'warn' : 'bad'} />
          </div>
          <div className="card-nested vstack" style={{ gap: 4, padding: 16, minWidth: 120 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completion</span>
            <span className="text-lg tabular" style={{ fontWeight: 600 }}>{result.completion}%</span>
            <span className="text-xs muted">finished after start</span>
          </div>
          <div className="card-nested vstack" style={{ gap: 4, padding: 16, minWidth: 120 }}>
            <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avg duration</span>
            <span className="text-lg tabular" style={{ fontWeight: 600 }}>{result.avgTime}</span>
            <span className="text-xs muted">median time</span>
          </div>
        </div>

        {/* Forbidden + anonymity reminder strip — keeps the policy boundary
            visible without dominating the layout. */}
        <div className="hstack" style={{ gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <span className="badge" style={{
            background: 'rgba(235,87,87,0.06)', color: 'var(--color-warning-red)',
            boxShadow: 'inset 0 0 0 1px rgba(235,87,87,0.2)',
          }}>
            <Icon name="alert" size={10} />Create VOC 금지
          </span>
          <span className="badge" style={{
            background: 'rgba(94,106,210,0.08)', color: 'var(--color-aether-blue)',
            boxShadow: 'inset 0 0 0 1px rgba(94,106,210,0.2)',
          }}>
            <Icon name="shield" size={10} />Anonymity threshold = {ANONYMITY_THRESHOLD}
          </span>
          {segmentBelowThreshold && (
            <span className="badge" style={{
              background: 'rgba(242,196,109,0.12)', color: 'var(--color-amber)',
            }}>
              <Icon name="shield" size={10} />Segment 응답 {ANONYMITY_THRESHOLD} 미만 — 일부 데이터 가려짐
            </span>
          )}
        </div>

        {/* Two-column layout: questions take the bulk, actions sticky-ish on the right. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'flex-start' }}>
          <div className="vstack" style={{ gap: 14 }}>
            {result.questions.map((q, i) => (
              <ResultQuestionCard key={q.id} q={q} index={i} segmentBelowThreshold={segmentBelowThreshold} segmentName={activeSegment.name} />
            ))}
          </div>

          {/* Right column: follow-up actions panel */}
          <div className="vstack" style={{ gap: 14, position: 'sticky', top: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <PanelSectionTitle>Follow-up actions</PanelSectionTitle>
              <div className="vstack" style={{ gap: 6 }}>
                {RESULT_NEXT_ACTIONS.map(a => (
                  <button key={a.id}
                    className={`btn btn-${a.priority === 'primary' ? 'primary' : 'secondary'} btn-md`}
                    onClick={() => setActiveFollowupFlow(followupFlowByAction[a.id])}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                    <Icon name={a.icon} size={12} />
                    <span style={{ flex: 1 }}>{a.label}</span>
                  </button>
                ))}
              </div>
              {activeFollowupFlow && (
                <DesktopFlowDraftPanel
                  type={activeFollowupFlow}
                  sourceKind="Survey Result"
                  sourceId={survey.id}
                  sourceTitle={survey.title}
                  targetKind={activeFollowupFlow === 'attach-voc' ? 'VOC' : activeFollowupFlow === 'task-request' ? 'Task Request' : activeFollowupFlow === 'finding-draft' ? 'Finding' : 'Evidence Highlight'}
                  intentAction={activeFollowupFlow === 'attach-voc' ? 'Attach survey evidence to existing VOC' : activeFollowupFlow === 'task-request' ? 'Request Task' : activeFollowupFlow === 'finding-draft' ? 'Create or link Finding' : 'Add Evidence Highlight'}
                  defaultSummary={highlightedText}
                  onNavigate={onNavigate}
                  onClose={() => setActiveFollowupFlow(null)}
                />
              )}
              <div style={{ marginTop: 12 }}>
                <Callout tone="red" icon="alert" title="허용되지 않는 라벨">
                  "Create VOC", "Convert to VOC", "Generate VOC from Response", "Link Existing VOC" 라벨은
                  Survey Result 에서 사용할 수 없습니다. 응답은 위 5가지 액션으로만 처리합니다.
                </Callout>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <PanelSectionTitle>Source survey</PanelSectionTitle>
              <FieldRow label="Type"><OutlineBadge style={{ textTransform: 'capitalize' }}>{survey.type}</OutlineBadge></FieldRow>
              <FieldRow label="Status"><SurveyStatusBadge status={survey.status} /></FieldRow>
              <FieldRow label="Managed System"><ManagedSystemPill id={survey.managedSystem} /></FieldRow>
              <FieldRow label="Owner"><UserChip user={window.userById(survey.owner)} /></FieldRow>
              <FieldRow label="Updated">{survey.updatedAt}</FieldRow>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <PanelSectionTitle>Notes</PanelSectionTitle>
              <ul className="vstack" style={{ gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
                <li className="text-xs muted hstack" style={{ gap: 6 }}>
                  <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
                  Free-text 응답은 명시적 승인 후에만 evidence 로 사용됩니다.
                </li>
                <li className="text-xs muted hstack" style={{ gap: 6 }}>
                  <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
                  익명·식별 보호 응답은 redaction 처리 전에는 highlight 불가.
                </li>
                <li className="text-xs muted hstack" style={{ gap: 6 }}>
                  <Icon name="check" size={11} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} />
                  Segment·Area 필터로 응답이 5명 미만이면 자동으로 가려집니다.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SurveyResultScreen, SURVEY_RESULT_FIXTURES });
