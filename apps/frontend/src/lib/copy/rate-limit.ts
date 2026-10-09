// rate-limit.ts — single source for the 429 rate-limit copy: the actor variant
// (#884; the router /me fallback, lib/api/errorMapper, the VOC triage policy)
// and the same-IP variant (#908; errorMapper), plus `formatRetryAfter`, the
// wait phrase both policies render from `detail.retry_after_seconds`.
// Rendered strings must stay byte-identical.

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

/**
 * Wait phrase from a 429 envelope's `retry_after_seconds`.
 * A finite value above 0 and below 60 is `{n}초`; 60 or more rounds up to minutes.
 * Missing, non-finite, or non-positive values return undefined.
 */
export function formatRetryAfter(detail?: Record<string, unknown>): string | undefined {
  const raw = detail?.retry_after_seconds;
  const secs = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  if (secs === undefined || secs <= 0) return undefined;
  if (secs < 60) return `${secs}초`;
  return `${Math.ceil(secs / 60)}분`;
}
