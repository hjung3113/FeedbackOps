import {
  confirmVocClusterSuggestionRequestSchema,
  confirmVocClusterSuggestionResponseSchema,
  discardVocClusterSuggestionRequestSchema,
  discardVocClusterSuggestionResponseSchema,
  restoreVocClusterSuggestionRequestSchema,
  restoreVocClusterSuggestionResponseSchema,
  vocClusterSuggestionsResponseSchema,
} from '@fops/shared';
import { clusterSuggestionsFixture } from '../../fixtures/cluster-suggestions';
import { IDS } from '../../fixtures/voc-clusters';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createClusterSuggestionHandlers(context: MockApiContext): MockApiHandler[] {
  let items = structuredClone(
    context.options.clusterSuggestions === 'populated' ? clusterSuggestionsFixture.items : [],
  );
  const discarded = new Map<string, (typeof items)[number]>();
  return [
    {
      method: 'GET',
      path: '/voc-cluster-suggestions',
      handle: (route) =>
        json(
          route,
          200,
          vocClusterSuggestionsResponseSchema.parse(
            context.options.clusterSuggestions &&
              context.options.clusterSuggestions !== 'unavailable'
              ? { available: true, items }
              : { available: false, reason: 'provider_disabled', items: [] },
          ),
        ),
    },
    {
      method: 'POST',
      path: /^\/voc-cluster-suggestions\/([^/]+)\/(confirm|discard|restore)$/,
      handle: async (route, mockContext, url, match) => {
        if (match === true) throw new Error('Suggestion action requires captures');
        const id = match[1];
        if (!id) throw new Error('Suggestion id missing');
        const action = match[2];
        const request = route.request();
        const schema =
          action === 'confirm'
            ? confirmVocClusterSuggestionRequestSchema
            : action === 'discard'
              ? discardVocClusterSuggestionRequestSchema
              : restoreVocClusterSuggestionRequestSchema;
        const body = schema.parse(request.postDataJSON());
        const idempotencyKey = await request.headerValue('Idempotency-Key');
        if (
          !idempotencyKey ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            idempotencyKey,
          )
        )
          throw new Error('Expected a UUIDv4 key');
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({ body, idempotencyKey, pathname: url.pathname });
        const item = items.find((entry) => entry.id === id) ?? discarded.get(id);
        if (!item) throw new Error('No suggestion fixture for action');
        if (action === 'restore') {
          items = [
            ...items.filter((entry) => entry.id !== id),
            { ...item, revision: body.expected_revision + 1 },
          ];
          discarded.delete(id);
          return json(
            route,
            200,
            restoreVocClusterSuggestionResponseSchema.parse({
              id,
              revision: body.expected_revision + 1,
            }),
          );
        }
        items = items.filter((entry) => entry.id !== id);
        if (action === 'confirm')
          return json(
            route,
            201,
            confirmVocClusterSuggestionResponseSchema.parse({
              voc_cluster_id: IDS.confirmedNoFinding,
              cluster_created: true,
            }),
          );
        discarded.set(id, item);
        return json(
          route,
          200,
          discardVocClusterSuggestionResponseSchema.parse({
            id,
            revision: body.expected_revision + 1,
            discarded_at: new Date().toISOString(),
            undo_until: new Date(Date.now() + 300000).toISOString(),
          }),
        );
      },
    },
  ];
}
