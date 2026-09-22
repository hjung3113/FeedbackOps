import type { FastifyRequest } from 'fastify';

// Per-route tiers (ADR-0015:11-13). Registered as helper factories the
// mutation handlers will attach in later slices. Slice 1 #3 has no
// consumer of the sensitive tier — the plumbing is in place so #4/#5
// pick it up without touching server.ts again.
//
// The key generator is injected by the caller: it closes over
// sessionService and the rate-limit actor cache, which stay in server.ts
// (lib/ must not import modules/auth).
export function buildRateLimitTiers(
  keyGenerator: (req: FastifyRequest) => Promise<string>,
): {
  mutation: Record<string, unknown>;
  sensitive: Record<string, unknown>;
  read: Record<string, unknown>;
  reporterEdit: Record<string, unknown>;
  attachmentMutation: Record<string, unknown>;
} {
  return {
    mutation: {
      max: 10,
      timeWindow: '1 minute',
      keyGenerator,
      routeGroup: 'mutation',
    },
    sensitive: {
      max: 5,
      timeWindow: '1 minute',
      keyGenerator,
      routeGroup: 'sensitive',
    },
    // TODO(F18 follow-up): add admin bypass for the read tier once the
    // admin-role detection helper lands (see plan §C3 follow-up F18).
    read: {
      max: 300,
      timeWindow: '1 minute',
      keyGenerator,
      routeGroup: 'read',
    },
    // Slice 3 #17 — Reporter pre-triage edit (PATCH /vocs/:id/description).
    // 30/min per actor (more permissive than generic `mutation: 10/min` because
    // a single edit session can produce several saves; less than read tier).
    // Plan §spec issue #17.
    reporterEdit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator,
      routeGroup: 'reporter_edit',
    },
    // PLAN-22 C3a — POST /attachments. 20/min per actor. Admin bypass is a
    // documented follow-up: it depends on the same admin-role helper called
    // out for the read tier above; once that lands, both tiers gain `skip`.
    attachmentMutation: {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator,
      routeGroup: 'attachment_mutation',
    },
  };
}
