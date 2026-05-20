# Slice 3 #17 — Adversarial Review Cycle 1 (codex CLI)

**Reviewer:** codex CLI 0.130.0. **Date:** 2026-05-19. **Diff:** 3431 lines.

0 BLOCKER. 2 MAJOR. 1 MINOR.

## Findings

| # | Sev | Summary | Disposition |
|---|---|---|---|
| C1-1 | MAJOR | PATCH /vocs/:id/description wired to shared `mutation` (10/min) instead of plan's 30/min reporter bucket. Test case 25 only locked the 31st-fails property, not the 1-30-succeed property. | **Resolved.** Added dedicated `reporterEdit: 30/min` tier in server.ts + fastify.d.ts. Route now uses `rateLimitConfig.reporterEdit ?? .mutation`. Case 25 tightened: asserts first 30 succeed, 31st = 429. |
| C1-2 | MAJOR | `docs/implementation/03-api-contracts.md` does not document the new endpoint contract. | **Resolved.** Added full PATCH /vocs/:id/description spec table to the VOC section: headers, body, forbidden fields, permission, state gate, optimistic concurrency, service ordering, empty-diff semantics, audit event, idempotency hash, rate limit, error codes. |
| C1-3 | MINOR | Case 8 name says `triage_state=active`, fixture sets `triaged` | **Resolved.** Renamed to `triage_state=triaged`. |

Critical service sequence verified: `selectVocForUpdate → reporter → state → If-Match → MS lock → sanitize → diff → UPDATE → audit`. ADR-0012 enum + audit detail schemas correctly wired.
