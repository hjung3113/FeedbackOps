import { apiRequest } from '@/lib/api';
import {
  getEvidenceInventoryResponseSchema,
  listEvidenceInventoryResponseSchema,
} from '@fops/shared';
import type { EvidenceHighlightSourceType } from '@fops/shared';

export interface EvidenceFilters {
  managedSystem?: string;
  source?: EvidenceHighlightSourceType;
  q?: string;
  cursor?: string;
}
/** Prefix seam for Finding attachment invalidation (54-5). */
export const evidenceInventoryQueryKey = () => ['evidence-inventory'] as const;

export async function fetchEvidenceInventory(filters: EvidenceFilters, signal: AbortSignal) {
  const query = new URLSearchParams();
  if (filters.managedSystem) query.set('managed_system_id', filters.managedSystem);
  if (filters.source) query.set('source_type', filters.source);
  if (filters.q) query.set('q', filters.q);
  if (filters.cursor !== undefined) query.set('cursor', filters.cursor);
  return (
    await apiRequest('GET', `/evidence-highlights?${query}`, listEvidenceInventoryResponseSchema, {
      signal,
    })
  ).data;
}
export async function fetchEvidenceDetail(id: string, signal: AbortSignal) {
  return (
    await apiRequest('GET', `/evidence-highlights/${id}`, getEvidenceInventoryResponseSchema, {
      signal,
    })
  ).data;
}
