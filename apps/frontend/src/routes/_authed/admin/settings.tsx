import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
import { WorkspaceSettingsScreen } from '../../../features/admin/settings/WorkspaceSettingsScreen.js';

export const Route = createFileRoute('/_authed/admin/settings')({
  component: AdminSettingsPage,
});

export function AdminSettingsPage() {
  return (
    <PermissionGate capability="workspace.admin">
      <WorkspaceSettingsScreen />
    </PermissionGate>
  );
}
