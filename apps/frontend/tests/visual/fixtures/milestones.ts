// Milestone visual fixtures (#514 B2a).
//
// Data mirrors docs/design-prototype/screen-milestones.jsx `Milestones` —
// title, status, source finding, Managed System, Analytics Area, owner,
// start/target dates — expressed as @fops/shared MilestoneDto shapes
// (progress is the B1c bucket shape). Display ids use the MLS- prefix the
// plan authorizes; the prototype shows M-. `source_finding` is the A9
// detail-DTO field. Schemas validate the fixtures at import.
import {
  type MilestoneDetailDto,
  type MilestoneDto,
  type TaskDto,
  listActorsResponseSchema,
  milestoneDetailDtoSchema,
  milestoneDtoSchema,
  taskDtoSchema,
} from '@fops/shared';

const WORKSPACE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';

export const MILESTONE_MANAGED_SYSTEM_IDS = {
  powerbi: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1',
  tableau: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c2',
  looker: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c3',
  metabase: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c4',
} as const;

export const MILESTONE_ANALYTICS_AREA_IDS = {
  product: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1',
  revenue: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a2',
  marketing: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a3',
  csOps: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a4',
} as const;

export const MILESTONE_ACTOR_IDS = {
  u1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  u2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  u3: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003',
  u5: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',
} as const;

export const MILESTONE_SOURCE_FINDING_IDS = {
  fin181: 'ffffffff-ffff-4fff-8fff-ffffffff0181',
} as const;

export const MILESTONE_IDS = {
  sso: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021',
  reporting: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1019',
  notification: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1022',
  pdf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1020',
  ux: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1018',
} as const;

// Same order as the prototype `Milestones` array.
const milestoneRows = [
  {
    id: MILESTONE_IDS.sso,
    workspace_id: WORKSPACE_ID,
    display_id: 'MLS-1021',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.powerbi,
    title: 'SSO Stabilization',
    why: 'Power BI 임베디드 보고서에서 SSO 세션 만료 후 재인증 흐름이 없습니다. 401 응답을 받은 사용자가 정상적인 안내 없이 빈 화면을 보고 있어, 임베디드 컨테이너 전반에 재인증 핸들러가 필요합니다.',
    status: 'in_progress',
    owner_actor_id: MILESTONE_ACTOR_IDS.u2,
    analytics_area_id: MILESTONE_ANALYTICS_AREA_IDS.product,
    start_date: '2026-05-10',
    target_date: '2026-06-15',
    created_by: MILESTONE_ACTOR_IDS.u2,
    created_at: '2026-07-21T01:00:00.000Z',
    updated_at: '2026-07-21T08:30:00.000Z',
    progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  },
  {
    id: MILESTONE_IDS.reporting,
    workspace_id: WORKSPACE_ID,
    display_id: 'MLS-1019',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.tableau,
    title: 'Reporting Performance',
    why: '월간 매출 리포트의 쿼리 플랜이 인덱스를 사용하지 않아 정렬 단계에서 풀스캔이 발생합니다. 다운로드 속도가 평소 5초에서 30초 이상으로 느려졌고, Q3 사용성 설문 응답에서도 다수 보고가 누적되었습니다.',
    status: 'in_progress',
    owner_actor_id: MILESTONE_ACTOR_IDS.u1,
    analytics_area_id: MILESTONE_ANALYTICS_AREA_IDS.revenue,
    start_date: '2026-05-04',
    target_date: '2026-05-28',
    created_by: MILESTONE_ACTOR_IDS.u1,
    created_at: '2026-07-19T04:00:00.000Z',
    updated_at: '2026-07-20T06:00:00.000Z',
    progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  },
  {
    id: MILESTONE_IDS.notification,
    workspace_id: WORKSPACE_ID,
    display_id: 'MLS-1022',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.looker,
    title: 'Notification Reliability',
    why: 'Looker 알림 워커가 토큰 만료 시 조용히 종료되어 일주일째 알림이 발송되지 않았습니다. 토큰 갱신 로직과 모니터링 큐 대시보드가 함께 필요합니다.',
    status: 'planning',
    owner_actor_id: MILESTONE_ACTOR_IDS.u5,
    analytics_area_id: MILESTONE_ANALYTICS_AREA_IDS.marketing,
    start_date: '2026-05-20',
    target_date: '2026-07-04',
    created_by: MILESTONE_ACTOR_IDS.u5,
    created_at: '2026-07-20T09:00:00.000Z',
    updated_at: '2026-07-20T09:00:00.000Z',
    progress: { released_done: 0, in_flight: 0, queued: 2, total: 2, percent: 0 },
  },
  {
    id: MILESTONE_IDS.pdf,
    workspace_id: WORKSPACE_ID,
    display_id: 'MLS-1020',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.metabase,
    title: 'Korean PDF Output',
    why: 'Metabase PDF 내보내기 워커 컨테이너에 KR 폰트가 없어 한글 셀이 깨집니다. 운영 빌드 스크립트 보완과 회귀 테스트가 필요합니다.',
    status: 'planning',
    owner_actor_id: MILESTONE_ACTOR_IDS.u1,
    analytics_area_id: MILESTONE_ANALYTICS_AREA_IDS.csOps,
    start_date: '2026-05-25',
    target_date: '2026-06-30',
    created_by: MILESTONE_ACTOR_IDS.u1,
    created_at: '2026-07-15T03:00:00.000Z',
    updated_at: '2026-07-16T03:00:00.000Z',
    progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  },
  {
    id: MILESTONE_IDS.ux,
    workspace_id: WORKSPACE_ID,
    display_id: 'MLS-1018',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.tableau,
    title: 'Q1 UX Polish',
    why: '모바일/iPad 시야에서 필터 패널 잘림, 즐겨찾기 정렬 등 가벼운 UX 잔여 이슈를 함께 정리합니다.',
    status: 'released',
    owner_actor_id: MILESTONE_ACTOR_IDS.u3,
    analytics_area_id: null,
    start_date: '2026-04-08',
    target_date: '2026-04-30',
    created_by: MILESTONE_ACTOR_IDS.u3,
    created_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    progress: { released_done: 2, in_flight: 0, queued: 0, total: 2, percent: 100 },
  },
] as const;

export const milestoneListFixture: MilestoneDto[] = milestoneRows.map((row) =>
  milestoneDtoSchema.parse(row),
);

export const milestoneDetailFixture: MilestoneDetailDto = milestoneDetailDtoSchema.parse({
  ...milestoneRows[0],
  source_finding: {
    id: MILESTONE_SOURCE_FINDING_IDS.fin181,
    display_id: 'FIN-181',
    title: 'Power BI 임베디드 보고서의 SSO 세션 재인증 흐름 누락',
    summary:
      '여러 팀에서 401 응답 후 빈 화면 또는 무한 로딩을 겪고 있습니다. 임베디드 컨테이너에 세션 갱신 핸들러가 없습니다.',
    evidence_count: 7,
  },
});

// #514 B2d-tasks — the SSO milestone's child rows for the detail panel's
// Tasks section (listTasks with milestone_id). Mirrors the prototype task
// TASK-902 (data.js Tasks): internal status doing, urgent priority, assignee,
// due date — the G-columns slot (ADR-0050 choice a); no estimate field.
export const milestoneTasksFixture: TaskDto[] = [
  taskDtoSchema.parse({
    id: '33333333-3333-4333-8333-333333330902',
    workspace_id: WORKSPACE_ID,
    display_id: 'TASK-902',
    primary_managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.powerbi,
    title: 'Power BI 임베디드 SSO 재인증 핸들러 구현',
    status: 'doing',
    priority: 'urgent',
    assignee_actor_id: MILESTONE_ACTOR_IDS.u5,
    due_date: '2026-06-15',
    milestone_id: MILESTONE_IDS.sso,
    analytics_area_id: MILESTONE_ANALYTICS_AREA_IDS.product,
    source_task_request_id: null,
    created_by: MILESTONE_ACTOR_IDS.u2,
    created_at: '2026-07-20T01:00:00.000Z',
    updated_at: '2026-07-21T08:10:00.000Z',
  }),
];

// #514 B2c — row lookups for the visual harness: names mirror the prototype
// data.js Users / ManagedSystems / AnalyticsAreas catalogue so rows resolve
// owner avatars, Managed System pills, and Analytics Area badges instead of
// raw UUIDs. Shapes match the frontend clients (managed-systems.ts,
// analytics-areas.ts); actors validate against the shared schema.
export const milestoneActorsFixture = listActorsResponseSchema.parse({
  actors: [
    {
      id: MILESTONE_ACTOR_IDS.u1,
      display_name: '김지원',
      email: 'u1@example.test',
      role_level: 'admin',
    },
    {
      id: MILESTONE_ACTOR_IDS.u2,
      display_name: '박서연',
      email: 'u2@example.test',
      role_level: 'developer',
    },
    {
      id: MILESTONE_ACTOR_IDS.u3,
      display_name: '이도윤',
      email: 'u3@example.test',
      role_level: 'developer',
    },
    {
      id: MILESTONE_ACTOR_IDS.u5,
      display_name: '정하늘',
      email: 'u5@example.test',
      role_level: 'developer',
    },
  ],
});

const LOOKUP_TIMESTAMP = '2026-07-01T00:00:00.000Z';

export const milestoneManagedSystemsFixture: {
  items: Array<{
    id: string;
    workspace_id: string;
    slug: string;
    name: string;
    external_key: null;
    default_owner_actor_id: null;
    default_owner_team_id: null;
    archived_at: null;
    archived_by_actor_id: null;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
} = {
  items: [
    {
      id: MILESTONE_MANAGED_SYSTEM_IDS.tableau,
      workspace_id: WORKSPACE_ID,
      slug: 'tableau',
      name: 'Tableau',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_MANAGED_SYSTEM_IDS.powerbi,
      workspace_id: WORKSPACE_ID,
      slug: 'powerbi',
      name: 'Power BI',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_MANAGED_SYSTEM_IDS.looker,
      workspace_id: WORKSPACE_ID,
      slug: 'looker',
      name: 'Looker',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_MANAGED_SYSTEM_IDS.metabase,
      workspace_id: WORKSPACE_ID,
      slug: 'metabase',
      name: 'Metabase',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
  ],
  total: 4,
};

export const milestoneAnalyticsAreasFixture: {
  items: Array<{
    id: string;
    workspace_id: string;
    managed_system_id: string;
    slug: string;
    name: string;
    owner_team_id: null;
    archived_at: null;
    archived_by_actor_id: null;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
} = {
  items: [
    {
      id: MILESTONE_ANALYTICS_AREA_IDS.revenue,
      workspace_id: WORKSPACE_ID,
      managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.tableau,
      slug: 'revenue',
      name: 'Revenue',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_ANALYTICS_AREA_IDS.product,
      workspace_id: WORKSPACE_ID,
      managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.powerbi,
      slug: 'product-usage',
      name: 'Product Usage',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_ANALYTICS_AREA_IDS.marketing,
      workspace_id: WORKSPACE_ID,
      managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.looker,
      slug: 'marketing-attribution',
      name: 'Marketing Attribution',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
    {
      id: MILESTONE_ANALYTICS_AREA_IDS.csOps,
      workspace_id: WORKSPACE_ID,
      managed_system_id: MILESTONE_MANAGED_SYSTEM_IDS.metabase,
      slug: 'cs-operations',
      name: 'CS Operations',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: LOOKUP_TIMESTAMP,
      updated_at: LOOKUP_TIMESTAMP,
    },
  ],
  total: 4,
};
