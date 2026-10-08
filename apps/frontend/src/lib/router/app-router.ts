import type { QueryClient } from '@tanstack/react-query';
import { type RouterHistory, createRouter } from '@tanstack/react-router';

import { RouteErrorFallback, RouteNotFoundFallback } from '@/lib/layout/RouteFallback';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { routeTree } from '@/routeTree.gen';

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // #850: numeric-looking search values stay raw, string-typed URL params
    // (q=1000) instead of JSON-quoted (%221000%22) or dropped numbers.
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
    defaultErrorComponent: RouteErrorFallback,
    defaultNotFoundComponent: RouteNotFoundFallback,
    ...(history !== undefined ? { history } : {}),
  });
}
