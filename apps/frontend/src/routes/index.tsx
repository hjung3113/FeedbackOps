// Root is an entry-only route. Authenticated actors enter the real product
// shell at /home; unauthenticated actors enter /login (OIDC in production,
// mock-login picker in development).

import { QueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { UnauthenticatedError } from '../lib/api';
import { ensureMe } from '../lib/auth/useMe';
import type { AppRouterContext } from './__root';

export async function rootBeforeLoad(
  { context }: { context?: Partial<AppRouterContext> } = {},
): Promise<never> {
  // Tests that call the entry guard without a router context get an isolated
  // cache; the app always supplies its shared QueryClient through RouterContext.
  const queryClient = context?.queryClient ?? new QueryClient();
  try {
    await ensureMe(queryClient);
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
