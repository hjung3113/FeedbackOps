// Storage abstraction for the attachment subsystem (Slice 3 #22 / ADR-0011).
//
// One implementation ships: `S3CompatStorageBackend` against MinIO in dev and
// prod, env-swappable to AWS S3 / Cloudflare R2 later. The interface is kept
// deliberately minimal — multipart streaming is handled inside the impl via
// `@aws-sdk/lib-storage` so callers only see a single `put` surface.
//
// HTTP error mapping (`storage.unavailable` → 502) is the route layer's job
// (lands in C3a together with the shared `ErrorCode` enum update). At the
// library boundary we raise `StorageUnavailableError`; the route catches and
// re-throws as `HttpError('storage.unavailable', ...)`. This keeps the
// storage lib free of `@fops/shared` HTTP-envelope concerns.

import type { Readable } from 'node:stream';

export interface StoragePutInput {
  /** Object key. Convention: `{workspace_id}/{uuidv7}/{sanitized_filename}`. */
  key: string;
  /** Object payload as a readable stream or Buffer. */
  bytes: Readable | Buffer;
  /** Declared content type (allowlist enforcement happens at the route layer). */
  mimeType: string;
}

export interface StorageGetResult {
  /** Body as a Node Readable stream. Caller is responsible for piping/closing. */
  stream: Readable;
  /** Content type as recorded by the upstream `put`. */
  mimeType: string;
  /** Size in bytes as reported by the upstream object metadata. */
  size: number;
}

export interface StorageBackend {
  /** Upload an object. Streams via multipart when the SDK decides to. */
  put(input: StoragePutInput): Promise<{ key: string }>;
  /** Download an object as a stream. Throws on missing key. */
  get(key: string): Promise<StorageGetResult>;
  /** Delete an object. Idempotent: missing key is not an error. */
  delete(key: string): Promise<void>;
  /** Existence probe via HEAD. Returns false for missing key. */
  exists(key: string): Promise<boolean>;
}

/**
 * Raised by the storage layer when the upstream object store is unreachable
 * or fails for an infrastructural reason (network error, 5xx from S3/MinIO,
 * unknown bucket, throttled). Route handlers translate this to the
 * ADR-0012 envelope `{ code: 'storage.unavailable', status: 502 }` in C3a.
 */
export class StorageUnavailableError extends Error {
  override readonly name = 'StorageUnavailableError';
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
  }
}
