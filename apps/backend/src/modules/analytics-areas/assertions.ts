import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { type LockedAnalyticsArea, lockAnalyticsArea } from './repo.js';

export type AssertActiveAnalyticsAreaOptions = {
  onInvalid?: (reason: 'out_of_scope' | 'archived') => HttpError;
};

export async function assertActiveAnalyticsAreaForManagedSystem(
  tx: Tx,
  workspaceId: string,
  managedSystemId: string,
  analyticsAreaId: string,
  options?: AssertActiveAnalyticsAreaOptions,
): Promise<LockedAnalyticsArea> {
  const area = await lockAnalyticsArea(tx, workspaceId, analyticsAreaId);
  if (!area) throw new HttpError('not_found.record', 'analytics area not found');
  if (area.managed_system_id !== managedSystemId) {
    throw (
      options?.onInvalid?.('out_of_scope') ??
      new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
        fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
      })
    );
  }
  if (area.archived_at !== null) {
    throw (
      options?.onInvalid?.('archived') ??
      new HttpError('conflict.parent_archived', 'analytics area archived', {
        fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
      })
    );
  }
  return area;
}
