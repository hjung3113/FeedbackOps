import type { Route } from '@playwright/test';
import type { MockApiContext } from './types';

export type MockApiPath = string | RegExp;
export type MockApiPathMatch = true | RegExpMatchArray;

export interface MockApiHandler {
  method: string;
  path: MockApiPath;
  query?: (params: URLSearchParams) => boolean;
  handle: (
    route: Route,
    context: MockApiContext,
    url: URL,
    pathMatch: MockApiPathMatch,
  ) => Promise<void>;
}

export function matchMockApiHandler(
  handler: MockApiHandler,
  method: string,
  url: URL,
): MockApiPathMatch | null {
  if (handler.method !== method) return null;

  const pathMatch =
    typeof handler.path === 'string'
      ? url.pathname === handler.path
        ? true
        : null
      : url.pathname.match(handler.path);
  if (!pathMatch) return null;
  if (handler.query && !handler.query(url.searchParams)) return null;
  return pathMatch;
}

export function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export function errorEnvelope(status: number): { code: string; message: string } {
  return {
    code: status === 404 ? 'not_found.record' : 'internal.unexpected',
    message: status === 404 ? 'record not found' : 'unexpected test error',
  };
}
