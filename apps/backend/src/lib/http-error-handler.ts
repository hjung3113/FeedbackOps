import { errorCodeSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';

import { HttpError, type ZodIssueShape, fieldsFromZodIssues, statusForCode } from './errors.js';

// ── Error handler ─ ADR-0012 envelope ────────────────────────────────
// Runs on the ROOT Fastify instance, never inside app.register(): a
// plugin's setErrorHandler is encapsulated and would not cover sibling
// product routes.
export function registerHttpErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    // HttpError instances carry an ADR-0012 code. Use the zod enum schema
    // (closed ErrorCode union from @fops/shared) so an unknown code like
    // `internal.something_new` falls through to the generic 500 branch
    // below instead of being silently widened by a regex+`as never` cast.
    const rawCode = (err as { code?: string }).code;
    if (typeof rawCode === 'string') {
      const parsed = errorCodeSchema.safeParse(rawCode);
      if (parsed.success) {
        const status =
          err instanceof HttpError && err.statusOverride !== undefined
            ? err.statusOverride
            : statusForCode(parsed.data);
        const errDetail = (err as { detail?: Record<string, unknown> }).detail;
        // F3: `requestable_permission` belongs at the top level of ErrorEnvelope
        // (ADR-0012 / packages/shared/src/errors/codes.ts:67-71). Hoist it out
        // of `detail` when present so the wire format matches the typed contract.
        let hoisted: Record<string, unknown> | undefined;
        let cleanDetail: Record<string, unknown> | undefined = errDetail;
        if (errDetail && 'requestable_permission' in errDetail) {
          const { requestable_permission, ...rest } = errDetail;
          hoisted = requestable_permission as Record<string, unknown>;
          cleanDetail = Object.keys(rest).length > 0 ? rest : undefined;
        }
        const envelope: Record<string, unknown> = {
          code: parsed.data,
          message: err.message,
          detail: cleanDetail,
        };
        if (hoisted !== undefined) envelope.requestable_permission = hoisted;
        return reply.code(status).send(envelope);
      }
    }
    // Zod validation errors surface via fastify-type-provider-zod with
    // statusCode 400; remap to ADR-0012 envelope. Review HTTP-M-1:
    // fastify-type-provider-zod returns the raw ZodIssue array in
    // `err.validation`. Slim each entry to `{path, code}` so internal
    // field paths and discriminator codes are not exposed (CWE-209).
    const validation = (err as { validation?: unknown }).validation;
    if (validation) {
      const issues = Array.isArray(validation) ? (validation as ZodIssueShape[]) : [];
      return reply.code(422).send({
        code: 'validation.failed',
        message: err.message,
        detail: { fields: fieldsFromZodIssues(issues) },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ code: 'internal.unexpected', message: 'internal server error' });
  });
}
