import { describe, expect, it } from 'vitest';
import {
  areaReportLink,
  dashboardAreaReportQuerySchema,
  dashboardAreaReportSchema,
} from '../dashboard.js';

const system = '10000000-0000-4000-8000-000000000001';
const area = '20000000-0000-4000-8000-000000000001';
const cases = [
  ['voc.total', '/vocs', { view: 'inbox' }],
  ['voc.unassigned', '/vocs', { view: 'inbox', tab: 'unassigned' }],
  ['voc.high_no_followup', '/vocs', { view: 'inbox', tab: 'high-no-link' }],
  ['voc.task_link', '/vocs', { view: 'inbox', tab: 'no-task' }],
  ['finding.active', '/findings', { status: 'active' }],
  ['finding.execution', '/findings', { execution: 'none' }],
  ['finding.no_execution', '/findings', { execution: 'none' }],
  ...(['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened'] as const).map(
    (status) => [`task.${status}`, '/tasks', { view: 'backlog', status }] as const,
  ),
  ['task.in_flight', '/tasks', { view: 'backlog', status_group: 'in-flight' }],
  ['task.overdue', '/tasks', { view: 'backlog', overdue: 'true' }],
  ['task.released_update', '/tasks', { view: 'backlog', public_update: 'missing' }],
  ['task.public_update_missing', '/tasks', { view: 'backlog', public_update: 'missing' }],
  ['task.reporter_update_needed', '/tasks', { view: 'backlog', reporter_update: 'needed' }],
  ['survey.open', '/surveys', { status: 'open' }],
  ['survey.follow_up_needed', '/surveys', { follow_up: 'needed' }],
] as const;

describe('Analytics Area report public contract', () => {
  it.each(cases)('%s opens its exact destination membership', (metric, pathname, filters) => {
    for (const classification of [area, null]) {
      expect(areaReportLink(metric, system, classification)).toEqual({
        pathname,
        search: {
          managedSystem: system,
          'filter.analytics_area': classification ?? 'unset',
          ...filters,
        },
      });
    }
  });
  it('accepts bounded paging and rejects unknown keys and malformed filters', () => {
    expect(dashboardAreaReportQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      dashboardAreaReportQuerySchema.parse({ limit: '1', analytics_area_id: 'unset' }),
    ).toEqual({ limit: 1, analytics_area_id: 'unset' });
    for (const query of [
      { limit: 101 },
      { limit: 0 },
      { cursor: '' },
      { analytics_area_id: 'unknown' },
      { unknown: true },
    ])
      expect(dashboardAreaReportQuerySchema.safeParse(query).success).toBe(false);
  });
  it('allows authorized empty groups while rejecting personal Survey fields', () => {
    const report = {
      computed_at: '2026-10-15T00:00:00.000Z',
      as_of_date: '2026-10-15',
      items: [
        {
          managed_system_id: system,
          managed_system_name: 'System',
          managed_system_archived: false,
          analytics_area_id: null,
          analytics_area_name: null,
          analytics_area_archived: false,
          survey: { open: { count: 0 }, follow_up_needed: { count: 0 } },
        },
      ],
      page: { has_more: false },
      classification_context: [],
    };
    expect(dashboardAreaReportSchema.safeParse(report).success).toBe(true);
    expect(
      dashboardAreaReportSchema.safeParse({
        ...report,
        items: [{ ...report.items[0], survey: { ...report.items[0]?.survey, response_count: 3 } }],
      }).success,
    ).toBe(false);
  });
});
