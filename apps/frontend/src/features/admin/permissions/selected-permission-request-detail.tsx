import { Button } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { fetchPermissionRequestAdminDetail, permissionRequestAdminDetailKey } from '@/lib/api';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { PermissionRequestDetail } from './permission-request-detail';

export function SelectedPermissionRequestDetail({
  id,
  actorNames,
  managedSystemNames,
  onClose,
}: {
  id: string;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: permissionRequestAdminDetailKey(id),
    queryFn: ({ signal }) => fetchPermissionRequestAdminDetail(id, signal),
    retry: false,
    staleTime: 0,
  });
  // Draft identity is ID + revision only: an unchanged background refetch must
  // not remount the form. A stale conflict latches an inline notice above the
  // keyed form until the Admin picks a new action — the refetch remount would
  // otherwise lose the transient form-level alert and the toast fades.
  const [staleReview, setStaleReview] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    revision: number;
    nonEmpty: boolean;
    reason: string;
  } | null>(null);
  const [discardedReason, setDiscardedReason] = React.useState<string | null>(null);
  // The revision this panel's own successful decision produced (from the decision response). It is
  // kept past mutation settle, until another revision replaces it, so the detail refetch that lands
  // after settle is still recognised as ours; any other revision change is a change made elsewhere.
  const [ownDecision, setOwnDecision] = React.useState<{ id: string; revision: number } | null>(
    null,
  );
  const onDraftChanged = React.useCallback(
    (next: { revision: number; nonEmpty: boolean; reason: string }) => setDraft(next),
    [],
  );
  const detail = query.data;
  // Preserve the old reason outside the keyed form before its revision reset.
  // Same-revision reads leave both the form and its intent key untouched.
  if (detail && draft && draft.revision !== detail.revision) {
    const ownRevision = ownDecision?.id === id && ownDecision.revision === detail.revision;
    if (draft.nonEmpty && !ownRevision) setDiscardedReason(draft.reason);
    setDraft(null);
  }
  if (query.isError || !detail || !query.isFetchedAfterMount)
    return (
      <aside className="flex flex-col gap-3 p-5" data-testid="permission-request-detail-panel">
        <Button variant="ghost" aria-label="패널 닫기" onClick={onClose}>
          닫기
        </Button>
        <p role={query.isError ? 'alert' : 'status'}>
          {query.isError
            ? ADMIN_PERMISSIONS_COPY.detailError
            : ADMIN_PERMISSIONS_COPY.detailLoading}
        </p>
        {query.isError ? (
          <Button onClick={() => void query.refetch()}>{ADMIN_PERMISSIONS_COPY.retry}</Button>
        ) : null}
      </aside>
    );
  return (
    <PermissionRequestDetail
      key={`${id}:${detail.revision}`}
      request={detail}
      actorName={detail.requester.display_name || actorNames[detail.requester_actor_id]}
      managedSystemNames={managedSystemNames}
      managedSystemName={
        detail.requested_managed_system_id
          ? managedSystemNames[detail.requested_managed_system_id]
          : undefined
      }
      {...(staleReview ? { staleNotice: true } : {})}
      {...(discardedReason !== null ? { discardedReason } : {})}
      onDraftChanged={onDraftChanged}
      onStaleConflict={() => setStaleReview(true)}
      onDecisionSucceeded={setOwnDecision}
      onActionPicked={() => {
        setStaleReview(false);
        setDiscardedReason(null);
      }}
      onClose={onClose}
    />
  );
}
