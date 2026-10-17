// Permission check + permission request endpoints (issues #4, #5).
// Mirrors GET /me/permissions/check and POST /permission-requests.
// The frontend never enforces backend permissions as truth (AGENTS.md:69) —
// these types only describe what the server returned so the UI can pick a state.

import {
  type ApprovePermissionRequest,
  type CancelPermissionRequest,
  type DirectPermissionGrant,
  type EditPermissionRequest,
  type PermissionDecisionResult,
  type PermissionGrantOptions,
  cancelPermissionRequestResultSchema,
  cancelPermissionRequestSchema,
  directPermissionGrantSchema,
  editPermissionRequestSchema,
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDecisionResultSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  permissionRequestAdminDetailSchema,
  permissionRequestOwnerDetailSchema,
  revokePermissionBodySchema,
  revokePermissionResultSchema,
  submitMoreInfoPermissionRequestResultSchema,
} from '@fops/shared';

import { UnauthenticatedError } from './auth';
import { apiRequest } from './client';
import { ApiError, type ApiErrorEnvelope } from './types';

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

export type CapabilityScope = { kind: 'all' } | { kind: 'scoped'; managed_system_ids: string[] };

export async function fetchCapabilityScope(
  capability: string,
  options?: { signal?: AbortSignal },
): Promise<{ scope: CapabilityScope }> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(
    `/me/permissions/scope?${new URLSearchParams({ capability }).toString()}`,
    init,
  );
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me/permissions/scope failed: ${res.status}`);
  return (await res.json()) as { scope: CapabilityScope };
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
  revision: number;
  requested_expiration: string | null;
  updated_at: string;
  return_route_intent: string | null;
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

// Admin workspace-wide list. 403 for non-admins → ApiError.
export interface AdminPermissionRequestRow {
  id: string;
  revision: number;
  requester_actor_id: string;
  requested_capability: string;
  requested_managed_system_id: string | null;
  requested_expiration: string | null;
  reason: string;
  status:
    | 'pending'
    | 'needs_more_info'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'revoked';
  created_at: string;
}

export type PermissionRequestReviewStatus = AdminPermissionRequestRow['status'] | 'all';

export async function fetchPermissionGrants(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/permissions/grants',
    listPermissionGrantsResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}

export async function fetchPermissionDenies(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/permissions/denies',
    listPermissionDeniesResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}

export async function revokePermission(
  kind: 'grants' | 'denies',
  id: string,
  reason: string,
  idempotencyKey: string,
) {
  const body = revokePermissionBodySchema.parse({ reason });
  const response = await apiRequest(
    'POST',
    `/permissions/${kind}/${id}/revoke`,
    revokePermissionResultSchema,
    { body, idempotencyKey },
  );
  return response.data;
}

export const permissionGrantOptionsKey = (actorId: string) =>
  ['permission-grant-options', actorId] as const;

export async function fetchPermissionGrantOptions(
  actorId: string,
  signal?: AbortSignal,
): Promise<PermissionGrantOptions> {
  const params = new URLSearchParams({ actor_id: actorId });
  const response = await apiRequest(
    'GET',
    `/permissions/grant-options?${params.toString()}`,
    permissionGrantOptionsSchema,
    signal ? { signal } : {},
  );
  return response.data;
}

export async function createDirectPermissionGrant(
  body: DirectPermissionGrant,
  idempotencyKey: string,
) {
  const parsedBody = directPermissionGrantSchema.parse(body);
  const response = await apiRequest('POST', '/permissions/grants', permissionGrantAdminItemSchema, {
    body: parsedBody,
    idempotencyKey,
  });
  return response.data;
}

export async function fetchPermissionRequestsAll(
  options?: { status?: PermissionRequestReviewStatus; signal?: AbortSignal } | AbortSignal,
): Promise<{ requests: AdminPermissionRequestRow[]; count: number }> {
  const normalized = options instanceof AbortSignal ? { signal: options } : options;
  const params = new URLSearchParams();
  if (normalized?.status) params.set('status', normalized.status);
  const init: RequestInit = { credentials: 'same-origin' };
  if (normalized?.signal) init.signal = normalized.signal;
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/permissions/requests${suffix}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) {
    let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
    try {
      envelope = (await res.json()) as ApiErrorEnvelope;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, envelope);
  }
  return (await res.json()) as { requests: AdminPermissionRequestRow[]; count: number };
}

export type PermissionRequestDecisionAction = 'approve' | 'reject' | 'need-more-info' | 'deny';

export async function decidePermissionRequest(
  id: string,
  action: PermissionRequestDecisionAction,
  reason: string,
  idempotencyKey: string,
  expectedRevision: number,
  selfApproval?: ApprovePermissionRequest['self_approval'],
  expiration?: ApprovePermissionRequest['expiration'],
  grantedManagedSystemId?: ApprovePermissionRequest['granted_managed_system_id'],
): Promise<PermissionDecisionResult> {
  const body =
    action === 'need-more-info'
      ? { expected_revision: expectedRevision, ...(reason ? { note: reason } : {}) }
      : {
          expected_revision: expectedRevision,
          ...(reason ? { reason } : {}),
          ...(action === 'approve' && grantedManagedSystemId !== undefined
            ? { granted_managed_system_id: grantedManagedSystemId }
            : {}),
          ...(action === 'approve' && expiration !== undefined ? { expiration } : {}),
          ...(action === 'approve' && selfApproval !== undefined
            ? { self_approval: selfApproval }
            : {}),
        };
  const response = await apiRequest(
    'POST',
    `/permissions/requests/${id}/${action}`,
    permissionDecisionResultSchema,
    { body, idempotencyKey },
  );
  return response.data;
}

export const permissionRequestOwnerDetailKey = (id: string) =>
  ['permission-requests', 'owner-detail', id] as const;
export const permissionRequestAdminDetailKey = (id: string) =>
  ['permission-requests', 'admin-detail', id] as const;

export async function fetchPermissionRequestOwnerDetail(id: string, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/permission-requests/${id}`,
      permissionRequestOwnerDetailSchema,
      signal ? { signal } : {},
    )
  ).data;
}
export async function fetchPermissionRequestAdminDetail(id: string, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/permissions/requests/${id}`,
      permissionRequestAdminDetailSchema,
      signal ? { signal } : {},
    )
  ).data;
}
export async function updateOwnPermissionRequest(
  id: string,
  action: 'edit' | 'supplement',
  body: EditPermissionRequest,
  idempotencyKey: string,
) {
  return (
    await apiRequest(
      action === 'edit' ? 'PATCH' : 'POST',
      `/permission-requests/${id}${action === 'supplement' ? '/submit-more-info' : ''}`,
      submitMoreInfoPermissionRequestResultSchema,
      { body: editPermissionRequestSchema.parse(body), idempotencyKey },
    )
  ).data;
}
export async function withdrawPermissionRequest(
  id: string,
  body: CancelPermissionRequest,
  idempotencyKey: string,
) {
  return (
    await apiRequest(
      'POST',
      `/permission-requests/${id}/cancel`,
      cancelPermissionRequestResultSchema,
      { body: cancelPermissionRequestSchema.parse(body), idempotencyKey },
    )
  ).data;
}
