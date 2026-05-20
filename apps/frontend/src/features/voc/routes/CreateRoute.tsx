// CreateRoute — route-level owner for VOC creation.
// Owns: search param forwarding, dirty-block guard, DirtyConfirmation dialog mount.
// C6 of Slice 3 #19.

import * as React from 'react';
import { useNavigate, useSearch, useBlocker } from '@tanstack/react-router';
import { DirtyConfirmation } from '@fops/ui';
import { VocCreateScreen } from '../components/create/VocCreateScreen';

export function CreateRoute(): React.ReactElement {
  // Read managedSystem from URL search (useSearch strict:false so this
  // component can be mounted from anywhere that passes VocSearch shape).
  const search = useSearch({ strict: false }) as { managedSystem?: string };
  const navigate = useNavigate();

  // formIsDirty is lifted from VocCreateScreen via callback.
  const [formIsDirty, setFormIsDirty] = React.useState(false);

  // Track whether the dirty dialog is open (driven by the blocker resolver).
  const [dirtyDialogOpen, setDirtyDialogOpen] = React.useState(false);

  // useBlocker v1 API: withResolver:true returns a BlockerResolver object.
  // Signature from node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts
  const blocker = useBlocker({
    shouldBlockFn: () => formIsDirty,
    withResolver: true,
  });

  // When the blocker status transitions to 'blocked', open the dialog.
  React.useEffect(() => {
    if (blocker.status === 'blocked') {
      setDirtyDialogOpen(true);
    }
  }, [blocker.status]);

  function handleDirtyConfirm(): void {
    setDirtyDialogOpen(false);
    if (blocker.status === 'blocked' && blocker.proceed) {
      blocker.proceed();
    }
  }

  function handleDirtyCancel(): void {
    setDirtyDialogOpen(false);
    if (blocker.status === 'blocked' && blocker.reset) {
      blocker.reset();
    }
  }

  function handleCancel(): void {
    void navigate({ to: '/vocs', search: { view: 'inbox' } });
  }

  return (
    <>
      <VocCreateScreen
        {...(search.managedSystem !== undefined
          ? { initialManagedSystemId: search.managedSystem }
          : {})}
        onCancel={handleCancel}
        onDirtyChange={setFormIsDirty}
      />
      <DirtyConfirmation
        open={dirtyDialogOpen}
        onConfirm={handleDirtyConfirm}
        onCancel={handleDirtyCancel}
      />
    </>
  );
}
