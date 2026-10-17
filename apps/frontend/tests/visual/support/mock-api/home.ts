import type { MinePermissionRequestRow } from '@/lib/api/permissions';
import {
  answerableSurveysResponseSchema,
  cancelPermissionRequestResultSchema,
  cancelPermissionRequestSchema,
  editPermissionRequestSchema,
  submitMoreInfoPermissionRequestResultSchema,
} from '@fops/shared';
import {
  homeMyWorkRequestsFixture,
  homeOpenPermissionRequestsFixture,
  homeOwnerPermissionDetailsFixture,
} from '../../fixtures/home';
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
  const details = structuredClone(homeOwnerPermissionDetailsFixture);
  const mine: MinePermissionRequestRow[] = structuredClone(homeOpenPermissionRequestsFixture);

  return [
    {
      method: 'GET',
      path: /^\/permission-requests\/(?!mine$)([^/]+)$/,
      handle: async (route, _context, _url, match) => {
        const detail = details.find((row) => match !== true && row.id === match[1]);
        await json(
          route,
          detail ? 200 : 404,
          detail ?? { code: 'not_found.record', message: 'not found' },
        );
      },
    },
    ...(['edit', 'supplement', 'withdraw'] as const).map(
      (action): MockApiHandler => ({
        method: action === 'edit' ? 'PATCH' : 'POST',
        path:
          action === 'edit'
            ? /^\/permission-requests\/(?!mine$)([^/]+)$/
            : action === 'supplement'
              ? /^\/permission-requests\/([^/]+)\/submit-more-info$/
              : /^\/permission-requests\/([^/]+)\/cancel$/,
        handle: async (route, context, url, match) => {
          const detail = details.find((row) => match !== true && row.id === match[1]);
          if (!detail) throw new Error('Missing owner request fixture');
          const body = (
            action === 'withdraw' ? cancelPermissionRequestSchema : editPermissionRequestSchema
          ).parse(route.request().postDataJSON());
          context.postedBodies.push(body);
          context.postedRequests.push({
            body,
            pathname: url.pathname,
            idempotencyKey: await route.request().headerValue('Idempotency-Key'),
          });
          if (
            body.expected_revision !== detail.revision ||
            !detail.allowed_actions.includes(action)
          ) {
            await json(route, 409, {
              code: 'conflict.stale_write',
              message: 'stale',
              detail: { current_revision: detail.revision },
            });
            return;
          }
          if (action !== 'withdraw') {
            const update = editPermissionRequestSchema.parse(body);
            if (update.reason !== undefined) detail.reason = update.reason;
            if (update.requested_expiration !== undefined)
              detail.requested_expiration = update.requested_expiration;
            if (update.requested_managed_system_id !== undefined)
              detail.requested_managed_system_id = update.requested_managed_system_id;
          }
          detail.status = action === 'withdraw' ? 'cancelled' : 'pending';
          detail.revision += 1;
          detail.allowed_actions = action === 'withdraw' ? [] : ['edit', 'withdraw'];
          const index = mine.findIndex((row) => row.id === detail.id);
          const current = mine[index];
          if (action === 'withdraw') mine.splice(index, 1);
          else if (current)
            mine[index] = {
              ...current,
              reason: detail.reason,
              requested_expiration: detail.requested_expiration,
              requested_managed_system_id: detail.requested_managed_system_id,
              revision: detail.revision,
              status: 'pending',
            };
          await json(
            route,
            200,
            (action === 'withdraw'
              ? cancelPermissionRequestResultSchema
              : submitMoreInfoPermissionRequestResultSchema
            ).parse({
              id: detail.id,
              revision: detail.revision,
              status: detail.status,
              updated_at: detail.updated_at,
            }),
          );
        },
      }),
    ),
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
          items:
            home === 'populated' || home === 'unscoped'
              ? homeMyWorkRequestsFixture.filter(
                  (item) =>
                    new URL(route.request().url()).searchParams.get('reviewer') !== 'me' ||
                    item.assigned_reviewer_actor_id === context.reporterActorId,
                )
              : [],
        }),
    },
    {
      method: 'GET',
      path: '/permission-requests/mine',
      handle: (route) =>
        json(route, 200, {
          requests:
            home === 'populated' || home === 'unscoped'
              ? mine.filter((row) => row.status === 'pending' || row.status === 'needs_more_info')
              : [],
        }),
    },
  ];
}
