// Permission check + permission request endpoints (issues #4, #5).
// Mirrors GET /me/permissions/check and POST /permission-requests.
// The frontend never enforces backend permissions as truth (AGENTS.md:69) —
// these types only describe what the server returned so the UI can pick a state.

import { ApiError, type ApiErrorEnvelope } from './types';
import { UnauthenticatedError } from './auth';

export type FrontendPermissionState =
  | 'approved'
  | 'blocked_non_requestable'
  | 'request_access'
  | 'pending_request'
  | 'hidden_existence'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'summary_visible';

export interface PermissionDecision {
  allow: boolean;
  via?: 'direct_grant' | 'role' | 'managed_system_scope';
  reason?: string;
  grant_id?: string;
  requestable?: Array<{ workspace_id: string; managed_system_id?: string }> | null;
}

export interface PermissionCheckResponse {
  state: FrontendPermissionState;
  decision: PermissionDecision;
}

export interface CreatePermissionRequestBody {
  requested_capability: string;
  requested_managed_system_id?: string;
  requested_object_type?: string;
  requested_object_id?: string;
  reason: string;
  requested_expiration?: string;
  source_object_type?: string;
  source_object_id?: string;
  source_action_id?: string;
  return_route_intent?: string;
}

export interface CreatePermissionRequestSuccess {
  id: string;
  status: 'pending';
  created_at: string;
}

export interface MinePermissionRequestRow {
  id: string;
  requested_capability: string;
  requested_managed_system_id: string | null;
  reason: string;
  requested_object_type: string | null;
  requested_object_id: string | null;
  source_object_type: string | null;
  source_object_id: string | null;
  source_action_id: string | null;
  status: 'pending' | 'needs_more_info';
  created_at: string;
}

export async function fetchPermissionCheck(
  capability: string,
  options?: { managedSystemId?: string; signal?: AbortSignal },
): Promise<PermissionCheckResponse> {
  const params = new URLSearchParams({ capability });
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/me/permissions/check?${params.toString()}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me/permissions/check failed: ${res.status}`);
  return (await res.json()) as PermissionCheckResponse;
}

export async function createPermissionRequest(
  body: CreatePermissionRequestBody,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<CreatePermissionRequestSuccess> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': options.idempotencyKey,
    },
    body: JSON.stringify(body),
  };
  if (options.signal) init.signal = options.signal;
  const res = await fetch('/permission-requests', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status >= 200 && res.status < 300) {
    return (await res.json()) as CreatePermissionRequestSuccess;
  }
  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
    // body wasn't JSON; keep default envelope
  }
  throw new ApiError(res.status, envelope);
}

export async function fetchPermissionRequestsMine(
  signal?: AbortSignal,
): Promise<{ requests: MinePermissionRequestRow[] }> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (signal) init.signal = signal;
  const res = await fetch('/permission-requests/mine', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/permission-requests/mine failed: ${res.status}`);
  return (await res.json()) as { requests: MinePermissionRequestRow[] };
}
