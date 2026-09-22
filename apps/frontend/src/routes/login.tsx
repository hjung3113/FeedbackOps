// /login — OIDC entry in production; mock-auth picker otherwise.
// Two hard-coded cards (Admin / User) per the
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
// hide the picker in prod and start `/auth/login` instead. Detection:
// Vite's `import.meta.env.PROD` (true in `vite build`
// production bundle; false in `vite dev` and during vitest runs).

import { ROLE_LEVEL_LABELS, type RoleLevel } from '@fops/shared';
import { Button } from '@fops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { mockLogin } from '../lib/api';
import { sanitizeLoginReturnTo } from '../lib/login-return-to';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

const SEED_ACTORS: ReadonlyArray<{
  external_id: string;
  display_name: string;
  role_level: RoleLevel;
  email: string;
}> = [
  {
    external_id: 'mock-admin-1',
    display_name: 'Mock Admin',
    role_level: 'admin',
    email: 'admin@feedbackops.local',
  },
  {
    external_id: 'mock-admin-2',
    display_name: 'Mock Admin Two',
    role_level: 'admin',
    email: 'admin2@feedbackops.local',
  },
  {
    external_id: 'mock-developer-1',
    display_name: 'Mock Developer One',
    role_level: 'developer',
    email: 'dev1@feedbackops.local',
  },
  {
    external_id: 'mock-developer-2',
    display_name: 'Mock Developer Two',
    role_level: 'developer',
    email: 'dev2@feedbackops.local',
  },
  {
    external_id: 'mock-user-1',
    display_name: 'Mock User',
    role_level: 'user',
    email: 'user@feedbackops.local',
  },
  {
    external_id: 'mock-user-2',
    display_name: 'Mock User Two',
    role_level: 'user',
    email: 'user2@feedbackops.local',
  },
];

export function LoginPage() {
  if (import.meta.env.PROD) {
    return <OidcLoginRedirect />;
  }
  return <MockLoginPicker />;
}

function OidcLoginRedirect() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const search = new URLSearchParams(window.location.search);
    const returnTo = sanitizeLoginReturnTo(
      // `redirectTo` is what the _authed guard sends when a deep link hits a 401.
      search.get('redirectTo') ?? search.get('return_to') ?? search.get('redirect'),
    );
    window.location.replace(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  }, []);

  return <p>로그인 페이지로 이동 중…</p>;
}

function MockLoginPicker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: mockLogin,
    onSuccess: () => {
      // An actor boundary must drop all prior actor-scoped data before navigation.
      queryClient.clear();
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
              {a.display_name} ({ROLE_LEVEL_LABELS[a.role_level]})
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
