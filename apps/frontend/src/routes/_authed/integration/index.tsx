import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/integration/')({
  beforeLoad: () => {
    throw redirect({ to: '/integration/links' });
  },
  component: () => null,
});
