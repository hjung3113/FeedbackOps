// Canonical body hashing for the idempotency middleware.
// ADR-0015:71-90 mandates a deterministic `request_hash` so retries with the
// same `(actor_id, Idempotency-Key)` can be matched against the original
// payload. We canonicalize by recursively sorting object keys before
// JSON.stringify so member ordering changes ('a' first vs 'b' first) do not
// produce a hash mismatch. Arrays preserve order (semantically significant
// for the body shape the permission-request endpoint accepts).

import { createHash } from 'node:crypto';

const UNDEFINED_SENTINEL = '__fops_undefined__' as const;

export function canonicalizeJson(value: unknown): unknown {
  if (value === undefined) return UNDEFINED_SENTINEL;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalizeJson((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function hashRequestBody(body: unknown): string {
  const json = JSON.stringify(canonicalizeJson(body ?? {}));
  return createHash('sha256').update(json).digest('hex');
}
