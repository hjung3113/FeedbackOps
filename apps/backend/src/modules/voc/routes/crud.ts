// VOC module controller. Thin per apps/backend/AGENTS.md Layer Rules (#392):
// HTTP parsing + forbidden-field stripping + request-hash computation; the
// application commands own the transaction, the idempotency frame, business
// rules + audit.

import type { FastifyPluginAsync } from 'fastify';

import {
  type CreateVocRequest,
  FORBIDDEN_CREATE_FIELDS,
  FORBIDDEN_EDIT_DESCRIPTION_FIELDS,
  FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES,
  FORBIDDEN_PATCH_FIELDS,
  FORBIDDEN_PATCH_FIELD_ERROR_CODES,
  createVocRequestSchema,
  editDescriptionRequestSchema,
  getConversationQuerySchema,
  listVocsQuerySchema,
  patchVocRequestSchema,
} from '@fops/shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { requireIdempotencyKey, requireIfMatch, UUID_REGEX } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import type { ReadActorContext } from '../read-service.js';
import type { VocRoutesOptions } from './index.js';

export const vocCrudRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { sessionService, vocService, vocReadService, workspaceId, rateLimitConfig } = opts;

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
          fields: [{ path: ['severity'], code: 'unexpected_field' }],
        });
      }

      // 2. Other forbidden server-resolved fields → validation.unexpected_field.
      for (const f of FORBIDDEN_CREATE_FIELDS) {
        if (f === 'severity') continue;
        if (f in rawBody) {
          return sendError(reply, 'validation.unexpected_field', `${f} is server-resolved`, {
            fields: [{ path: [f], code: 'unexpected_field' }],
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

      // 4. Idempotent command (ADR-0015 protocol) — the transaction +
      // idempotency frame are owned by the application command.
      const hash = hashRequestBody(rawBody);
      const result = await vocService.createVocCommand({
        actor: { actor_id: sess.actor_id, workspace_id: sess.workspace_id },
        input,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  // PATCH /vocs/:id — Slice 3 #14 triage-commit route.
  // TODO(#14 follow-up): triage rate-limit bucket per spec (60/min vs shared mutation 10/min)
  app.route({
    method: 'PATCH',
    url: '/vocs/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // 1. Idempotency-Key header.
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);

      // 2. If-Match header (optimistic concurrency).
      const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);

      const params = req.params as { id: string };
      const vocId = params.id;
      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 3. Strip forbidden fields before Zod parse.
      // C10 (case-insensitivity note): the check uses `f in rawBody` which is
      // case-sensitive. A client sending e.g. `Cluster_Decision` bypasses this
      // guard but is then rejected by patchVocRequestSchema.strict() as an
      // unrecognized_keys error → validation.failed (generic), rather than the
      // precise validation.unexpected_field per-field error produced here.
      // This is acceptable — fuzzy casing is a client bug, not a spec contract.
      // The .strict() fallback ensures the field is still rejected.
      for (const f of FORBIDDEN_PATCH_FIELDS) {
        if (f in rawBody) {
          const code = FORBIDDEN_PATCH_FIELD_ERROR_CODES[f];
          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id`, {
            fields: [{ path: [f], code: 'unexpected_field' }],
          });
        }
      }

      // 4. Schema validation.
      const parsed = patchVocRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      // 5. Idempotent command — the frame (advisory lock → lookup →
      // replay/mismatch → work → record, recorded status 200) is owned by
      // the application command.
      // F6: include ifMatch in the hash so that a retry after a client-side
      // refetch (new If-Match value) is NOT deduplicated against the original
      // request — different If-Match semantically represents a different intent.
      //
      // C4 (hash-semantic note): Including ifMatch in the hash shifts the
      // idempotency contract: a client that retries the same intent with a
      // fresh If-Match (e.g. after a 409 stale_write → refetch → retry)
      // produces a different hash → 409 conflict.idempotency_key_reuse instead
      // of a cache replay. The client must therefore generate a fresh
      // Idempotency-Key for each distinct If-Match value. ADR-0015 is silent
      // on whether If-Match is "part of the body" for hashing purposes; this
      // is a #14-local decision. If a real client trips on the 409, revisit
      // with a body-only secondary hash that emits a distinct hint field
      // (e.g. detail.hint: 'if_match_changed') so the client can distinguish
      // "reused key for different intent" from "same intent, new concurrency
      // token". Filed as a follow-up concern; no action needed until then.
      const hash = hashRequestBody({ vocId, ifMatch, ...rawBody });
      const result = await vocService.updateVocCommand({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        ifMatch,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  // ── PATCH /vocs/:id/description — Slice 3 #17 Reporter pre-triage edit ───
  // Reporter-only endpoint. No admin elevation. Requires untriaged VOC.
  // Rate limit: 30/min per actor (reporterEdit bucket — separate from the
  // 10/min mutation bucket so a single edit session can fan out several saves
  // without throttling a triaging admin's separate bucket). Falls back to
  // shared mutation bucket only if the dedicated bucket isn't configured.
  app.route({
    method: 'PATCH',
    url: '/vocs/:id/description',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig
      ? {
          config: {
            rateLimit: (rateLimitConfig.reporterEdit ?? rateLimitConfig.mutation) as never,
          },
        }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // 1. Idempotency-Key header.
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);

      // 2. If-Match header (optimistic concurrency).
      const ifMatch = requireIfMatch(req.headers as Record<string, unknown>);

      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const rawBody = (req.body ?? {}) as Record<string, unknown>;

      // 3. Strip forbidden fields before Zod parse for precise per-field errors.
      // See C10 note on PATCH /vocs/:id — case-sensitive; .strict() catches
      // any case variants as validation.failed (unrecognized_keys).
      for (const f of FORBIDDEN_EDIT_DESCRIPTION_FIELDS) {
        if (f in rawBody) {
          const code = FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES[f];
          return sendError(reply, code, `${f} cannot be set via PATCH /vocs/:id/description`, {
            fields: [{ path: [f], code: 'unexpected_field' }],
          });
        }
      }

      // 4. Schema validation.
      const parsed = editDescriptionRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      // 5. Idempotent command — the frame (advisory lock → lookup →
      // replay/mismatch → work → record, recorded status 200) is owned by
      // the application command.
      // ifMatch included in hash — different If-Match = different intent.
      const hash = hashRequestBody({ vocId, ifMatch, route: 'voc.description_edit', ...rawBody });
      const result = await vocService.editVocDescriptionCommand({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
        },
        vocId,
        ifMatch,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  // ── GET /vocs — list (Slice 3 #15 C3) ─────────────────────────────────────
  //
  // NOTE: pagination with sort=severity:* and sort=reporter_facing_status:* is
  // eventually consistent. Concurrent edits to the cursor row's sort value (or
  // rows near the cursor boundary) may cause rows to be skipped or appear twice
  // across pages. Frontend stale-while-revalidate (TanStack Query) masks this;
  // integration test coverage is limited to sort=created_at:desc which is
  // monotonic. Triage view uses a pinned composite sort that is also subject
  // to this when triage_state / severity / owner mutate mid-pagination.
  app.route({
    method: 'GET',
    url: '/vocs',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const parsed = listVocsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const actor: ReadActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const result = await vocReadService.listVocs({ actor, query: parsed.data });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  // ── GET /vocs/:id — detail + ETag (Slice 3 #15 C3) ───────────────────────
  app.route({
    method: 'GET',
    url: '/vocs/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const actor: ReadActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const result = await vocReadService.getVocDetail({ actor, vocId });
      const { envelope, etag } = result;

      // ADR-0031: detail includes peer-derived similarity. A source-row ETag
      // cannot safely validate peer creation, edit, or archival, so this route
      // intentionally ignores If-None-Match until a projection-aware validator
      // is introduced.
      return reply
        .header('etag', etag)
        .header('cache-control', 'private, no-cache')
        .code(200)
        .send(envelope);
    },
  });

  // ── GET /vocs/:id/conversation — paginated conversation (Slice 3 #15 C3) ──
  app.route({
    method: 'GET',
    url: '/vocs/:id/conversation',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const parsed = getConversationQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const actor: ReadActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const result = await vocReadService.getConversation({ actor, vocId, query: parsed.data });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });
};
