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
