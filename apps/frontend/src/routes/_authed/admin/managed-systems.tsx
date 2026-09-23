import { createFileRoute } from '@tanstack/react-router';

import { ManagedSystemsAdminPage } from '../../../features/admin/managed-systems/ManagedSystemsScreen.js';

export const Route = createFileRoute('/_authed/admin/managed-systems')({
  component: ManagedSystemsAdminPage,
});

export { ManagedSystemsAdminPage };
