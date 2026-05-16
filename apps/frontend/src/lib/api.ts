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

// ── Managed Systems (Slice 2 #10) ───────────────────────────────────────

export interface ManagedSystemDto {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  external_key: string | null;
  default_owner_actor_id: string | null;
  default_owner_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterManagedSystemBody {
  slug: string;
  name: string;
  external_key?: string | null;
  default_owner_actor_id?: string | null;
  default_owner_team_id?: string | null;
}

export interface UpdateManagedSystemBody {
  name?: string;
  external_key?: string | null;
  default_owner_actor_id?: string | null;
  default_owner_team_id?: string | null;
}

async function readEnvelope(res: Response): Promise<never> {
  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
    // body wasn't JSON
  }
  throw new ApiError(res.status, envelope);
}

export async function fetchManagedSystems(options?: {
  includeArchived?: boolean;
  signal?: AbortSignal;
}): Promise<{ items: ManagedSystemDto[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set('include_archived', 'true');
  const url = `/managed-systems${params.size ? `?${params.toString()}` : ''}`;
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) return readEnvelope(res);
  return (await res.json()) as { items: ManagedSystemDto[]; total: number };
}

export async function registerManagedSystem(
  body: RegisterManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch('/managed-systems', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto;
}

export async function updateManagedSystem(
  id: string,
  body: UpdateManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'PATCH',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/managed-systems/${id}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto;
}

export async function archiveManagedSystem(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }> {
  const headers: Record<string, string> = {};
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/managed-systems/${id}/archive`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto & { cascaded_analytics_area_ids: string[] };
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
