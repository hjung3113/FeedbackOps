// Backend-side helpers for the ADR-0012 error envelope. Maps `code` family to
// HTTP status per the table in ADR-0012:25-34. Controllers throw an HttpError
// or call `sendError` from a handler; application services raise the same
// instance and a Fastify error handler renders the envelope.

import type { ErrorCode } from '@fops/shared';
import type { FastifyReply } from 'fastify';

const STATUS_BY_PREFIX: ReadonlyArray<[string, number]> = [
  ['auth.workspace_mismatch', 403],
  ['auth.', 401],
  ['permission.', 403],
  ['not_found.', 404],
  ['conflict.', 409],
  ['validation.', 422],
  ['voc.', 422],
  ['rich_content.', 422],
  ['attachment.', 422],
  ['reporter_facing_status.', 422],
  ['rate_limited.', 429],
  ['internal.', 500],
  ['upstream.', 502],
];

export function statusForCode(code: ErrorCode): number {
  for (const [prefix, status] of STATUS_BY_PREFIX) {
    if (code.startsWith(prefix)) return status;
  }
  return 500;
}

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly detail?: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export function sendError(
  reply: FastifyReply,
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
): FastifyReply {
  const body: Record<string, unknown> = { code, message };
  if (detail !== undefined) body.detail = detail;
  return reply.code(statusForCode(code)).send(body);
}

// Slim down Zod issue payloads before they reach a client. Review HTTP-M-1:
// raw `ZodIssue` arrays leak internal field paths, discriminator codes, and
// in some Zod versions an `input` snapshot. ADR-0012:25-34 expects a stable
// `{ code, message, detail }` contract; the `detail.fields` array should
// expose only the path + error code the client needs to identify which
// field failed validation.
export type ZodIssueShape = { path?: unknown; code?: unknown };
export function fieldsFromZodIssues(issues: ReadonlyArray<ZodIssueShape>): Array<{
  path: ReadonlyArray<string | number>;
  code: string;
}> {
  return issues.map((iss) => ({
    path: Array.isArray(iss.path) ? (iss.path as Array<string | number>) : [],
    code: typeof iss.code === 'string' ? iss.code : 'invalid',
  }));
}
