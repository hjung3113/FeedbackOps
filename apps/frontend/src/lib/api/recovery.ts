import {
  type RecoveryHistoryQuery,
  type RecoveryListQuery,
  type RecoveryPresentationPatch,
  recoveryDetailSchema,
  recoveryHistoryQuerySchema,
  recoveryHistorySchema,
  recoveryListQuerySchema,
  recoveryListSchema,
  recoveryPresentationPatchSchema,
} from '@fops/shared';
import { apiRequest } from './client';

function serialize(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return params.toString();
}
export async function fetchRecoveryItems(query: RecoveryListQuery, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/dashboard/recovery-items?${serialize(recoveryListQuerySchema.parse(query))}`,
      recoveryListSchema,
      { ...(signal ? { signal } : {}) },
    )
  ).data;
}
export async function fetchRecoveryDetail(id: string, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/dashboard/recovery-items/${encodeURIComponent(id)}`,
      recoveryDetailSchema,
      { ...(signal ? { signal } : {}) },
    )
  ).data;
}
export async function fetchRecoveryHistory(query: RecoveryHistoryQuery, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/dashboard/recovery-history?${serialize(recoveryHistoryQuerySchema.parse(query))}`,
      recoveryHistorySchema,
      { ...(signal ? { signal } : {}) },
    )
  ).data;
}
export async function patchRecoveryPresentation(
  id: string,
  body: RecoveryPresentationPatch,
  signal?: AbortSignal,
) {
  return (
    await apiRequest(
      'PATCH',
      `/dashboard/recovery-items/${encodeURIComponent(id)}/presentation`,
      recoveryDetailSchema,
      { body: recoveryPresentationPatchSchema.parse(body), ...(signal ? { signal } : {}) },
    )
  ).data;
}
