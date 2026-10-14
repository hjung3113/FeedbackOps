import { similarityPreviewRequestSchema } from '@fops/shared';
import type { FastifyPluginAsync } from 'fastify';
import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { requireIdempotencyKey } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { SessionService } from '../../auth/session-service.js';
import type { SimilarityPreviewService } from './service.js';

export const similarityPreviewRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  workspaceId: string;
  service: SimilarityPreviewService;
  rateLimitConfig: Record<string, unknown>;
}> = async (app, opts) => {
  app.post(
    '/vocs/similarity-preview',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      config: { rateLimit: opts.rateLimitConfig as never },
    },
    async (req, reply) => {
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      const key = requireIdempotencyKey(req.headers);
      const input = similarityPreviewRequestSchema.safeParse(req.body);
      if (!input.success)
        return sendError(reply, 'validation.failed', 'invalid draft', {
          fields: fieldsFromZodIssues(input.error.issues),
        });
      try {
        const result = await opts.service.preview({ actor: session, key, input: input.data });
        return reply.header('cache-control', 'private, no-store').send(result);
      } catch (error) {
        if (error instanceof HttpError) {
          if (
            error.code.startsWith('rate_limited.') &&
            error.detail &&
            'retry_after_seconds' in error.detail
          ) {
            reply.header('Retry-After', error.detail.retry_after_seconds);
          }
          throw error;
        }
        // Never allow DB/provider exceptions to carry draft data into default error logs.
        throw new HttpError('internal.unexpected', 'preview storage failed');
      }
    },
  );
};
