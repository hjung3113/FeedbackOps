import { ADMIN_PERMISSIONS_COPY } from './admin-permissions';
import { GLOSSARY } from './glossary';
import { ROUTER_FALLBACK_COPY } from './router';

export const DOCUMENT_TITLE_COPY = {
  app: 'FeedbackOps',
  home: '홈',
  voc: {
    inbox: GLOSSARY.inbox,
    triage: 'Triage',
    my: GLOSSARY.myVocs,
    create: '새 VOC 작성',
  },
  vocClusters: 'VOC Cluster',
  findings: 'Findings',
  findingDetail: 'Finding 상세',
  tasks: {
    requests: 'Task Requests',
    backlog: 'Tasks',
    board: GLOSSARY.board,
    my: '내 Task',
    milestones: 'Milestones',
  },
  integration: {
    dashboard: '연동 액션 대시보드',
    coverage: GLOSSARY.coverage,
    links: GLOSSARY.entityLinks,
  },
  surveys: {
    list: 'Surveys',
    detail: 'Surveys',
    results: '결과',
    followUp: '후속 조치',
  },
  admin: {
    managedSystems: 'Managed System',
    analyticsAreas: 'Analytics Area',
    permissionRequests: '권한 요청 검토',
    permissionGrants: ADMIN_PERMISSIONS_COPY.activeTitle,
    settings: '워크스페이스 설정',
  },
  login: '로그인',
  notFound: ROUTER_FALLBACK_COPY.notFound.title,
  error: ROUTER_FALLBACK_COPY.error.title,
} as const;

type RouteSearch = Readonly<Record<string, unknown>>;

export function getDocumentScreenTitle(pathname: string, search: RouteSearch): string {
  if (pathname === '/home') return DOCUMENT_TITLE_COPY.home;
  if (pathname === '/vocs') {
    if (search.action === 'create') return DOCUMENT_TITLE_COPY.voc.create;
    if (search.view === 'triage') return DOCUMENT_TITLE_COPY.voc.triage;
    if (search.view === 'my') return DOCUMENT_TITLE_COPY.voc.my;
    return DOCUMENT_TITLE_COPY.voc.inbox;
  }
  if (pathname === '/voc-clusters' || /^\/voc-clusters\/[^/]+$/.test(pathname)) {
    return DOCUMENT_TITLE_COPY.vocClusters;
  }
  if (pathname === '/findings') return DOCUMENT_TITLE_COPY.findings;
  if (/^\/findings\/[^/]+$/.test(pathname)) return DOCUMENT_TITLE_COPY.findingDetail;
  if (pathname === '/tasks') {
    if (search.view === 'requests') return DOCUMENT_TITLE_COPY.tasks.requests;
    if (search.view === 'board') return DOCUMENT_TITLE_COPY.tasks.board;
    if (search.view === 'milestones') return DOCUMENT_TITLE_COPY.tasks.milestones;
    if (search.view === 'my') return DOCUMENT_TITLE_COPY.tasks.my;
    return DOCUMENT_TITLE_COPY.tasks.backlog;
  }
  if (pathname === '/integration') return DOCUMENT_TITLE_COPY.integration.dashboard;
  if (pathname === '/integration/coverage') return DOCUMENT_TITLE_COPY.integration.coverage;
  if (pathname === '/integration/links') return DOCUMENT_TITLE_COPY.integration.links;
  if (pathname === '/surveys') return DOCUMENT_TITLE_COPY.surveys.list;
  if (/^\/surveys\/[^/]+\/results$/.test(pathname)) return DOCUMENT_TITLE_COPY.surveys.results;
  if (/^\/surveys\/[^/]+\/follow-up$/.test(pathname)) {
    return DOCUMENT_TITLE_COPY.surveys.followUp;
  }
  if (/^\/surveys\/[^/]+$/.test(pathname)) return DOCUMENT_TITLE_COPY.surveys.detail;
  if (pathname === '/admin/managed-systems') return DOCUMENT_TITLE_COPY.admin.managedSystems;
  if (pathname === '/admin/analytics-areas') return DOCUMENT_TITLE_COPY.admin.analyticsAreas;
  if (pathname === '/admin/permissions/requests') {
    return DOCUMENT_TITLE_COPY.admin.permissionRequests;
  }
  if (pathname === '/admin/permissions/grants') return DOCUMENT_TITLE_COPY.admin.permissionGrants;
  if (pathname === '/admin/settings') return DOCUMENT_TITLE_COPY.admin.settings;
  if (pathname === '/login') return DOCUMENT_TITLE_COPY.login;
  return DOCUMENT_TITLE_COPY.notFound;
}
