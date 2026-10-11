import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
import { WorkspaceSettingsScreen } from '../../../features/admin/settings/WorkspaceSettingsScreen.js';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps AdminSettingsPage exported
// for tests while letting the route component split into its own chunk.
const AdminSettingsPageSplit = AdminSettingsPage;

export const Route = createFileRoute('/_authed/admin/settings')({
  component: AdminSettingsPageSplit,
});

export function AdminSettingsPage() {
  return (
    <PermissionGate capability="workspace.admin">
      <WorkspaceSettingsScreen />
    </PermissionGate>
  );
}
