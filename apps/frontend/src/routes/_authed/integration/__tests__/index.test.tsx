import { describe, expect, test } from 'vitest';

import { IntegrationDashboardRouteShell, Route } from '../index';

describe('/integration route', () => {
  test('mounts the dashboard without a redirect hook', () => {
    expect(Route.options.component).toBe(IntegrationDashboardRouteShell);
    expect(Route.options.loader).toBeUndefined();
    expect(Route.options.beforeLoad).toBeUndefined();
  });
});
