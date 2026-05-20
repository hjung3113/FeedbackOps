// Home — first authenticated surface. Uses TanStack Router's `beforeLoad`
// to push the visitor to /login if `/me` returns 401. Successful payload is
// cached in TanStack Query and the component renders identity + a Logout
// button. Per AGENTS.md the frontend NEVER enforces backend permissions as
// truth — we display what the server returned and react to its 401.
//
// Slice 1 #5: adds an `Open requests` section sourced from
// GET /permission-requests/mine.

import { Button } from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { permissionRequestsMineKey } from '../features/admin/permissions/use-permission-check.js';
import {
  type MeResponse,
  UnauthenticatedError,
  fetchMe,
  fetchPermissionRequestsMine,
  logout,
} from '../lib/api';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    try {
      await fetchMe();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        throw redirect({ to: '/login' });
      }
      // Other failures fall through; the component-level useQuery surfaces them.
    }
  },
  component: HomePage,
});

export function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
  });
  const openRequests = useQuery({
    queryKey: permissionRequestsMineKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine(signal),
    retry: false,
    enabled: Boolean(me.data),
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate({ to: '/login' });
    },
  });

  const requests = openRequests.data?.requests ?? [];

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">FeedbackOps</h1>
      {me.data && (
        <p>
          Logged in as {me.data.actor.display_name} ({me.data.actor.role_level})
        </p>
      )}
      <Button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
        Logout
      </Button>

      <section aria-labelledby="open-requests-heading" className="space-y-2">
        <h2 id="open-requests-heading" className="text-lg font-semibold">
          Open requests
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-text-muted">No open requests.</p>
        ) : (
          <ul data-testid="open-requests-list" className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-default bg-surface-raised p-3"
              >
                <p className="text-sm font-medium text-text-primary">{r.requested_capability}</p>
                <p className="text-xs text-text-muted">
                  {r.status} · {new Date(r.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-text-muted">id: {r.id}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
