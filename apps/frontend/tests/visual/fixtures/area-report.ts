import { areaReportLink, dashboardAreaReportSchema } from '@fops/shared';
import { COVERAGE_IDS as IDS } from './coverage';

const count = (metric: Parameters<typeof areaReportLink>[0], value: number) => ({
  count: value,
  ...(value > 0 ? { link: areaReportLink(metric, IDS.systemA, IDS.areaA) } : {}),
});
export const areaReportFixture = dashboardAreaReportSchema.parse({
  computed_at: '2026-07-20T08:00:00.000Z',
  as_of_date: '2026-07-20',
  items: [
    {
      managed_system_id: IDS.systemA,
      managed_system_name: 'Identity Platform',
      managed_system_archived: false,
      analytics_area_id: IDS.areaA,
      analytics_area_name: '인증',
      analytics_area_archived: true,
      voc: {
        total: count('voc.total', 10),
        unassigned: count('voc.unassigned', 0),
        high_no_followup: count('voc.high_no_followup', 2),
        task_link: {
          value: 0,
          total: 10,
          link: areaReportLink('voc.task_link', IDS.systemA, IDS.areaA),
        },
      },
      finding: {
        active: count('finding.active', 10),
        no_execution: count('finding.no_execution', 0),
        execution: { value: 10, total: 10 },
      },
      task: {
        in_flight: count('task.in_flight', 3),
        overdue: count('task.overdue', 2),
        by_status: Object.fromEntries(
          ['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened'].map((status) => [
            status,
            count(
              `task.${status}` as Parameters<typeof areaReportLink>[0],
              status === 'todo' ? 3 : 0,
            ),
          ]),
        ),
        released_update: { value: 0, total: 0 },
      },
      survey: {
        open: count('survey.open', 1),
        follow_up_needed: count('survey.follow_up_needed', 0),
      },
    },
    {
      managed_system_id: IDS.systemB,
      managed_system_name: 'Data Warehouse',
      managed_system_archived: true,
      analytics_area_id: null,
      analytics_area_name: null,
      analytics_area_archived: false,
      survey: {
        open: { count: 0 },
        follow_up_needed: {
          count: 2,
          link: areaReportLink('survey.follow_up_needed', IDS.systemB, null),
        },
      },
    },
  ],
  page: { has_more: true, cursor: 'page-2' },
  classification_context: [
    {
      managed_system_id: IDS.systemA,
      voc: { classified: 10, total: 10 },
      finding: { classified: 10, total: 10 },
      task: { classified: 3, total: 3 },
      survey: { classified: 1, total: 1 },
    },
    { managed_system_id: IDS.systemB, survey: { classified: 0, total: 2 } },
  ],
});
export const unclassifiedAreaReportFixture = dashboardAreaReportSchema.parse({
  ...areaReportFixture,
  items: areaReportFixture.items.slice(1),
  classification_context: areaReportFixture.classification_context.slice(1),
  page: { has_more: false },
});
