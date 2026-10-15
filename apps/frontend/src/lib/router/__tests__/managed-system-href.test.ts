import { describe, expect, it } from 'vitest';

import { hrefWithManagedSystem } from '../managed-system-href';

const SYSTEM_ID = '01919b8c-0000-7000-8000-000000000001';

describe('hrefWithManagedSystem (#1179)', () => {
  it.each([
    { name: 'route with a query', route: '/findings?execution=none' },
    { name: 'route without a query', route: '/admin/permissions/requests' },
  ])('appends managedSystem to $name', ({ route }) => {
    const separator = route.includes('?') ? '&' : '?';
    expect(hrefWithManagedSystem(route, SYSTEM_ID)).toBe(
      `${route}${separator}managedSystem=${SYSTEM_ID}`,
    );
  });

  it.each([
    { name: 'no selection', managedSystemId: undefined },
    { name: 'the all selector', managedSystemId: 'all' },
  ])('keeps the bare route for $name', ({ managedSystemId }) => {
    expect(hrefWithManagedSystem('/findings?execution=none', managedSystemId)).toBe(
      '/findings?execution=none',
    );
  });
});
