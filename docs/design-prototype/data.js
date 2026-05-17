// ============================================================
// FeedbackOps mock data
// ============================================================

const ManagedSystems = [
  { id: 'tableau', name: 'Tableau', mark: 'TB', color: '#5e6ad2' },
  { id: 'powerbi', name: 'Power BI', mark: 'PB', color: '#f2c46d' },
  { id: 'looker', name: 'Looker', mark: 'LK', color: '#02b8cc' },
  { id: 'metabase', name: 'Metabase', mark: 'MB', color: '#27a644' },
];

const AnalyticsAreas = [
  { id: 'revenue', name: 'Revenue', managedSystem: 'tableau' },
  { id: 'finance', name: 'Finance', managedSystem: 'tableau' },
  { id: 'product', name: 'Product Usage', managedSystem: 'powerbi' },
  { id: 'marketing', name: 'Marketing Attribution', managedSystem: 'looker' },
  { id: 'cs-ops', name: 'CS Operations', managedSystem: 'metabase' },
];

const Users = [
  { id: 'u-1', name: '김지원', initials: '김', color: '#5e6ad2' },
  { id: 'u-2', name: '박서연', initials: '박', color: '#8b5cf6' },
  { id: 'u-3', name: '이도윤', initials: '이', color: '#02b8cc' },
  { id: 'u-4', name: '최민서', initials: '최', color: '#27a644' },
  { id: 'u-5', name: '정하늘', initials: '정', color: '#f08a4a' },
  { id: 'u-6', name: '윤재훈', initials: '윤', color: '#eb5757' },
];

// ============================================================
// Actor identity + Managed-System grants (mock).
// Pack 8 — Effective Managed System scope union.
//
//   `scopeId === 'all'` is interpreted differently per role:
//     - Admin   → workspace-wide (every Managed System)
//     - Dev     → union of the developer's granted Managed Systems
//                  (NOT a workspace bypass; this is the intersection
//                   `workspace ∩ grants`)
//     - User    → own VOCs only (no scoped backstage)
//
// Production wires `assignedScopes` to the backend `actor.effective_scope`
// envelope; here it is hard-coded so the Tweaks panel role switcher can
// demo the difference between an Admin's `all` and a Developer's `all`.
// ============================================================
const Actors = {
  admin: { id: 'u-1', role: 'admin', assignedScopes: ['tableau', 'powerbi', 'looker', 'metabase'] },
  dev:   { id: 'u-3', role: 'dev',   assignedScopes: ['tableau', 'powerbi'] },
  user:  { id: 'u-6', role: 'user',  assignedScopes: ['tableau'] },
};

const WORKSPACE_MS_IDS = ['tableau', 'powerbi', 'looker', 'metabase'];

// Resolve the actor's effective Managed System ids for a given role.
function effectiveScopeFor(role) {
  const a = Actors[role] || Actors.admin;
  if (a.role === 'admin') return WORKSPACE_MS_IDS.slice();
  return a.assignedScopes.slice();
}

// `scopeId` may be a Managed System id, or `'all'`. Resolve to the actual
// set of MS ids the screen should filter by.
function resolveScopeMembers(scopeId, role) {
  if (scopeId && scopeId !== 'all') return [scopeId];
  return effectiveScopeFor(role);
}

// ============================================================
// VOC records
// ============================================================
const Vocs = [
  {
    id: 'VOC-2814',
    title: 'Tableau 대시보드 로딩 시 사이드 메뉴가 사라지는 문제',
    description: '재무 분석 워크북을 열면 좌측 사이드 메뉴가 일시적으로 사라집니다. 새로고침해야 다시 보입니다. Chrome 124, macOS 14에서 재현됩니다.',
    reporter: 'u-3',
    managedSystem: 'tableau',
    analyticsArea: 'finance',
    severity: 'high',
    reporterStatus: 'reviewing',     // 검토 중
    internalState: 'triaged',
    owner: 'u-1',
    createdAt: '2시간 전',
    similarCount: 4,
    linkedFindingId: null,
    linkedTaskId: null,
    sourceContext: 'Direct Use',
    nextAction: 'create_finding',
    cluster: 'cluster-load',
  },
  {
    id: 'VOC-2813',
    title: 'Power BI 임베디드 보고서가 SSO 세션 만료 시 401 에러를 던짐',
    description: '오피스365 세션이 만료된 상태에서 임베디드 리포트가 401을 던지고 재인증 안내가 없습니다.',
    reporter: 'u-2',
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    severity: 'critical',
    reporterStatus: 'assigned',
    internalState: 'assigned',
    owner: 'u-4',
    createdAt: '4시간 전',
    similarCount: 2,
    linkedFindingId: 'FIN-181',
    linkedTaskId: 'TASK-902',
    sourceContext: 'Proxy Report',
    nextAction: 'review_progress',
  },
  {
    id: 'VOC-2812',
    title: 'Looker 모델 변경 후 알림이 오지 않음',
    description: '데이터 모델 변경 시 구독자에게 알림이 가야 하는데, 최근 일주일 동안 발송이 멈췄습니다.',
    reporter: 'u-5',
    managedSystem: 'looker',
    analyticsArea: 'marketing',
    severity: 'medium',
    reporterStatus: 'received',
    internalState: 'unassigned',
    owner: null,
    createdAt: '6시간 전',
    similarCount: 0,
    linkedFindingId: null,
    linkedTaskId: null,
    sourceContext: 'Direct Use',
    nextAction: 'assign',
  },
  {
    id: 'VOC-2811',
    title: '관리자 초대 메일이 스팸함으로 분류됨',
    description: '내부 사용자 초대 메일이 Outlook 정책상 스팸으로 분류되는 사례가 늘고 있습니다.',
    reporter: 'u-6',
    managedSystem: 'tableau',
    analyticsArea: null,
    severity: 'medium',
    reporterStatus: 'reviewing',
    internalState: 'triaged',
    owner: 'u-2',
    createdAt: '어제',
    similarCount: 3,
    linkedFindingId: 'FIN-180',
    linkedTaskId: null,
    sourceContext: 'Direct Use',
    nextAction: 'request_task',
  },
  {
    id: 'VOC-2810',
    title: 'Metabase 대시보드 PDF 내보내기 시 한글 깨짐',
    description: 'PDF로 내보내면 일부 한글 셀이 □로 표시됩니다. 폰트 임베딩 이슈로 추정됩니다.',
    reporter: 'u-1',
    managedSystem: 'metabase',
    analyticsArea: 'cs-ops',
    severity: 'low',
    reporterStatus: 'received',
    internalState: 'unassigned',
    owner: null,
    createdAt: '어제',
    similarCount: 1,
    linkedFindingId: 'FIN-177',
    linkedTaskId: null,
    sourceContext: 'Direct Use',
    nextAction: 'link_area',
    // Pack 8 — unified permission_decision envelope.
    // Linked Finding sits in a Managed System the current actor can only
    // see a redacted summary of. Backend marks it summary_visible.
    permissionDecisions: {
      linkedFinding: {
        state: 'summary_visible',
        category: 'Finding · safe summary only',
        summary: 'Finding 의 제목·status·MS 만 노출. evidence body 와 의사결정 기록은 가려졌습니다.',
        requiredScope: ['metabase'],
        decisionId: 'pd-9c2a',
        evaluatedAt: '2026-05-17 09:14',
      },
    },
  },
  {
    id: 'VOC-2809',
    title: '리포트 다운로드 속도가 30초 이상 걸림',
    description: '월간 매출 리포트 다운로드가 평소 5초에서 30초 이상으로 느려졌습니다.',
    reporter: 'u-3',
    managedSystem: 'tableau',
    analyticsArea: 'revenue',
    severity: 'high',
    reporterStatus: 'progress',
    internalState: 'in_progress',
    owner: 'u-1',
    createdAt: '2일 전',
    similarCount: 7,
    linkedFindingId: 'FIN-179',
    linkedTaskId: 'TASK-901',
    sourceContext: 'Direct Use',
    nextAction: 'public_update',
  },
  {
    id: 'VOC-2808',
    title: '모바일 뷰에서 필터 패널이 잘림',
    description: 'iPad Safari에서 좌측 필터 패널이 가로로 잘려 보입니다.',
    reporter: 'u-4',
    managedSystem: 'powerbi',
    analyticsArea: 'product',
    severity: 'low',
    reporterStatus: 'resolved',
    internalState: 'done',
    owner: 'u-2',
    createdAt: '3일 전',
    similarCount: 0,
    linkedFindingId: null,
    linkedTaskId: 'TASK-880',
    sourceContext: 'Direct Use',
    nextAction: null,
  },
];

// ============================================================
// Findings
// ============================================================
const Findings = [
  {
    id: 'FIN-181',
    title: 'Power BI 임베디드 보고서의 SSO 세션 재인증 흐름 누락',
    summary: '여러 팀에서 401 응답 후 빈 화면 또는 무한 로딩을 겪고 있습니다. 임베디드 컨테이너에 세션 갱신 핸들러가 없습니다.',
    status: 'active',
    confidence: 'high',
    impact: 'high',
    managedSystem: 'powerbi',
    owner: 'u-2',
    evidenceCount: 7,
    linkedTaskId: 'TASK-902',
    linkedRequestId: 'REQ-44',
    sources: ['VOC-2813', 'VOC-2807'],
    createdAt: '오늘',
  },
  {
    id: 'FIN-180',
    title: '내부 초대 메일이 Outlook 보안 정책에서 일관되게 차단됨',
    summary: '메일 헤더의 SPF/DMARC가 새 정책과 충돌합니다. 도메인 인증 갱신과 발신 도메인 분리 필요.',
    status: 'active',
    confidence: 'medium',
    impact: 'medium',
    managedSystem: 'tableau',
    owner: 'u-2',
    evidenceCount: 3,
    linkedTaskId: null,
    linkedRequestId: 'REQ-43',
    sources: ['VOC-2811', 'cluster-invite'],
    createdAt: '어제',
  },
  {
    id: 'FIN-179',
    title: 'Tableau 매출 리포트 추출 쿼리의 인덱스 미사용',
    summary: '월간 매출 리포트가 정렬 단계에서 풀스캔을 수행합니다. 분석 영역 변경 이후 쿼리 플랜이 달라졌습니다.',
    status: 'active',
    confidence: 'high',
    impact: 'high',
    managedSystem: 'tableau',
    owner: 'u-1',
    evidenceCount: 9,
    linkedTaskId: 'TASK-901',
    linkedRequestId: 'REQ-42',
    sources: ['VOC-2809', 'survey-r-7'],
    createdAt: '2일 전',
  },
  {
    id: 'FIN-178',
    title: 'Looker 알림 워커가 토큰 만료 시 조용히 죽음',
    summary: 'cron 워커가 토큰 만료를 핸들링하지 않아 알림이 일주일째 발송되지 않았습니다.',
    status: 'draft',
    confidence: 'low',
    impact: 'medium',
    managedSystem: 'looker',
    owner: 'u-5',
    evidenceCount: 2,
    linkedTaskId: null,
    linkedRequestId: null,
    sources: ['VOC-2812'],
    createdAt: '3시간 전',
    // Pack 8 — unified permission_decision envelope.
    // Execution would land on a Task in Looker scope; current actor does
    // not hold review capability there. Backend signals request_access.
    permissionDecisions: {
      execution: {
        state: 'request_access',
        category: 'Looker Task — review capability missing',
        reason: '연결할 Task 가 Looker scope 에 있고 현재 actor 에게 task.review 권한이 없습니다. 권한을 요청하면 Workspace Admin 에게 검토 큐로 전달됩니다.',
        requiredScope: ['looker'],
        decisionId: 'pd-77be',
        evaluatedAt: '2026-05-17 08:02',
      },
    },
  },
  {
    id: 'FIN-177',
    title: 'Metabase PDF 내보내기에 한글 폰트가 임베드되지 않음',
    summary: '내보내기 워커 컨테이너에 KR 폰트가 없습니다. 운영 빌드 스크립트 보완 필요.',
    status: 'not_actionable',
    confidence: 'high',
    impact: 'low',
    managedSystem: 'metabase',
    owner: 'u-1',
    evidenceCount: 4,
    linkedTaskId: null,
    linkedRequestId: null,
    sources: ['VOC-2810'],
    createdAt: '이번 주',
  },
];

// ============================================================
// Task Requests
// ============================================================
const TaskRequests = [
  {
    id: 'REQ-44',
    title: 'Power BI 임베디드 SSO 재인증 핸들러 구현',
    findingId: 'FIN-181',
    requestedBy: 'u-2',
    managedSystem: 'powerbi',
    status: 'pending_review',
    evidenceCount: 7,
    impact: 'high',
    createdAt: '1시간 전',
    reviewer: 'u-1',
  },
  {
    id: 'REQ-43',
    title: '초대 메일 도메인 인증 갱신',
    findingId: 'FIN-180',
    requestedBy: 'u-2',
    managedSystem: 'tableau',
    status: 'needs_more_evidence',
    evidenceCount: 3,
    impact: 'medium',
    createdAt: '오늘',
    reviewer: 'u-1',
  },
  {
    id: 'REQ-42',
    title: '매출 리포트 쿼리 플랜 개선 (인덱스 힌트)',
    findingId: 'FIN-179',
    requestedBy: 'u-1',
    managedSystem: 'tableau',
    status: 'approved',
    evidenceCount: 9,
    impact: 'high',
    createdAt: '어제',
    reviewer: 'u-1',
    convertedTaskId: 'TASK-901',
  },
  {
    id: 'REQ-41',
    title: 'Looker 알림 워커 토큰 갱신 로직 추가',
    findingId: 'FIN-178',
    requestedBy: 'u-5',
    managedSystem: 'looker',
    status: 'pending_review',
    evidenceCount: 2,
    impact: 'medium',
    createdAt: '3시간 전',
    reviewer: null,
  },
  {
    id: 'REQ-40',
    title: 'iPad 필터 패널 반응형 레이아웃',
    findingId: null,
    requestedBy: 'u-4',
    managedSystem: 'powerbi',
    status: 'rejected',
    evidenceCount: 1,
    impact: 'low',
    createdAt: '3일 전',
    reviewer: 'u-1',
  },
];

// ============================================================
// Tasks
// ============================================================
const Tasks = [
  {
    id: 'TASK-902',
    title: 'Power BI 임베디드 SSO 재인증 핸들러 구현',
    status: 'doing',
    priority: 'urgent',
    assignee: 'u-4',
    managedSystem: 'powerbi',
    milestone: 'M-21 SSO Stabilization',
    findingId: 'FIN-181',
    estimate: '5d',
    updatedAt: '20분 전',
    linkedVocCount: 3,
  },
  {
    id: 'TASK-901',
    title: '매출 리포트 쿼리 플랜 개선',
    status: 'review',
    priority: 'high',
    assignee: 'u-1',
    managedSystem: 'tableau',
    milestone: 'M-19 Reporting Perf',
    findingId: 'FIN-179',
    estimate: '3d',
    updatedAt: '2시간 전',
    linkedVocCount: 7,
  },
  {
    id: 'TASK-900',
    title: 'Tableau 대시보드 사이드 메뉴 사라짐 버그',
    status: 'todo',
    priority: 'high',
    assignee: 'u-3',
    managedSystem: 'tableau',
    milestone: null,
    findingId: null,
    estimate: '2d',
    updatedAt: '오늘',
    linkedVocCount: 4,
  },
  {
    id: 'TASK-899',
    title: '주간 정기 보고서 발송 워커 리팩토링',
    status: 'backlog',
    priority: 'medium',
    assignee: 'u-5',
    managedSystem: 'looker',
    milestone: 'M-22',
    findingId: null,
    estimate: '5d',
    updatedAt: '어제',
    linkedVocCount: 3,
    // Pack 8 — unified permission_decision envelope.
    // Linked VOCs sit in a different Managed System scope; explicit
    // denial after a prior request — `denied` is final per policy.
    permissionDecisions: {
      linkedVoc: {
        state: 'denied',
        category: 'Linked VOC — outside Managed System scope',
        reason: '연결된 VOC 가 Tableau scope 에 있으며 cross-MS 열람 정책으로 명시 거부되었습니다. 정책 갱신 전에는 재요청할 수 없습니다.',
        requiredScope: ['tableau'],
        decisionId: 'pd-44d1',
        evaluatedAt: '2026-05-16 17:30',
      },
    },
  },
  {
    id: 'TASK-898',
    title: '알림 큐 모니터링 대시보드',
    status: 'backlog',
    priority: 'low',
    assignee: null,
    managedSystem: 'looker',
    milestone: null,
    findingId: null,
    estimate: '3d',
    updatedAt: '2일 전',
    linkedVocCount: 0,
  },
  {
    id: 'TASK-880',
    title: 'iPad 필터 패널 잘림 수정',
    status: 'released',
    priority: 'low',
    assignee: 'u-2',
    managedSystem: 'powerbi',
    milestone: null,
    findingId: null,
    estimate: '1d',
    updatedAt: '3일 전',
    linkedVocCount: 1,
  },
  {
    id: 'TASK-879',
    title: '대시보드 즐겨찾기 정렬 옵션',
    status: 'done',
    priority: 'medium',
    assignee: 'u-3',
    managedSystem: 'tableau',
    milestone: 'M-18',
    findingId: null,
    estimate: '2d',
    updatedAt: '4일 전',
    linkedVocCount: 0,
  },
];

// ============================================================
// Action queue rows (Home / Integration)
// ============================================================
const ActionQueues = [
  {
    id: 'q-unassigned-voc',
    reason: 'Unassigned VOC',
    detail: '담당자가 지정되지 않은 VOC가 12건 누적되어 있습니다. 우선 분류와 담당 배정이 필요합니다.',
    count: 12,
    severity: 'urgent',
    primaryAction: { label: 'Review VOCs', target: 'voc' },
    secondary: 'Bulk assign',
    icon: 'inbox',
  },
  {
    id: 'q-actionable-finding',
    reason: 'Actionable Finding without execution',
    detail: 'Active 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.',
    count: 8,
    severity: 'warn',
    primaryAction: { label: 'Request Tasks', target: 'findings' },
    secondary: 'Open queue',
    icon: 'sparkles',
  },
  {
    id: 'q-released-unresolved',
    reason: 'Released Task with unresolved VOC',
    detail: 'Task는 Released지만 연결된 Reporter-facing VOC Status가 해결됨이 아닙니다. 공개 업데이트 검토가 필요합니다.',
    count: 5,
    severity: 'warn',
    primaryAction: { label: 'Review Updates', target: 'tasks' },
    secondary: 'Open queue',
    icon: 'megaphone',
  },
  {
    id: 'q-bad-outcome',
    reason: 'Bad Outcome Survey without follow-up',
    detail: 'Negative outcome survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.',
    count: 3,
    severity: 'urgent',
    primaryAction: { label: 'Create Follow-up', target: 'integration' },
    secondary: 'View surveys',
    icon: 'pulse',
  },
  {
    id: 'q-high-severity',
    reason: 'High Severity VOC unlinked',
    detail: 'High/Critical severity인 VOC 중 Finding 연결이 없는 항목.',
    count: 4,
    severity: 'urgent',
    primaryAction: { label: 'Link Finding', target: 'voc' },
    secondary: 'Open queue',
    icon: 'alert',
  },
  {
    id: 'q-permission',
    reason: 'Permission requests awaiting review',
    detail: 'Workspace Admin 검토를 기다리는 elevated/scope 권한 요청.',
    count: 2,
    severity: 'info',
    primaryAction: { label: 'Open Requests', target: 'admin' },
    secondary: null,
    icon: 'shield',
  },
];

// ============================================================
// Coverage metrics
// ============================================================
const CoverageMetrics = [
  { id: 'voc-task', label: 'VOC linked to Task', value: 180, total: 1000, percent: 18, status: 'warn' },
  { id: 'finding-execution', label: 'Active Finding with execution', value: 23, total: 31, percent: 74, status: 'good' },
  { id: 'milestone-outcome', label: 'Milestone with outcome survey', value: 9, total: 34, percent: 26, status: 'warn' },
  { id: 'high-followup', label: 'High severity VOC follow-up SLA', value: 41, total: 47, percent: 87, status: 'good' },
  { id: 'released-update', label: 'Released Task with public update', value: 12, total: 17, percent: 70, status: 'warn' },
  { id: 'analytics-area', label: 'VOC with Analytics Area set', value: 412, total: 612, percent: 67, status: 'warn' },
];

// ============================================================
// Helpers
// ============================================================
const userById = (id) => Users.find(u => u.id === id);
const msById = (id) => ManagedSystems.find(m => m.id === id);
const areaById = (id) => AnalyticsAreas.find(a => a.id === id);
const vocById = (id) => Vocs.find(v => v.id === id);
const findingById = (id) => Findings.find(f => f.id === id);
const taskById = (id) => Tasks.find(t => t.id === id);
const requestById = (id) => TaskRequests.find(r => r.id === id);

// Pack 8 — unified permission_decision envelope accessor.
// `entity.permissionDecisions[key]` is the canonical shape; this helper
// shields screens from null-chaining and is the production seam for
// switching to a backend lookup.
function getPermissionDecision(entity, key) {
  return entity && entity.permissionDecisions && entity.permissionDecisions[key] || null;
}

const ReporterStatusLabels = {
  received: { label: '접수됨', token: 'received' },
  reviewing: { label: '검토 중', token: 'reviewing' },
  assigned: { label: '담당자 배정됨', token: 'assigned' },
  progress: { label: '처리 중', token: 'progress' },
  prep: { label: '해결 준비 중', token: 'prep' },
  resolved: { label: '해결됨', token: 'resolved' },
  reopened: { label: '다시 처리 중', token: 'reopened' },
  closed: { label: '종료됨', token: 'closed' },
};

// Pack 8 — Reporter-facing status transition rules.
// Reporter-facing status is reporter-visible copy, so transitions cannot
// arbitrary-jump. The matrix below mirrors `docs/design/04-voc-system.md`
// state machine: every public-update composer reads `allowed_next` from
// here to bound the picker, and uses `forbiddenReason` to explain why a
// transition is blocked instead of just disappearing.
//
// Production wires this to the backend `voc.next_reporter_states` envelope.
const REPORTER_STATUS_TRANSITIONS = {
  received:  { allowed: ['reviewing', 'closed'],                                forbidden: { resolved: '결과 확인 전에 해결됨으로 바꿀 수 없습니다.', prep: '먼저 검토를 시작해야 합니다.' } },
  reviewing: { allowed: ['assigned', 'progress', 'closed'],                     forbidden: { resolved: '담당자 배정 이후에 가능합니다.' } },
  assigned:  { allowed: ['progress', 'closed'],                                 forbidden: { resolved: '처리가 완료되면 가능합니다.', received: '다시 접수 상태로 돌릴 수 없습니다.' } },
  progress:  { allowed: ['prep', 'resolved', 'closed'],                         forbidden: { received: '다시 접수 상태로 돌릴 수 없습니다.' } },
  prep:      { allowed: ['resolved', 'progress', 'closed'],                     forbidden: { received: '다시 접수 상태로 돌릴 수 없습니다.' } },
  resolved:  { allowed: ['closed', 'reopened'],                                 forbidden: {} },
  reopened:  { allowed: ['progress', 'resolved', 'closed'],                     forbidden: {} },
  closed:    { allowed: ['reopened'],                                           forbidden: { resolved: '이미 종료된 건입니다. 다시 해결됨으로 되돌리려면 먼저 다시 처리 중으로 전환하세요.' } },
};

// Linked-Task gates: certain transitions require the linked Task to be
// in a specific state. Returns null if allowed, or a reason string if not.
function reporterStatusGate(next, voc, linkedTask) {
  if (next === 'resolved') {
    if (!linkedTask) return null; // No task link — manager can mark resolved manually.
    if (linkedTask.status !== 'released' && linkedTask.status !== 'done') {
      return `연결된 Task 가 ${linkedTask.status} 상태입니다. released 또는 done 이어야 해결됨으로 표시할 수 있습니다.`;
    }
  }
  return null;
}

const InternalTaskStatusLabels = {
  backlog: { label: 'Backlog', token: 'backlog' },
  todo: { label: 'Todo', token: 'todo' },
  doing: { label: 'Doing', token: 'doing' },
  review: { label: 'Review', token: 'review' },
  done: { label: 'Done', token: 'done' },
  released: { label: 'Released', token: 'released' },
  reopened: { label: 'Reopened', token: 'reopened' },
};

const TaskRequestStatusLabels = {
  pending_review: { label: 'Pending review', color: 'amber' },
  approved: { label: 'Approved', color: 'emerald' },
  rejected: { label: 'Rejected', color: 'red' },
  needs_more_evidence: { label: 'Needs evidence', color: 'amber' },
  converted: { label: 'Converted', color: 'cyan' },
};

const FindingStatusLabels = {
  draft: { label: 'Draft', color: 'muted' },
  active: { label: 'Active', color: 'lime' },
  not_actionable: { label: 'Not actionable', color: 'muted' },
  converted: { label: 'Converted', color: 'cyan' },
  archived: { label: 'Archived', color: 'muted' },
};

// Expose to window
Object.assign(window, {
  ManagedSystems, AnalyticsAreas, Users, Actors, WORKSPACE_MS_IDS,
  Vocs, Findings, TaskRequests, Tasks, ActionQueues, CoverageMetrics,
  userById, msById, areaById, vocById, findingById, taskById, requestById,
  getPermissionDecision, effectiveScopeFor, resolveScopeMembers,
  ReporterStatusLabels, InternalTaskStatusLabels, TaskRequestStatusLabels, FindingStatusLabels,
  REPORTER_STATUS_TRANSITIONS, reporterStatusGate,
});
