import { answerableSurveysResponseSchema } from '@fops/shared';
import { homeMyWorkRequestsFixture, homeOpenPermissionRequestsFixture } from '../../fixtures/home';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

const homeAnswerableSurveysFixture = answerableSurveysResponseSchema.parse({
  items: [
    {
      survey_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      display_id: 'SRV-21',
      title: 'Q3 매출 리포트 사용성 진단',
      type: 'discovery',
      question_count: 3,
      opened_at: '2026-07-21T00:00:00.000Z',
    },
    {
      survey_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      display_id: 'SRV-20',
      title: 'SSO 재인증 흐름 변경 — Outcome',
      type: 'outcome',
      question_count: 4,
      opened_at: '2026-07-20T00:00:00.000Z',
    },
  ],
  page: { has_more: false },
});

const emptyAnswerableSurveysFixture = answerableSurveysResponseSchema.parse({
  items: [],
  page: { has_more: false },
});

export function createHomeRequestHandlers(context: MockApiContext): MockApiHandler[] {
  const { home } = context.options;
  if (!home) return [];

  return [
    {
      method: 'GET',
      path: '/me/answerable-surveys',
      handle: (route) =>
        json(
          route,
          200,
          home === 'populated' ? homeAnswerableSurveysFixture : emptyAnswerableSurveysFixture,
        ),
    },
    {
      method: 'GET',
      path: '/task-requests',
      handle: (route) =>
        json(route, 200, {
          items: home === 'populated' || home === 'unscoped' ? homeMyWorkRequestsFixture : [],
        }),
    },
    {
      method: 'GET',
      path: '/permission-requests/mine',
      handle: (route) =>
        json(route, 200, {
          requests:
            home === 'populated' || home === 'unscoped' ? homeOpenPermissionRequestsFixture : [],
        }),
    },
  ];
}
