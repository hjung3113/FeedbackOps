import type { ErrorCode, ErrorEnvelope } from '@fops/shared';

// Re-export the shared envelope under the FE alias so callers don't need
// to import from two packages. The shape is authoritative in @fops/shared
// (packages/shared/src/errors/codes.ts); do NOT duplicate it here.
export type { ErrorEnvelope as ApiErrorEnvelope } from '@fops/shared';

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope,
    public readonly requestId?: string,
    public readonly rateLimit?: RateLimitInfo,
    public readonly retryAfterSeconds?: number,
  ) {
    super(envelope.message);
    this.name = 'ApiError';
  }
  get code(): ErrorCode {
    return this.envelope.code;
  }
  get detail(): Record<string, unknown> | undefined {
    return this.envelope.detail;
  }
}

export type Tone = 'error' | 'warning' | 'info';
export interface MappedError {
  tone: Tone;
  message: string;
  action?: { label: string; run: () => void } | undefined;
}

/** One sanitized parse-failure issue: the zod issue path and machine code only. */
export interface ApiParseIssue {
  path: string[];
  code: string;
}

const MAX_PARSE_ISSUES = 5;

/**
 * Thrown by `apiRequest` when a 2xx (non-304) response body fails its runtime
 * parser. Extending ApiError keeps the `instanceof ApiError` code paths
 * working (errorMapper catalog, hooks' retry predicates); the envelope reuses
 * `internal.unexpected`, which the errorMapper already maps to the generic
 * user-facing copy. Privacy: the envelope carries NO offending payload values
 * and no parser messages that could echo them — only issue paths and codes.
 */
export class ApiParseError extends ApiError {
  constructor(
    status: number,
    endpoint: string,
    issues: ApiParseIssue[],
    requestId?: string,
  ) {
    super(
      status,
      {
        code: 'internal.unexpected',
        message: 'invalid response payload',
        detail: { endpoint, issues: issues.slice(0, MAX_PARSE_ISSUES) },
      },
      requestId,
    );
    this.name = 'ApiParseError';
  }
}
