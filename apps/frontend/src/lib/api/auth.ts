// Auth endpoint fetchers — /me, /auth/mock-login, /auth/logout.
// Per AGENTS.md the frontend never enforces backend permissions; these helpers
// only surface what the server says.

export interface MeResponse {
  actor: {
    id: string;
    external_id: string;
    email: string;
    display_name: string;
    role_level: string;
  };
  workspace_id: string;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('unauthenticated');
  }
}

export async function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (signal) init.signal = signal;
  const res = await fetch('/me', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me failed: ${res.status}`);
  return (await res.json()) as MeResponse;
}

export async function mockLogin(externalId: string): Promise<MeResponse> {
  const res = await fetch('/auth/mock-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ external_id: externalId }),
  });
  if (!res.ok) throw new Error(`mock-login failed: ${res.status}`);
  return (await res.json()) as MeResponse;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
}
