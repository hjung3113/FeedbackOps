import { useId, useState } from 'react';

import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { Button, PanelSectionTitle, Textarea } from '@fops/ui';

import { useRevokePermission } from './useRevokePermission.js';

export function PermissionGrantActionForm({
  kind,
  id,
  onSuccess,
}: {
  kind: 'grants' | 'denies';
  id: string;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useRevokePermission();
  const submitLabel =
    kind === 'grants' ? ADMIN_PERMISSIONS_COPY.revokeGrant : ADMIN_PERMISSIONS_COPY.liftDeny;
  const canSubmit = reason.trim().length > 0 && !mutation.isPending;

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
      <PanelSectionTitle>{submitLabel}</PanelSectionTitle>
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
      <Button
        type="button"
        variant="primary"
        disabled={!canSubmit}
        onClick={submit}
        data-testid="permission-grants-submit"
      >
        {submitLabel}
      </Button>
    </section>
  );
}
