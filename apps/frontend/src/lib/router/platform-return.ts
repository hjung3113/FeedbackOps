import { z } from 'zod';

const MAX_PLATFORM_RETURN_LENGTH = 2048;

/** Syntactic check only: the allowlist is deployment config, see allowedPlatformReturnHref. */
function parsePlatformReturn(value: string): URL | undefined {
  if (value.length > MAX_PLATFORM_RETURN_LENGTH) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.username !== '' || url.password !== '') return undefined;
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  return url.protocol === 'https:' || isLocalHttp ? url : undefined;
}

/** `platformReturn` search field (ADR-0071); never reuse the internal `returnTo` key. */
export const platformReturnField = z
  .string()
  .refine((value) => parsePlatformReturn(value) !== undefined)
  .optional();

/** Leaf routes that render the link; the Survey detail's /results and /follow-up children inherit the key but do not. */
export const PLATFORM_RETURN_ROUTE_IDS: readonly string[] = [
  '/_authed/vocs',
  '/_authed/tasks',
  '/_authed/surveys/',
  '/_authed/surveys/$surveyId',
];

/** Raw `platformReturn` of the committed leaf match when its route may show the link. */
export function selectPlatformReturn(
  matches: readonly { routeId: string; search: unknown }[],
): string | undefined {
  const leaf = matches.at(-1);
  if (leaf === undefined || !PLATFORM_RETURN_ROUTE_IDS.includes(leaf.routeId)) return undefined;
  const value = (leaf.search as { platformReturn?: unknown } | undefined)?.platformReturn;
  return typeof value === 'string' ? value : undefined;
}

/**
 * The absolute `URL.href` to render when the URL's origin is exactly one of the origins the
 * server allows; rendering the parsed href (not the raw string) keeps the checked origin the
 * link's origin.
 */
export function allowedPlatformReturnHref(
  value: unknown,
  origins: readonly string[] | undefined,
): string | undefined {
  if (typeof value !== 'string' || origins === undefined) return undefined;
  const url = parsePlatformReturn(value);
  return url !== undefined && origins.includes(url.origin) ? url.href : undefined;
}
