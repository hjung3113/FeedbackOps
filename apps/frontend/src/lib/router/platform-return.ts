import { z } from 'zod';

const MAX_PLATFORM_RETURN_LENGTH = 2048;

/** Syntactic check only: the allowlist is deployment config, see isAllowedPlatformReturn. */
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

/** True only when the URL's origin is exactly one of the origins the server allows. */
export function isAllowedPlatformReturn(
  value: unknown,
  origins: readonly string[] | undefined,
): value is string {
  if (typeof value !== 'string' || origins === undefined) return false;
  const url = parsePlatformReturn(value);
  return url !== undefined && origins.includes(url.origin);
}
