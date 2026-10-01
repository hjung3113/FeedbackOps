import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSurveyQueryDefaults } from './features/surveys/hooks/useSurveys';
import { ApiError } from './lib/api/types';
import { createAppRouter } from './lib/router/app-router';
import './styles.css';

export { createAppRouter };

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 3;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
// Sticky Survey results-read denial markers must never be garbage-collected
// while the payloads they protect stay cached; see registerSurveyQueryDefaults.
registerSurveyQueryDefaults(queryClient);
const router = createAppRouter(queryClient);

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
