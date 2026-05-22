// S3-compatible storage backend (MinIO in dev + prod per #22 D-02).
//
// Uses `@aws-sdk/client-s3` for HEAD/GET/DELETE and `@aws-sdk/lib-storage`
// `Upload` for streaming multipart `put`. The `Upload` helper handles the
// multipart-vs-single-part decision internally based on the body size — we
// just hand it the stream.
//
// Error mapping:
//   * `NoSuchKey` from GetObject → re-thrown as-is so the route layer can map
//     to a 404 envelope (`not_found.record`).
//   * Anything else that smells infrastructural — `NoSuchBucket`,
//     `ServiceUnavailable`, `SlowDown`, generic network errors (`ECONNREFUSED`,
//     `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`) — is wrapped in
//     `StorageUnavailableError`. The route layer translates this to the
//     ADR-0012 envelope `{ code: 'storage.unavailable', status: 502 }`.
//   * `HeadObject` 404 is a normal "not present" signal, not an error.
//   * `DeleteObject` is idempotent by S3 contract; we still catch
//     `NoSuchKey`/`NotFound` defensively.

import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

import {
  StorageUnavailableError,
  type StorageBackend,
  type StorageGetResult,
  type StoragePutInput,
} from './index.js';

export interface S3CompatConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO and most non-AWS S3 implementations require path-style addressing. */
  forcePathStyle: boolean;
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
]);

const UNAVAILABLE_AWS_NAMES = new Set([
  'NoSuchBucket',
  'ServiceUnavailable',
  'SlowDown',
  'RequestTimeout',
  'InternalError',
  'InternalFailure',
]);

function isUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown; $metadata?: { httpStatusCode?: number } };
  if (typeof e.name === 'string' && UNAVAILABLE_AWS_NAMES.has(e.name)) return true;
  if (typeof e.code === 'string' && NETWORK_ERROR_CODES.has(e.code)) return true;
  const status = e.$metadata?.httpStatusCode;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  return false;
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  if (e.name === 'NoSuchKey' || e.name === 'NotFound') return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}

export class S3CompatStorageBackend implements StorageBackend {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(cfg: S3CompatConfig, clientOverride?: S3Client) {
    this.#bucket = cfg.bucket;
    if (clientOverride) {
      this.#client = clientOverride;
      return;
    }
    const clientCfg: S3ClientConfig = {
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    };
    this.#client = new S3Client(clientCfg);
  }

  /** Exposed for the bootstrap CLI which needs HeadBucket / CreateBucket on the same client. */
  get client(): S3Client {
    return this.#client;
  }

  get bucket(): string {
    return this.#bucket;
  }

  async put(input: StoragePutInput): Promise<{ key: string }> {
    try {
      const upload = new Upload({
        client: this.#client,
        params: {
          Bucket: this.#bucket,
          Key: input.key,
          Body: input.bytes,
          ContentType: input.mimeType,
        },
      });
      await upload.done();
      return { key: input.key };
    } catch (err) {
      if (isUnavailable(err)) {
        throw new StorageUnavailableError(
          `storage: put failed for key=${input.key}`,
          err,
        );
      }
      throw err;
    }
  }

  async get(key: string): Promise<StorageGetResult> {
    try {
      const out = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      const body = out.Body;
      if (!body) {
        throw new StorageUnavailableError(
          `storage: get returned empty body for key=${key}`,
        );
      }
      // The SDK types Body as `StreamingBlobPayloadOutputTypes`. In Node it is
      // a Readable; cast via `unknown` to avoid `any`.
      const stream = body as unknown as Readable;
      return {
        stream,
        mimeType: out.ContentType ?? 'application/octet-stream',
        size: typeof out.ContentLength === 'number' ? out.ContentLength : 0,
      };
    } catch (err) {
      if (isNotFound(err)) throw err;
      if (isUnavailable(err)) {
        throw new StorageUnavailableError(`storage: get failed for key=${key}`, err);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.#client.send(
        new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
    } catch (err) {
      // S3 DeleteObject is idempotent on missing keys, but some non-AWS
      // implementations surface a 404 instead of a no-op. Treat as success.
      if (isNotFound(err)) return;
      if (isUnavailable(err)) {
        throw new StorageUnavailableError(`storage: delete failed for key=${key}`, err);
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      if (isUnavailable(err)) {
        throw new StorageUnavailableError(`storage: exists failed for key=${key}`, err);
      }
      throw err;
    }
  }
}
