// Root is an entry-only route. Authenticated actors enter the real product
// shell at /home; unauthenticated actors enter /login (OIDC in production,
// mock-login picker in development).

import { createFileRoute, redirect } from '@tanstack/react-router';
import { UnauthenticatedError, fetchMe } from '../lib/api';

export async function rootBeforeLoad(): Promise<never> {
  try {
    await fetchMe();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      throw redirect({ to: '/login' });
    }
    throw err;
  }
  throw redirect({ to: '/home' });
}

export const Route = createFileRoute('/')({
  beforeLoad: rootBeforeLoad,
  component: () => null,
});
