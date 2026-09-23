import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../../features/admin/permissions/permission-gate.js';
import { PermissionRequestsScreen } from '../../../../features/admin/permissions/permission-requests-screen.js';
import { permissionRequestsSearchSchema } from '../../../../features/admin/permissions/permission-requests-search.js';

export { permissionRequestsSearchSchema };

export const Route = createFileRoute('/_authed/admin/permissions/requests')({
  validateSearch: (raw) => permissionRequestsSearchSchema.parse(raw),
  component: PermissionRequestsConsolePage,
});

export function PermissionRequestsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionRequestsScreen />
    </PermissionGate>
  );
}
