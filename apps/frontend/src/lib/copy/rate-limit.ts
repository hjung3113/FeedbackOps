// rate-limit.ts — single source for the 429 rate-limit copy (issue #884),
// shared by the router /me fallback, lib/api/errorMapper, and the VOC triage
// error policy. Rendered strings must stay byte-identical.

export const RATE_LIMIT_TITLE = '요청이 너무 많습니다';

/**
 * Full rate-limit message: names the wait when the server sent a
 * Retry-After value, the generic form otherwise.
 */
export function rateLimitedMessage(wait?: string): string {
  const tail = wait ? `${wait} 후 다시 시도해 주세요.` : '잠시 후 다시 시도해 주세요.';
  return `${RATE_LIMIT_TITLE}. ${tail}`;
}

/**
 * Same-IP rate-limit message (issue #908): identical wait handling with the
 * IP prefix, shared by lib/api/errorMapper's rate_limited.ip entry.
 */
export function ipRateLimitedMessage(wait?: string): string {
  const tail = wait ? `${wait} 후 다시 시도해 주세요.` : '잠시 후 다시 시도해 주세요.';
  return `동일 IP에서의 요청이 너무 많습니다. ${tail}`;
}
