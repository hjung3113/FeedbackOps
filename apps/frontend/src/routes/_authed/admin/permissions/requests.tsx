import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../../features/admin/permissions/permission-gate.js';
import { PermissionRequestsScreen } from '../../../../features/admin/permissions/permission-requests-screen.js';
import {
  permissionRequestsSearchSchema,
  validatePermissionRequestsSearch,
} from '../../../../features/admin/permissions/permission-requests-search.js';

export { permissionRequestsSearchSchema };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const PermissionRequestsConsolePageSplit = PermissionRequestsConsolePage;

export const Route = createFileRoute('/_authed/admin/permissions/requests')({
  validateSearch: validatePermissionRequestsSearch,
  component: PermissionRequestsConsolePageSplit,
});

export function PermissionRequestsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionRequestsScreen />
    </PermissionGate>
  );
}
