// /login — mock-auth picker. Two hard-coded cards (Admin / User) per the
// orchestrator's "keep this minimal, design system reference HTML pending"
// instruction. Card labels mirror the seed roster; the matching backend
// route still gates the actual session issuance and the dev-only check.
//
// We hard-code rather than calling `GET /auth/mock-login` for the labels
// because: (1) the backend page is an HTML form intended for no-JS use,
// (2) parsing that HTML on the client adds zero value over duplicating two
// strings, and (3) it keeps the frontend test runnable without spinning
// the backend.
//
// F-015 prod guard: the backend `/auth/mock-login` 404s in production
// (`isProd || authProvider.name !== 'mock'`). This page therefore must
// disappear in prod so it cannot leak seed external_ids or invite
// probing. Detection: Vite's `import.meta.env.PROD` (true in `vite build`
// production bundle; false in `vite dev` and during vitest runs).

import { Button } from '@fops/ui';
import { useMutation } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { mockLogin } from '../lib/api';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

const SEED_ACTORS = [
  {
    external_id: 'mock-admin-1',
    display_name: 'Admin One',
    role_level: 'Admin',
    email: 'admin@feedbackops.local',
  },
  {
    external_id: 'mock-user-1',
    display_name: 'User One',
    role_level: 'User',
    email: 'user@feedbackops.local',
  },
];

export function LoginPage() {
  if (import.meta.env.PROD) {
    return <Navigate to="/" />;
  }
  return <MockLoginPicker />;
}

function MockLoginPicker() {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: mockLogin,
    onSuccess: () => {
      navigate({ to: '/' });
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Mock login</h1>
      <p className="text-text-muted">
        Dev-only picker. Selecting an actor issues a session immediately.
      </p>
      <ul className="space-y-2">
        {SEED_ACTORS.map((a) => (
          <li key={a.external_id}>
            <Button onClick={() => mutation.mutate(a.external_id)} disabled={mutation.isPending}>
              {a.display_name} ({a.role_level})
            </Button>
            <span className="ml-3 text-text-muted">{a.email}</span>
          </li>
        ))}
      </ul>
      {mutation.isError && (
        <p role="alert" className="text-accent-danger">
          Login failed. Check the backend is running.
        </p>
      )}
    </main>
  );
}
