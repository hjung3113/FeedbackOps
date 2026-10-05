import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { createAppRouter } from '@/lib/router/app-router';

describe('production route tree', () => {
  it('does not register dev-only routes', () => {
    const router = createAppRouter(new QueryClient());
    const fullPaths = Object.values(router.routesById).map((route) => route.fullPath);

    expect(fullPaths.filter((fullPath) => fullPath.startsWith('/dev'))).toEqual([]);
  });
});
