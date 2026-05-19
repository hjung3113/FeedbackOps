import type { ErrorCode } from '@fops/shared';

export interface ApiErrorEnvelope {
  code: ErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  requestable_permission?: {
    permission: string;
    managed_system_id?: string;
    reason_required?: boolean;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ApiErrorEnvelope,
    public readonly requestId?: string,
  ) {
    super(envelope.message);
    this.name = 'ApiError';
  }
  get code(): ErrorCode { return this.envelope.code; }
  get detail(): Record<string, unknown> | undefined { return this.envelope.detail; }
}

export type Tone = 'error' | 'warning' | 'info';
export interface MappedError {
  tone: Tone;
  message: string;
  action?: { label: string; run: () => void } | undefined;
}
