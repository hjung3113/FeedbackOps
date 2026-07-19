import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { SurveysService } from './service.js';
const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = z.string().uuid();
const options = z
  .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).strict())
  .min(2)
  .max(50);
const create = z
  .object({
    type: z.enum(['discovery', 'validation', 'outcome']),
    title: z.string().min(1),
    description: z.string().optional(),
    primary_managed_system_id: uuid,
    analytics_area_id: uuid.optional(),
    operator_actor_id: uuid.optional(),
    responses_identity_protected: z.boolean(),
  })
  .strict();
const question = z
  .object({
    kind: z.enum(['single_choice', 'multiple_choice', 'rating', 'text']),
    prompt: z.string().min(1),
    is_required: z.boolean().optional(),
    options: options.optional(),
    rating_min: z.number().int().optional(),
    rating_max: z.number().int().optional(),
    rating_low_label: z.string().optional(),
    rating_high_label: z.string().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    branch_parent_question_id: uuid.optional(),
    branch_trigger_option_key: z.string().min(1).optional(),
  })
  .strict();
const responseSubmission = z
  .object({
    answers: z
      .array(
        z
          .object({
            question_id: uuid,
            value: z.union([z.string(), z.array(z.string()), z.number()]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const emptyQuery = z.object({}).strict();
const evidenceCandidate = z.object({ question_id: uuid }).strict();
const approvedExcerpt = z
  .object({ question_id: uuid, redacted_excerpt: z.string().min(1) })
  .strict();
export interface SurveysRoutesOptions {
  sessionService: SessionService;
  surveysService: SurveysService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}
function actor(req: FastifyRequest) {
  if (!req.session) throw new Error('session missing');
  return {
    actor_id: req.session.actor_id,
    workspace_id: req.session.workspace_id,
    role_level: req.session.role_level,
  } as const;
}
function key(h: Record<string, unknown>): string {
  const x = h['idempotency-key'];
  const k = Array.isArray(x) ? x[0] : x;
  if (typeof k !== 'string' || !v4.test(k))
    throw new HttpError('validation.malformed_idempotency_key', 'Idempotency-Key must be a UUIDv4');
  return k;
}
function validId(id: string): boolean {
  return uuid.safeParse(id).success;
}
export const surveysRoutes: FastifyPluginAsync<SurveysRoutesOptions> = async (app, opts) => {
  const pre = [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)];
  const rate = (kind: 'read' | 'mutation') =>
    opts.rateLimitConfig?.[kind]
      ? { config: { rateLimit: opts.rateLimitConfig[kind] as never } }
      : {};
  const parse = <T extends z.ZodTypeAny>(schema: T, body: unknown, reply: FastifyReply) => {
    const x = schema.safeParse(body ?? {});
    if (!x.success) {
      sendError(reply, 'validation.failed', 'invalid request body', {
        fields: fieldsFromZodIssues(x.error.issues),
      });
      return null;
    }
    return x.data;
  };
  app.get('/surveys', { preHandler: pre, ...rate('read') }, async (req, reply) => {
    const q = z
      .object({ managed_system_id: z.union([uuid, z.literal('all')]).optional() })
      .safeParse(req.query);
    if (!q.success)
      return sendError(reply, 'validation.failed', 'invalid query parameters', {
        fields: fieldsFromZodIssues(q.error.issues),
      });
    return reply.send(
      await opts.surveysService.listSurvey(
        actor(req),
        q.data.managed_system_id === 'all' ? undefined : q.data.managed_system_id,
      ),
    );
  });
  app.get('/surveys/:id', { preHandler: pre, ...rate('read') }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
    return reply.send(await opts.surveysService.getSurvey(actor(req), id));
  });
  app.get('/surveys/:id/form', { preHandler: pre, ...rate('read') }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
    return reply.send(await opts.surveysService.getRespondentForm(actor(req), id));
  });
  app.get('/surveys/:id/results', { preHandler: pre, ...rate('read') }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
    const q = emptyQuery.safeParse(req.query);
    if (!q.success)
      return sendError(reply, 'validation.failed', 'invalid query parameters', {
        fields: fieldsFromZodIssues(q.error.issues),
      });
    return reply.send(await opts.surveysService.getSurveyResults(actor(req), id));
  });
  app.post(
    '/survey-responses/:id/evidence-excerpt-candidates',
    { preHandler: pre, ...rate('mutation') },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
      const b = parse(evidenceCandidate, req.body, reply);
      if (!b) return;
      return reply.send(
        await opts.surveysService.readEvidenceExcerptCandidate(actor(req), id, b.question_id),
      );
    },
  );
  app.post(
    '/survey-responses/:id/approved-excerpts',
    { preHandler: pre, ...rate('mutation') },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
      const b = parse(approvedExcerpt, req.body, reply);
      if (!b) return;
      return reply
        .code(201)
        .send(await opts.surveysService.approveEvidenceExcerpt(actor(req), id, b));
    },
  );
  app.post(
    '/surveys/:id/responses',
    { preHandler: pre, ...rate('mutation') },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
      const b = parse(responseSubmission, req.body, reply);
      if (!b) return;
      const r = await opts.surveysService.submitResponse({
        actor: actor(req),
        surveyId: id,
        input: b,
        idempotencyKey: key(req.headers as Record<string, unknown>),
        requestHash: hashRequestBody({ body: b, route: 'survey.submit_response', surveyId: id }),
      });
      return reply.code(r.status).send(r.body);
    },
  );
  app.post('/surveys', { preHandler: pre, ...rate('mutation') }, async (req, reply) => {
    const b = parse(create, req.body, reply);
    if (!b) return;
    const r = await opts.surveysService.createSurvey({
      actor: actor(req),
      input: b,
      idempotencyKey: key(req.headers as Record<string, unknown>),
      requestHash: hashRequestBody({ ...b, route: 'survey.create' }),
    });
    return reply.code(r.status).send(r.body);
  });
  const qcmd = (
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    op: 'createQuestion' | 'updateQuestion' | 'deleteQuestion',
  ) =>
    app.route({
      method,
      url,
      preHandler: pre,
      ...rate('mutation'),
      handler: async (req, reply) => {
        const p = req.params as { id: string; question_id?: string };
        if (!validId(p.id) || (p.question_id && !validId(p.question_id)))
          return sendError(reply, 'validation.failed', 'id must be a valid UUID');
        const b = method === 'DELETE' ? undefined : parse(question, req.body, reply);
        if (method !== 'DELETE' && !b) return;
        const r = (await opts.surveysService[op]({
          actor: actor(req),
          surveyId: p.id,
          ...(p.question_id ? { questionId: p.question_id } : {}),
          ...(b ? { input: b } : {}),
          idempotencyKey: key(req.headers as Record<string, unknown>),
          requestHash: hashRequestBody({
            body: b ?? {},
            route: op,
            surveyId: p.id,
            questionId: p.question_id,
          }),
        } as never)) as { status: number; body: unknown };
        return reply.code(r.status).send(r.body);
      },
    });
  qcmd('POST', '/surveys/:id/questions', 'createQuestion');
  qcmd('PATCH', '/surveys/:id/questions/:question_id', 'updateQuestion');
  qcmd('DELETE', '/surveys/:id/questions/:question_id', 'deleteQuestion');
  for (const target of ['open', 'close'] as const)
    app.post(
      `/surveys/:id/${target}`,
      { preHandler: pre, ...rate('mutation') },
      async (req, reply) => {
        const id = (req.params as { id: string }).id;
        if (!validId(id)) return sendError(reply, 'validation.failed', 'id must be a valid UUID');
        const fn = target === 'open' ? 'openSurvey' : 'closeSurvey';
        const r = (await opts.surveysService[fn]({
          actor: actor(req),
          surveyId: id,
          idempotencyKey: key(req.headers as Record<string, unknown>),
          requestHash: hashRequestBody({ route: `survey.${target}`, surveyId: id }),
        } as never)) as { status: number; body: unknown };
        return reply.code(r.status).send(r.body);
      },
    );
};
