import { ApiError, type ApiErrorEnvelope, type RateLimitInfo } from './types';

export interface ApiClientOptions {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
  etag: string | undefined;
  requestId: string | undefined;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
}

// PUT is intentionally excluded: the locked API contract auto-mints Idempotency-Key
// only for POST/PATCH/DELETE. Include PUT explicitly if a future endpoint opts in.
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export async function apiClient<T = unknown>(
  method: string,
  path: string,
  opts: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const upper = method.toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };

  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  if (MUTATION_METHODS.has(upper)) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? mintInlineKey();
  }
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;

  const fetchInit: RequestInit = {
    method: upper,
    headers,
    credentials: 'include',
  };
  if (opts.signal != null) fetchInit.signal = opts.signal;
  if (opts.body !== undefined) {
    fetchInit.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, fetchInit);

  const etag = res.headers.get('etag') ?? undefined;
  const requestId = res.headers.get('x-request-id') ?? undefined;
  const { rateLimit, retryAfterSeconds } = parseRateLimitHeaders(res.headers);

  if (res.status === 304) {
    const base: ApiResponse<T> = { status: 304, data: undefined as T, etag, requestId };
    if (rateLimit) base.rateLimit = rateLimit;
    if (retryAfterSeconds !== undefined) base.retryAfterSeconds = retryAfterSeconds;
    return base;
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const envelope: ApiErrorEnvelope =
      data && typeof data === 'object' && 'code' in data
        ? (data as ApiErrorEnvelope)
        : { code: 'internal.unexpected', message: `HTTP ${res.status}` };
    throw new ApiError(res.status, envelope, requestId, rateLimit, retryAfterSeconds);
  }

  const base: ApiResponse<T> = { status: res.status, data: data as T, etag, requestId };
  if (rateLimit) base.rateLimit = rateLimit;
  if (retryAfterSeconds !== undefined) base.retryAfterSeconds = retryAfterSeconds;
  return base;
}

function mintInlineKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Parses fastify @fastify/rate-limit response headers.
// `x-ratelimit-reset` is unix epoch seconds; `retry-after` is delta-seconds.
// All four headers must be present and integer-parseable for rateLimit to be populated;
// otherwise the field is omitted (callers fall back to generic copy).
function parseRateLimitHeaders(
  headers: Headers,
): { rateLimit?: RateLimitInfo; retryAfterSeconds?: number } {
  const limit = parseIntHeader(headers.get('x-ratelimit-limit'));
  const remaining = parseIntHeader(headers.get('x-ratelimit-remaining'));
  const reset = parseIntHeader(headers.get('x-ratelimit-reset'));
  const retryAfter = parseIntHeader(headers.get('retry-after'));

  const rateLimit: RateLimitInfo | undefined =
    limit !== undefined && remaining !== undefined && reset !== undefined
      ? { limit, remaining, resetAt: new Date(reset * 1000) }
      : undefined;

  const result: { rateLimit?: RateLimitInfo; retryAfterSeconds?: number } = {};
  if (rateLimit) result.rateLimit = rateLimit;
  if (retryAfter !== undefined) result.retryAfterSeconds = retryAfter;
  return result;
}

function parseIntHeader(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}
