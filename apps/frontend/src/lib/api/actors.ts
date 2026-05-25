// Actor / team identity resolution (issue #87).
// GET /actors/resolve?actor_ids=...&team_ids=... → display names for owner chips.
// The frontend uses this purely for presentation; it never gates behavior on it.

import { UnauthenticatedError } from './auth';

export interface ResolvedActor {
  id: string;
  display_name: string;
  email: string;
}

export interface ResolvedTeam {
  id: string;
  name: string;
}

export interface ResolveActorsResponse {
  actors: ResolvedActor[];
  teams: ResolvedTeam[];
}

export async function resolveActors(
  params: { actorIds?: string[]; teamIds?: string[] },
  signal?: AbortSignal,
): Promise<ResolveActorsResponse> {
  const search = new URLSearchParams();
  if (params.actorIds && params.actorIds.length > 0) {
    search.set('actor_ids', params.actorIds.join(','));
  }
  if (params.teamIds && params.teamIds.length > 0) {
    search.set('team_ids', params.teamIds.join(','));
  }
  const url = `/actors/resolve${search.size ? `?${search.toString()}` : ''}`;
  const init: RequestInit = { credentials: 'same-origin' };
  if (signal) init.signal = signal;
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/actors/resolve failed: ${res.status}`);
  return (await res.json()) as ResolveActorsResponse;
}
