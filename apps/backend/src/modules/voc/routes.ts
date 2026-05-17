// POST /vocs controller. Thin per apps/backend/AGENTS.md Layer Rules:
// HTTP parsing + forbidden-field stripping + idempotency frame; the
// service owns business rules + audit + transactions.

import type { FastifyPluginAsync } from 'fastify';

import {
  FORBIDDEN_CREATE_FIELDS,
  createVocRequestSchema,
  type CreateVocRequest,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { VocService } from './service.js';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export interface VocRoutesOptions {
  db: Db;
  sessionService: SessionService;
  vocService: VocService;
  idempotencyService: IdempotencyService;
  workspaceId: string;
  rateLimitConfig?: { mutation: Record<string, unknown> };
}

export const vocRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { db, sessionService, vocService, idempotencyService, workspaceId, rateLimitConfig } = opts;

  function requireIdempotencyKey(headers: Record<string, unknown>): string {
    const raw = headers['idempotency-key'];
    const headerKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof headerKey !== 'string' || headerKey.length === 0) {
      throw new HttpError('validation.failed', 'Idempotency-Key header required', {
        fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
      });
    }
    if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
      throw new HttpError(
        'validation.malformed_idempotency_key',
        'Idempotency-Key must be a UUIDv4',
      );
    }
    return headerKey;
  }

  app.route({
    method: 'POST',
    url: '/vocs',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 1. severity present → dedicated code (spec §8.1).
      if ('severity' in rawBody) {
        return sendError(reply, 'voc.severity_not_user_settable', 'severity is set during triage', {
          field: 'severity',
        });
      }

      // 2. Other forbidden server-resolved fields → validation.unexpected_field.
      for (const f of FORBIDDEN_CREATE_FIELDS) {
        if (f === 'severity') continue;
        if (f in rawBody) {
          return sendError(reply, 'validation.unexpected_field', `${f} is server-resolved`, {
            field: f,
          });
        }
      }

      // 3. Schema validation.
      const parsed = createVocRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const input: CreateVocRequest = parsed.data;

      // 4. Idempotency + service in one transaction (ADR-0015 protocol).
      const hash = hashRequestBody(rawBody);
      const result = await db.transaction(async (tx) => {
        const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with different request body',
          );
        }
        const envelope = await vocService.createVoc({
          tx,
          actor: { actor_id: sess.actor_id, workspace_id: sess.workspace_id },
          input,
        });
        await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
        return { status: 201, body: envelope };
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
