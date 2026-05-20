// Managed Systems registry (Slice 2 #10).

import { ApiError, type ApiErrorEnvelope } from './types';
import { UnauthenticatedError } from './auth';

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
