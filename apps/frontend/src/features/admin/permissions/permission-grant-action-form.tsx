import { useId, useState } from 'react';

import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { useMe } from '@/lib/auth/useMe';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { Button, PanelSectionTitle, Textarea } from '@fops/ui';

import { useWorkspaceSettings } from '../settings/use-workspace-settings.js';
import { useRevokePermission } from './useRevokePermission.js';

export function PermissionGrantActionForm({
  kind,
  id,
  actorId,
  onSuccess,
}: {
  kind: 'grants' | 'denies';
  id: string;
  actorId: string;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useRevokePermission();
  const me = useMe();
  const workspaceSettings = useWorkspaceSettings();
  const submitLabel =
    kind === 'grants' ? ADMIN_PERMISSIONS_COPY.revokeGrant : ADMIN_PERMISSIONS_COPY.liftDeny;
  const selfDenyLiftBlocked =
    kind === 'denies' &&
    actorId === me.data?.actor.id &&
    workspaceSettings.data?.permission_self_approval === 'forbidden';
  const canSubmit = reason.trim().length > 0 && !mutation.isPending && !selfDenyLiftBlocked;

  function submit() {
    if (!canSubmit) return;
    mutation.mutate(
      { kind, id, reason: reason.trim(), idempotencyKey },
      {
        onSuccess: () => {
          markConsumed();
          onSuccess();
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <PanelSectionTitle>{ADMIN_PERMISSIONS_COPY.actionTitle}</PanelSectionTitle>
      <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={reasonId}>
        {ADMIN_PERMISSIONS_COPY.reasonLabel}
        <Textarea
          id={reasonId}
          value={reason}
          maxLength={2000}
          placeholder={ADMIN_PERMISSIONS_COPY.reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {selfDenyLiftBlocked ? (
        <p className="text-xs text-accent-danger">{ADMIN_PERMISSIONS_COPY.selfDenyLiftForbidden}</p>
      ) : null}
      <Button
        type="button"
        disabled={!canSubmit}
        loading={mutation.isPending}
        onClick={submit}
        data-testid="permission-grants-submit"
      >
        {submitLabel}
      </Button>
    </section>
  );
}
