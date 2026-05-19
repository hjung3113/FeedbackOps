// /admin/placeholder — first admin-gated surface. Demonstrates the
// <PermissionGate capability="workspace.admin"> contract end-to-end. Admin
// session sees the placeholder body; user session sees the request_access
// state rendered by <PermissionStateView>.
//
// Per AGENTS.md:73, Permission Requests live under Admin routes; this file
// is the seed of that tree.

import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';

export const Route = createFileRoute('/_authed/admin/placeholder')({
  component: AdminPlaceholderPage,
});

export function AdminPlaceholderPage() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <PermissionGate capability="workspace.admin">
        <section
          data-testid="admin-placeholder-body"
          className="rounded-md border border-default bg-surface-raised p-6"
        >
          <p className="text-text-primary">Admin placeholder</p>
        </section>
      </PermissionGate>
    </main>
  );
}
