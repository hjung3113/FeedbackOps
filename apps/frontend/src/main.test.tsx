import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './lib/api/types';

const render = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render }),
}));

vi.mock('@tanstack/react-router', () => ({
  createRouter: () => ({}),
  RouterProvider: () => null,
}));

vi.mock('./routeTree.gen', () => ({ routeTree: {} }));

describe('shouldRetryQuery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('does not retry permission-denied 403 responses', async () => {
    const { shouldRetryQuery } = await import('./main');

    expect(
      shouldRetryQuery(0, new ApiError(403, { code: 'permission.denied', message: 'denied' })),
    ).toBe(false);
  });

  it('retries a 500 response', async () => {
    const { shouldRetryQuery } = await import('./main');

    expect(
      shouldRetryQuery(0, new ApiError(500, { code: 'internal.unexpected', message: 'failed' })),
    ).toBe(true);
  });
});
