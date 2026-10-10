import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../../features/admin/permissions/permission-gate.js';
import { PermissionGrantsScreen } from '../../../../features/admin/permissions/permission-grants-screen.js';
import {
  permissionGrantsSearchSchema,
  validatePermissionGrantsSearch,
} from '../../../../features/admin/permissions/permission-grants-search.js';

export { permissionGrantsSearchSchema };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const PermissionGrantsConsolePageSplit = PermissionGrantsConsolePage;

export const Route = createFileRoute('/_authed/admin/permissions/grants')({
  validateSearch: validatePermissionGrantsSearch,
  component: PermissionGrantsConsolePageSplit,
});

export function PermissionGrantsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionGrantsScreen />
    </PermissionGate>
  );
}
