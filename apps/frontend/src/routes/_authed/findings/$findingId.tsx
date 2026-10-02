import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/findings/$findingId')({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ params, search }) => redirectFindingDeepLink(params.findingId, search.returnTo),
});

function redirectFindingDeepLink(findingId: string, returnTo: unknown): never {
  throw redirect({
    to: '/findings',
    replace: true,
    search: {
      selected: findingId,
      ...(typeof returnTo === 'string' ? { returnTo } : {}),
    },
  });
}
