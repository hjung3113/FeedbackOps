import {
  confirmVocClusterSuggestionRequestSchema,
  discardVocClusterSuggestionRequestSchema,
  restoreVocClusterSuggestionRequestSchema,
} from '@fops/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../../lib/errors.js';
import { requireIdempotencyKey } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { SessionService } from '../../auth/session-service.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import type { VocClusterSuggestionsService } from './service.js';

interface Options {
  sessionService: SessionService;
  service: VocClusterSuggestionsService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown>; mutation?: Record<string, unknown> };
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError('validation.failed', 'Invalid Cluster suggestion request', {
      fields: result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
    });
  return result.data;
}
export const vocClusterSuggestionsRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const preHandler = [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)];
  app.get(
    '/voc-cluster-suggestions',
    {
      preHandler,
      ...(opts.rateLimitConfig?.read
        ? { config: { rateLimit: opts.rateLimitConfig.read as never } }
        : {}),
    },
    async (req, reply) => {
      const actor = req.session;
      if (!actor) throw new Error('session missing after middleware');
      const query = parse(
        z.object({ managed_system_id: z.string().uuid().optional() }).strict(),
        req.query,
      );
      const result = await opts.service.list({
        actor,
        ...(query.managed_system_id ? { managedSystemId: query.managed_system_id } : {}),
      });
      return reply.header('cache-control', 'private, no-cache').send(result);
    },
  );
  for (const action of ['confirm', 'discard', 'restore'] as const) {
    app.post(
      `/voc-cluster-suggestions/:id/${action}`,
      {
        preHandler,
        ...(opts.rateLimitConfig?.mutation
          ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } }
          : {}),
      },
      async (req, reply) => {
        const actor = req.session;
        if (!actor) throw new Error('session missing after middleware');
        const { id: rawId } = parse(z.object({ id: z.string().uuid() }), req.params);
        const id = rawId.toLowerCase();
        const key = requireIdempotencyKey(req.headers);
        const input =
          action === 'discard'
            ? parse(discardVocClusterSuggestionRequestSchema, req.body)
            : parse(
                action === 'confirm'
                  ? confirmVocClusterSuggestionRequestSchema
                  : restoreVocClusterSuggestionRequestSchema,
                req.body,
              );
        const result = await opts.service[action]({
          actor,
          id,
          key,
          input,
          requestHash: hashRequestBody({
            ...input,
            id,
            route: `/voc-cluster-suggestions/:id/${action}`,
          }),
        });
        return reply.code(result.status).send(result.body);
      },
    );
  }
};
