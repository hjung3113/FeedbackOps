// Home — first authenticated surface. Uses TanStack Router's `beforeLoad`
// to push the visitor to /login if `/me` returns 401. Successful payload is
// cached in TanStack Query and the component renders identity + a Logout
// button. Per AGENTS.md the frontend NEVER enforces backend permissions as
// truth — we display what the server returned and react to its 401.

import { Button } from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { type MeResponse, UnauthenticatedError, fetchMe, logout } from '../lib/api.js';

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
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate({ to: '/login' });
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">FeedbackOps</h1>
      {me.data && (
        <p>
          Logged in as {me.data.actor.display_name} ({me.data.actor.role_level})
        </p>
      )}
      <Button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
        Logout
      </Button>
    </main>
  );
}
