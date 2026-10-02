import {
  surveyFollowUpReadVisualFixture,
  surveyFollowUpResultsVisualFixture,
  surveyFollowUpVisualFixture,
  surveyFollowUpVisualListFixture,
  surveyResultsFollowUpReadVisualFixture,
} from '../../fixtures/survey-follow-up';
import {
  surveyParticipationAnswerableFixture,
  surveyParticipationEmptyFixture,
  surveyParticipationHistoryFixture,
  surveyParticipationId,
  surveyRespondentFormFixture,
  surveyResponseSubmittedFixture,
} from '../../fixtures/survey-participation';
import {
  surveyResultVisualFixture,
  surveyResultVisualListFixture,
  surveyResultsFixtureFor,
  surveyResultsNonOutcomeVisualFixture,
  surveyResultsNonOutcomeVisualListFixture,
  surveyResultsSurveyFixture,
} from '../../fixtures/survey-results';
import {
  surveyBuilderDragOverVisualFixture,
  surveyDetailVisualFixture,
  surveyEmptyBuilderVisualFixture,
  surveyVisualActorsFixture,
  surveyVisualFixture,
  surveyVisualFixtureSchema,
  surveyVisualManagedSystemsFixture,
} from '../../fixtures/surveys';
import { errorEnvelope, json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createSurveyActorHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.surveyScenario) return [];

  return [
    {
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, surveyVisualActorsFixture),
    },
  ];
}

export function createSurveyHandlers(context: MockApiContext): MockApiHandler[] {
  const { options } = context;
  const handlers: MockApiHandler[] = [];

  if (options.surveyParticipationScenario) {
    const empty = options.surveyParticipationScenario === 'empty';
    handlers.push(
      {
        method: 'GET',
        path: '/me/answerable-surveys',
        handle: (route) =>
          json(
            route,
            200,
            empty ? surveyParticipationEmptyFixture : surveyParticipationAnswerableFixture,
          ),
      },
      {
        method: 'GET',
        path: '/me/survey-responses',
        handle: (route) =>
          json(
            route,
            200,
            empty ? { items: [], page: { has_more: false } } : surveyParticipationHistoryFixture,
          ),
      },
      {
        method: 'GET',
        path: `/surveys/${surveyParticipationId}/form`,
        handle: (route) => json(route, 200, surveyRespondentFormFixture),
      },
      {
        method: 'POST',
        path: `/surveys/${surveyParticipationId}/responses`,
        handle: (route, mockContext) => {
          mockContext.postedBodies.push(route.request().postDataJSON());
          return json(route, 201, surveyResponseSubmittedFixture);
        },
      },
    );
  }

  if (options.surveyScenario) {
    handlers.push({
      method: 'GET',
      path: '/surveys',
      handle: (route) => {
        const scenario = options.surveyScenario;
        const fixture = scenario === 'detail' ? surveyDetailVisualFixture : surveyVisualFixture;
        return json(
          route,
          scenario === 'error' ? 500 : 200,
          scenario === 'error'
            ? errorEnvelope(500)
            : scenario === 'empty' || scenario === 'empty-no-permission'
              ? []
              : [surveyVisualFixtureSchema.parse(fixture)],
        );
      },
    });
  }

  if (options.surveyResultsScenario) {
    const scenario = options.surveyResultsScenario;
    handlers.push({
      method: 'GET',
      path: '/surveys',
      handle: (route) =>
        json(
          route,
          200,
          scenario === 'non-outcome'
            ? surveyResultsNonOutcomeVisualListFixture
            : surveyResultVisualListFixture,
        ),
    });
    handlers.push({
      method: 'GET',
      path: `/surveys/${surveyResultVisualFixture.id}`,
      handle: (route) =>
        json(
          route,
          200,
          scenario === 'non-outcome'
            ? surveyResultsNonOutcomeVisualFixture
            : surveyResultsSurveyFixture,
        ),
    });
    handlers.push(
      {
        method: 'GET',
        path: `/surveys/${surveyResultVisualFixture.id}/results`,
        handle: (route) => json(route, 200, surveyResultsFixtureFor(scenario)),
      },
      {
        method: 'GET',
        path: `/surveys/${surveyResultVisualFixture.id}/outcome-follow-up`,
        handle: (route) => json(route, 200, surveyResultsFollowUpReadVisualFixture),
      },
    );
  }

  if (options.surveyFollowUp) {
    handlers.push(
      {
        method: 'GET',
        path: '/surveys',
        handle: (route) => json(route, 200, surveyFollowUpVisualListFixture),
      },
      {
        method: 'GET',
        path: `/surveys/${surveyFollowUpVisualFixture.id}`,
        handle: (route) => json(route, 200, surveyFollowUpVisualFixture),
      },
      {
        method: 'GET',
        path: `/surveys/${surveyFollowUpVisualFixture.id}/outcome-follow-up`,
        handle: (route) => json(route, 200, surveyFollowUpReadVisualFixture),
      },
      {
        method: 'GET',
        path: `/surveys/${surveyFollowUpVisualFixture.id}/results`,
        handle: (route) => json(route, 200, surveyFollowUpResultsVisualFixture),
      },
    );
  }

  if (options.surveyScenario) {
    handlers.push({
      method: 'GET',
      path: `/surveys/${surveyVisualFixture.id}`,
      handle: (route) => {
        const fixture =
          options.surveyScenario === 'detail'
            ? surveyDetailVisualFixture
            : options.surveyScenario === 'builder-empty'
              ? surveyEmptyBuilderVisualFixture
              : options.surveyScenario === 'builder-drag-over'
                ? surveyBuilderDragOverVisualFixture
                : surveyVisualFixture;
        return json(route, 200, surveyVisualFixtureSchema.parse(fixture));
      },
    });
  }

  return handlers;
}

export function createSurveyManagedSystemHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.surveyScenario) return [];

  return [
    {
      method: 'GET',
      path: '/managed-systems',
      handle: (route) => json(route, 200, surveyVisualManagedSystemsFixture),
    },
  ];
}
