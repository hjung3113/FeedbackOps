// triage-transport.ts — HTTP adapter for the VOC triage endpoints (issue #481).
// The triage HTTP calls live ONLY in this file: the panel, the command hook,
// and the react-query seam all delegate here.
//
// Forward PATCH /vocs/:id:
//   Idempotency-Key auto-minted by the API client for PATCH (D-3.5);
//   If-Match: input.ifMatch (click-time voc.updated_at);
//   AbortSignal forwarded only when the caller provides one.
// Compensating PATCH /vocs/:id:
//   EXPLICIT fresh Idempotency-Key (D-3.5) — do NOT rely on the auto-mint
//   (which would reuse the auto-generated key from the same process if called
//   too quickly). Takes no AbortSignal: the compensating PATCH must not be
//   bound to the undo AbortController.
// GET /vocs/:id:
//   No If-Match / Idempotency-Key. Signal comes only from the query context —
//   never the mutation's AbortSignal.

import { apiClient } from '@/lib/api/client';
import { buildCompensatePayload, buildPayload } from './triage-payload';
import type { TriageInput, TriageOutput, TriageSnapshot } from './triage-types';

export async function patchVocTriage(
  input: TriageInput,
  opts?: { signal?: AbortSignal },
): Promise<TriageOutput> {
  const res = await apiClient<TriageOutput>('PATCH', `/vocs/${input.vocId}`, {
    body: buildPayload(input),
    ifMatch: input.ifMatch,
    // Idempotency-Key auto-minted by the API client for PATCH (D-3.5)
    ...(opts?.signal !== undefined && { signal: opts.signal }),
  });
  return res.data;
}

/**
 * executeCompensatingPatch — fires the compensating PATCH for the undo-settled path.
 * Must be called with the snapshot captured at mutate() time.
 *
 * D-3.5: the compensating PATCH MUST use an explicit fresh Idempotency-Key — do NOT
 * rely on the auto-mint (which would reuse the auto-generated key from the same
 * process if called too quickly). Pass an explicit fresh UUID.
 */
export async function executeCompensatingPatch(snapshot: TriageSnapshot): Promise<TriageOutput> {
  const payload = buildCompensatePayload(snapshot);
  const freshKey = mintFreshKey();
  const res = await apiClient<TriageOutput>('PATCH', `/vocs/${snapshot.vocId}`, {
    body: payload,
    ifMatch: snapshot.ifMatch,
    idempotencyKey: freshKey,
  });
  return res.data;
}

function mintFreshKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getVocUpdatedAt(
  vocId: string,
  signal?: AbortSignal,
): Promise<{ updated_at?: unknown }> {
  const res = await apiClient<{ updated_at?: unknown }>('GET', `/vocs/${vocId}`, {
    ...(signal !== undefined && { signal }),
  });
  return res.data;
}
