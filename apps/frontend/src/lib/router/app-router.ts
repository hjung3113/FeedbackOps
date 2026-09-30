import type { QueryClient } from '@tanstack/react-query';
import { type RouterHistory, createRouter } from '@tanstack/react-router';

import { RouteErrorFallback, RouteNotFoundFallback } from '@/lib/layout/RouteFallback';
import { routeTree } from '@/routeTree.gen';

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultErrorComponent: RouteErrorFallback,
    defaultNotFoundComponent: RouteNotFoundFallback,
    ...(history !== undefined ? { history } : {}),
  });
}
