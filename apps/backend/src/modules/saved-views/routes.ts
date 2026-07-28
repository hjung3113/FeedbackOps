import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, HttpError, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { savedViewSurfaceSchema, type SavedViewsService } from './service.js';

const paramsSchema = z.object({ id: z.string().uuid() }).strict();
const filterSchema = z.record(z.string(), z.unknown());
const createSchema = z.object({
  surface: savedViewSurfaceSchema,
  name: z.string().trim().min(1).max(120),
  filter: filterSchema,
}).strict();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  filter: filterSchema.optional(),
}).strict().refine((value) => value.name !== undefined || value.filter !== undefined, {
  message: 'at least one field is required',
});
const listSchema = z.object({ surface: savedViewSurfaceSchema.optional() }).strict();

export const savedViewsRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  savedViewsService: SavedViewsService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}> = async (app, opts) => {
  const guard = [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)];
  const actor = (req: { session?: { actor_id: string; workspace_id: string; role_level: string } }) => {
    if (!req.session) throw new HttpError('internal.unexpected', 'session missing after middleware');
    return req.session;
  };

  app.get('/saved-views', { preHandler: guard, ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}) }, async (req, reply) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return sendError(reply, 'validation.failed', 'invalid query parameters', { fields: fieldsFromZodIssues(parsed.error.issues) });
    return reply.header('cache-control', 'private, no-cache').send(await opts.savedViewsService.list(actor(req), parsed.data.surface));
  });

  app.post('/saved-views', { preHandler: guard, ...(opts.rateLimitConfig?.mutation ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } } : {}) }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(reply, 'validation.failed', 'invalid request body', { fields: fieldsFromZodIssues(parsed.error.issues) });
    return reply.code(201).send(await opts.savedViewsService.create(actor(req), parsed.data));
  });

  app.get('/saved-views/:id', { preHandler: guard, ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}) }, async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return sendError(reply, 'validation.failed', 'invalid saved view id', { fields: fieldsFromZodIssues(params.error.issues) });
    return reply.header('cache-control', 'private, no-cache').send(await opts.savedViewsService.get(actor(req), params.data.id));
  });

  app.patch('/saved-views/:id', { preHandler: guard, ...(opts.rateLimitConfig?.mutation ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } } : {}) }, async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    const body = updateSchema.safeParse(req.body ?? {});
    if (!params.success) return sendError(reply, 'validation.failed', 'invalid saved view id', { fields: fieldsFromZodIssues(params.error.issues) });
    if (!body.success) return sendError(reply, 'validation.failed', 'invalid saved view update', { fields: fieldsFromZodIssues(body.error.issues) });
    const input = {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.filter !== undefined ? { filter: body.data.filter } : {}),
    };
    return reply.send(await opts.savedViewsService.update(actor(req), params.data.id, input));
  });

  app.delete('/saved-views/:id', { preHandler: guard, ...(opts.rateLimitConfig?.mutation ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } } : {}) }, async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return sendError(reply, 'validation.failed', 'invalid saved view id', { fields: fieldsFromZodIssues(params.error.issues) });
    await opts.savedViewsService.remove(actor(req), params.data.id);
    return reply.code(204).send();
  });
};
