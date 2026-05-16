// Thin fetch wrappers for the auth endpoints. Returning typed payloads keeps
// the route components free of `as unknown as` casts. Per AGENTS.md the
// frontend never enforces backend permissions; these helpers only surface
// what the server says.

export interface MeResponse {
  actor: {
    id: string;
    external_id: string;
    email: string;
    display_name: string;
    role_level: string;
  };
  workspace_id: string;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('unauthenticated');
  }
}

export async function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (signal) init.signal = signal;
  const res = await fetch('/me', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me failed: ${res.status}`);
  return (await res.json()) as MeResponse;
}

export async function mockLogin(externalId: string): Promise<MeResponse> {
  const res = await fetch('/auth/mock-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ external_id: externalId }),
  });
  if (!res.ok) throw new Error(`mock-login failed: ${res.status}`);
  return (await res.json()) as MeResponse;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

// ── Permission check (issue #4) ─────────────────────────────────────────
// Mirrors GET /me/permissions/check. The frontend never enforces backend
// permissions as truth (AGENTS.md:69) — these types only describe what the
// server returned so the UI can pick a state.

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

// ── Permission requests (issue #5) ──────────────────────────────────────

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

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ApiErrorEnvelope;
  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.status = status;
    this.envelope = envelope;
  }
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
