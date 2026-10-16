import { recordVocNoFollowUpRequestSchema } from '@fops/shared';
import type { FastifyPluginAsync } from 'fastify';
import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { UUID_REGEX, requireIdempotencyKey } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import type { VocRoutesOptions } from './index.js';

export const vocNoFollowUpRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  for (const method of ['POST', 'DELETE'] as const) {
    app.route({
      method,
      url: '/vocs/:id/no-follow-up',
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig
        ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } }
        : {}),
      handler: async (req, reply) => {
        const actor = req.session;
        if (!actor) throw new HttpError('internal.unexpected', 'session missing after middleware');
        const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
        const { id: vocId } = req.params as { id: string };
        if (!UUID_REGEX.test(vocId))
          return sendError(reply, 'validation.failed', 'invalid VOC id', {
            fields: [{ path: ['id'], code: 'invalid' }],
          });
        const parsed =
          method === 'POST' ? recordVocNoFollowUpRequestSchema.safeParse(req.body) : null;
        if (parsed && !parsed.success)
          return sendError(reply, 'validation.failed', 'invalid request body', {
            fields: fieldsFromZodIssues(parsed.error.issues),
          });
        if (method === 'DELETE' && req.body !== undefined)
          return sendError(reply, 'validation.failed', 'DELETE requires no body', {
            fields: [{ path: [], code: 'unexpected_field' }],
          });
        const input = parsed?.success ? parsed.data : null;
        const result = await opts.vocService.noFollowUpCommand({
          actor: {
            actor_id: actor.actor_id,
            workspace_id: actor.workspace_id,
            role_level: actor.role_level,
          },
          vocId,
          input,
          idempotencyKey,
          requestHash: hashRequestBody({ route: `voc.no-follow-up.${method}`, vocId, input }),
        });
        return reply.code(result.status).send(result.body);
      },
    });
  }
};
