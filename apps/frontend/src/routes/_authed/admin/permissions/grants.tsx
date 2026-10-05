import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../../features/admin/permissions/permission-gate.js';
import { PermissionGrantsScreen } from '../../../../features/admin/permissions/permission-grants-screen.js';
import {
  permissionGrantsSearchSchema,
  validatePermissionGrantsSearch,
} from '../../../../features/admin/permissions/permission-grants-search.js';

export { permissionGrantsSearchSchema };

export const Route = createFileRoute('/_authed/admin/permissions/grants')({
  validateSearch: validatePermissionGrantsSearch,
  component: PermissionGrantsConsolePage,
});

export function PermissionGrantsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionGrantsScreen />
    </PermissionGate>
  );
}
