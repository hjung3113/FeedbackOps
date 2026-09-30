import {
  TRIAGE_AREA_IDS,
  triageAreaActors,
  triageAreaAnalyticsAreas,
  triageAreaAnalyticsAreasResponseSchema,
  triageAreaConversationPage,
  triageAreaFindingSourceVoc,
  triageAreaReviewCandidates,
  triageAreaTriageVoc,
} from '../../fixtures/triage-analytics-area';
import { vocCreateAnalyticsAreas, vocCreatePeersByManagedSystem } from '../../fixtures/voc-create';
import {
  VOC_REVIEW_IDS,
  populatedReviewCandidates,
  populatedReviewConversationPage,
  populatedReviewVoc,
} from '../../fixtures/voc-public-update-review';
import {
  VOC_REPORTER_TASK_SUMMARY_IDS,
  reporterTaskSummaryConversationPage,
  reporterTaskSummaryVoc,
} from '../../fixtures/voc-reporter-task-summary';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from '../types';

export function createVocHandlers(context: MockApiContext): MockApiHandler[] {
  const { options } = context;
  const handlers: MockApiHandler[] = [];
  const triageScenario = options.triageAreaScenario;

  if (triageScenario) {
    handlers.push({
      method: 'GET',
      path: '/vocs',
      handle: (route) =>
        json(route, 200, {
          items: [
            triageScenario === 'triage-analytics-area-populated'
              ? triageAreaTriageVoc
              : triageAreaFindingSourceVoc,
          ],
        }),
    });

    if (
      triageScenario === 'triage-analytics-area-populated' ||
      triageScenario === 'create-finding-area-inherited'
    ) {
      handlers.push({
        method: 'GET',
        path: `/vocs/${TRIAGE_AREA_IDS.voc}`,
        handle: (route) => json(route, 200, triageAreaFindingSourceVoc),
      });
    }

    if (triageScenario === 'create-finding-area-inherited') {
      handlers.push(
        {
          method: 'GET',
          path: `/vocs/${TRIAGE_AREA_IDS.voc}/conversation`,
          handle: (route) => json(route, 200, triageAreaConversationPage),
        },
        {
          method: 'GET',
          path: `/vocs/${TRIAGE_AREA_IDS.voc}/public-update-candidates`,
          handle: (route) => json(route, 200, triageAreaReviewCandidates),
        },
      );
    }

    handlers.push(
      {
        method: 'GET',
        path: /^\/vocs\/[^/]+\/recommendations$/,
        handle: (route) => json(route, 200, { items: [], total: 0 }),
      },
      {
        method: 'GET',
        path: '/analytics-areas',
        handle: (route) =>
          json(route, 200, triageAreaAnalyticsAreasResponseSchema.parse(triageAreaAnalyticsAreas)),
      },
      {
        method: 'GET',
        path: '/actors',
        handle: (route) => json(route, 200, triageAreaActors),
      },
    );
  }

  if (options.inboxHighNoLink) {
    handlers.push({
      method: 'GET',
      path: '/vocs',
      handle: (route) => json(route, 200, { items: [populatedReviewVoc] }),
    });
  }

  if (options.vocReview) {
    handlers.push({
      method: 'GET',
      path: '/vocs',
      handle: (route) => json(route, 200, { items: [populatedReviewVoc] }),
    });
  }

  if (options.vocReporterTaskSummary) {
    handlers.push({
      method: 'GET',
      path: '/vocs',
      handle: (route) => json(route, 200, { items: [reporterTaskSummaryVoc] }),
    });
  }

  if (options.vocCreate) {
    handlers.push(
      {
        method: 'GET',
        path: '/analytics-areas',
        handle: (route) => json(route, 200, vocCreateAnalyticsAreas),
      },
      {
        method: 'GET',
        path: '/vocs/pre-submit-peers',
        handle: (route, _mockContext, url) => {
          const managedSystemId = url.searchParams.get('managed_system_id');
          return json(route, 200, {
            items: vocCreatePeersByManagedSystem.get(managedSystemId ?? '')?.items ?? [],
          });
        },
      },
    );
  }

  if (options.vocReporterTaskSummary) {
    handlers.push(
      {
        method: 'GET',
        path: `/vocs/${VOC_REPORTER_TASK_SUMMARY_IDS.voc}`,
        handle: (route) => json(route, 200, reporterTaskSummaryVoc),
      },
      {
        method: 'GET',
        path: `/vocs/${VOC_REPORTER_TASK_SUMMARY_IDS.voc}/conversation`,
        handle: (route) => json(route, 200, reporterTaskSummaryConversationPage),
      },
    );
  }

  if (options.vocReview) {
    handlers.push(
      {
        method: 'GET',
        path: `/vocs/${VOC_REVIEW_IDS.voc}`,
        handle: (route) => json(route, 200, populatedReviewVoc),
      },
      {
        method: 'GET',
        path: `/vocs/${VOC_REVIEW_IDS.voc}/conversation`,
        handle: (route) => json(route, 200, populatedReviewConversationPage),
      },
      {
        method: 'GET',
        path: `/vocs/${VOC_REVIEW_IDS.voc}/public-update-candidates`,
        handle: (route) => json(route, 200, populatedReviewCandidates),
      },
    );
  }

  if (options.inboxHighNoLink) {
    handlers.push({
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, { actors: [] }),
    });
  }

  if (options.vocReview) {
    handlers.push({
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, { actors: [] }),
    });
  }

  if (options.vocReporterTaskSummary) {
    handlers.push({
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, { actors: [] }),
    });
  }

  if (options.inboxHighNoLink) {
    handlers.push({
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, { items: [], total: 0 }),
    });
  }

  if (options.vocReview) {
    handlers.push({
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, { items: [], total: 0 }),
    });
  }

  if (options.vocReporterTaskSummary) {
    handlers.push({
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, { items: [], total: 0 }),
    });
  }

  if (options.managedSystemOwner) {
    handlers.push({
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, { items: [], total: 0 }),
    });
  }

  return handlers;
}
