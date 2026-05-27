// /admin/permissions/requests — Permission review console (seed).
//
// The Managed Systems registry (#87) links here from the Permission Requests
// panel ("Open review console" / "Review"). The full review console UI lands
// with the Permissions slice; this route exists so the link target is real and
// renders the admin-gated workspace-wide pending list via the #87 admin
// endpoint (GET /permission-requests).

import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { PermissionGate } from '../../../../features/admin/permissions/permission-gate.js';
import { fetchPermissionRequestsAll } from '../../../../lib/api';

export const Route = createFileRoute('/_authed/admin/permissions/requests')({
  component: PermissionRequestsConsolePage,
});

export function PermissionRequestsConsolePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Permission requests</h1>
      <PermissionGate capability="workspace.admin">
        <PendingList />
      </PermissionGate>
    </main>
  );
}

function PendingList() {
  const query = useQuery({
    queryKey: ['permission-requests', 'all'] as const,
    queryFn: ({ signal }) => fetchPermissionRequestsAll(signal),
    retry: false,
  });

  if (query.isPending) return <p className="text-sm text-text-muted">Loading…</p>;
  if (query.isError) return <p className="text-sm text-accent-danger">Failed to load requests.</p>;
  if (query.data.requests.length === 0) {
    return <p className="text-sm text-text-muted">대기 중인 권한 요청이 없습니다.</p>;
  }

  return (
    <ul data-testid="permission-requests-list" className="space-y-2">
      {query.data.requests.map((r) => (
        <li
          key={r.id}
          className="rounded-md border border-border-subtle bg-surface-card p-3 text-sm"
        >
          <span className="font-mono text-xs text-text-muted">{r.requested_capability}</span>
          <span className="ml-2 text-text-secondary">{r.status}</span>
          <p className="text-text-primary">{r.reason}</p>
        </li>
      ))}
    </ul>
  );
}
