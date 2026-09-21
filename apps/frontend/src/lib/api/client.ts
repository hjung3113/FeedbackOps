import { mintIdempotencyKey } from './idempotency';
import {
  ApiError,
  type ApiErrorEnvelope,
  ApiParseError,
  type ApiParseIssue,
  type RateLimitInfo,
} from './types';

export interface ApiClientOptions {
  body?: unknown;
  /**
   * Multipart body. When set, `body` is ignored and Content-Type is NOT set
   * (browser fills in `multipart/form-data; boundary=...`). Used by
   * POST /attachments (PLAN-22 C5).
   */
  formData?: FormData;
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

/**
 * Structural parser contract for {@link apiRequest}: any Zod schema satisfies
 * it (its `parse` method matches), and plain `(data: unknown) => T` functions
 * work too.
 */
export type ApiParser<T> = ((data: unknown) => T) | { parse(data: unknown): T };

/** Raw transport outcome before any success-payload typing is applied. */
interface RawApiResponse {
  status: number;
  /** 304: body was not sent; `data` is undefined and must not be parsed. */
  notModified: boolean;
  data: unknown;
  etag: string | undefined;
  requestId: string | undefined;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
}

/**
 * The one place that talks to the network: headers, idempotency, fetch,
 * 304 short-circuit, error-envelope handling. Both {@link apiClient} and
 * {@link apiRequest} are thin adapters over this.
 */
async function sendRequest(
  method: string,
  path: string,
  opts: ApiClientOptions,
): Promise<RawApiResponse> {
  const upper = method.toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };

  // Only JSON bodies set Content-Type; multipart leaves it to the browser
  // so it can append the boundary parameter.
  if (opts.formData === undefined && opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATION_METHODS.has(upper)) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? mintIdempotencyKey();
  }
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
  if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;

  const fetchInit: RequestInit = {
    method: upper,
    headers,
    credentials: 'include',
  };
  if (opts.signal != null) fetchInit.signal = opts.signal;
  if (opts.formData !== undefined) {
    fetchInit.body = opts.formData;
  } else if (opts.body !== undefined) {
    fetchInit.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, fetchInit);

  const etag = res.headers.get('etag') ?? undefined;
  const requestId = res.headers.get('x-request-id') ?? undefined;
  const { rateLimit, retryAfterSeconds } = parseRateLimitHeaders(res.headers);

  if (res.status === 304) {
    const base: RawApiResponse = {
      status: 304,
      notModified: true,
      data: undefined,
      etag,
      requestId,
    };
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

  const base: RawApiResponse = {
    status: res.status,
    notModified: false,
    data,
    etag,
    requestId,
  };
  if (rateLimit) base.rateLimit = rateLimit;
  if (retryAfterSeconds !== undefined) base.retryAfterSeconds = retryAfterSeconds;
  return base;
}

function rawToResponse<T>(raw: RawApiResponse, data: T): ApiResponse<T> {
  const base: ApiResponse<T> = {
    status: raw.status,
    data,
    etag: raw.etag,
    requestId: raw.requestId,
  };
  if (raw.rateLimit) base.rateLimit = raw.rateLimit;
  if (raw.retryAfterSeconds !== undefined) base.retryAfterSeconds = raw.retryAfterSeconds;
  return base;
}

/**
 * Extracts only issue paths and machine codes from a parser failure. Zod
 * issues carry the offending values inside their messages, so the messages
 * themselves are dropped — response payload values never surface in the
 * thrown error. Non-Zod parser exceptions yield an empty issue list.
 */
function parseIssuesFrom(cause: unknown): ApiParseIssue[] {
  if (!(cause instanceof Error)) return [];
  const issues = (cause as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  const out: ApiParseIssue[] = [];
  for (const issue of issues) {
    if (issue && typeof issue === 'object') {
      const { path, code } = issue as { path?: unknown; code?: unknown };
      out.push({
        path: Array.isArray(path) ? path.map(String) : [],
        code: typeof code === 'string' ? code : 'custom',
      });
    }
  }
  return out;
}

/**
 * GET/POST/... with REQUIRED runtime validation of the success payload.
 * Performs the same request, headers, and error-envelope handling as
 * {@link apiClient}; on a 2xx non-304 response it runs `parser.parse(data)`
 * and throws {@link ApiParseError} (a subclass of ApiError) when the payload
 * does not match. 304 responses skip parsing (`data` undefined, as today).
 * A Zod schema satisfies `parser` structurally; plain functions work too.
 *
 * New product endpoints MUST use this (see
 * `lib/api/api-unparsed-allowlist.txt` for the audited legacy exceptions).
 */
export async function apiRequest<T>(
  method: string,
  path: string,
  parser: ApiParser<T>,
  opts: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const raw = await sendRequest(method, path, opts);
  if (raw.notModified) return rawToResponse(raw, undefined as T);

  const parse = typeof parser === 'function' ? parser : (input: unknown) => parser.parse(input);
  const query = path.indexOf('?');
  const endpoint = `${method.toUpperCase()} ${query === -1 ? path : path.slice(0, query)}`;
  let data: T;
  try {
    data = parse(raw.data);
  } catch (cause) {
    throw new ApiParseError(raw.status, endpoint, parseIssuesFrom(cause), raw.requestId);
  }
  return rawToResponse(raw, data);
}

/**
 * @deprecated Use {@link apiRequest} with a shared schema; see
 * `lib/api/api-unparsed-allowlist.txt`. Kept only for legacy endpoints that
 * have not migrated yet — it trusts the network (`data as T`) and MUST NOT be
 * called from new product endpoints.
 */
export async function apiClient<T = unknown>(
  method: string,
  path: string,
  opts: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const raw = await sendRequest(method, path, opts);
  return rawToResponse(raw, raw.notModified ? (undefined as T) : (raw.data as T));
}

// Parses fastify @fastify/rate-limit response headers.
// `x-ratelimit-reset` is unix epoch seconds; `retry-after` is delta-seconds.
// All four headers must be present and integer-parseable for rateLimit to be populated;
// otherwise the field is omitted (callers fall back to generic copy).
function parseRateLimitHeaders(headers: Headers): {
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
} {
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
