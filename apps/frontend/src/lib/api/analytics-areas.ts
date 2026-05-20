// Analytics Areas registry (Slice 2 #11).

import { ApiError, type ApiErrorEnvelope } from './types';
import { UnauthenticatedError } from './auth';

export interface AnalyticsAreaDto {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterAnalyticsAreaBody {
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id?: string | null;
}

export interface UpdateAnalyticsAreaBody {
  name?: string;
  owner_team_id?: string | null;
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

export async function fetchAnalyticsAreas(options?: {
  managedSystemId?: string;
  includeArchived?: boolean;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  if (options?.includeArchived) params.set('include_archived', 'true');
  const url = `/analytics-areas${params.size ? `?${params.toString()}` : ''}`;
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) return readEnvelope(res);
  return (await res.json()) as { items: AnalyticsAreaDto[]; total: number };
}

export async function registerAnalyticsArea(
  body: RegisterAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch('/analytics-areas', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}

export async function updateAnalyticsArea(
  id: string,
  body: UpdateAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'PATCH',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/analytics-areas/${id}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}

export async function archiveAnalyticsArea(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = {};
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/analytics-areas/${id}/archive`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}
