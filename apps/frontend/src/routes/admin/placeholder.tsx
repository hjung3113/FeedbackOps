// /admin/placeholder — first admin-gated surface. Demonstrates the
// <PermissionGate capability="workspace.admin"> contract end-to-end. Admin
// session sees the placeholder body; user session sees the request_access
// state rendered by <PermissionStateView>.
//
// Per AGENTS.md:73, Permission Requests live under Admin routes; this file
// is the seed of that tree.

import { createFileRoute, redirect } from '@tanstack/react-router';

import { PermissionGate } from '../../features/admin/permissions/permission-gate.js';
import { UnauthenticatedError, fetchMe } from '../../lib/api.js';

export const Route = createFileRoute('/admin/placeholder')({
  beforeLoad: async () => {
    // Match the home route's auth gate so unauthenticated visitors land on
    // /login instead of the permission gate's fallback.
    try {
      await fetchMe();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        throw redirect({ to: '/login' });
      }
    }
  },
  component: AdminPlaceholderPage,
});

export function AdminPlaceholderPage() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <PermissionGate capability="workspace.admin">
        <section
          data-testid="admin-placeholder-body"
          className="rounded-md border border-surface-overlay bg-surface-raised p-6"
        >
          <p className="text-text-primary">Admin placeholder</p>
        </section>
      </PermissionGate>
    </main>
  );
}
