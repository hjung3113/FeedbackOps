// #1179 — shared URL logic for queue/coverage deep links that must keep the
// selected Managed System: a specific id is appended as `managedSystem=<id>`;
// no selection and the `all` selector keep the bare route, because the
// destination list then applies the caller's effective scope union.
export function hrefWithManagedSystem(route: string, managedSystemId: string | undefined): string {
  if (managedSystemId === undefined || managedSystemId === 'all') return route;
  const url = new URL(route, 'http://localhost');
  url.searchParams.set('managedSystem', managedSystemId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
