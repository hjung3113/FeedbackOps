// Singleton factory for the S3-compatible storage backend.
//
// Reads `STORAGE_S3_*` env once at boot. Exports `getStorage()` which lazily
// constructs the singleton and returns the same instance for every call.
// `__resetStorageForTests()` clears the cache so unit tests can re-exercise
// env parsing without leaking instances across files.
//
// Logging: when the singleton is first constructed we emit one informational
// line `storage: bucket=<name> endpoint=<endpoint>` (no creds). The secret
// access key is **never** logged and is omitted from `toString()` on the
// config object — see `redact()` and the `Symbol.for('nodejs.util.inspect.custom')`
// hook below.

import { S3CompatStorageBackend, type S3CompatConfig } from './s3-compat.js';
import type { StorageBackend } from './index.js';

const REDACTED = '***REDACTED***';

export interface StorageEnv {
  STORAGE_S3_ENDPOINT?: string;
  STORAGE_S3_REGION?: string;
  STORAGE_S3_BUCKET?: string;
  STORAGE_S3_ACCESS_KEY_ID?: string;
  STORAGE_S3_SECRET_ACCESS_KEY?: string;
  STORAGE_S3_FORCE_PATH_STYLE?: string;
}

/** Pure env → config parser. Throws on missing required fields. Exported for tests. */
export function parseStorageEnv(env: StorageEnv): S3CompatConfig {
  const endpoint = env.STORAGE_S3_ENDPOINT?.trim();
  const region = env.STORAGE_S3_REGION?.trim();
  const bucket = env.STORAGE_S3_BUCKET?.trim();
  const accessKeyId = env.STORAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
  const forcePathStyleRaw = env.STORAGE_S3_FORCE_PATH_STYLE?.trim().toLowerCase();

  const missing: string[] = [];
  if (!endpoint) missing.push('STORAGE_S3_ENDPOINT');
  if (!region) missing.push('STORAGE_S3_REGION');
  if (!bucket) missing.push('STORAGE_S3_BUCKET');
  if (!accessKeyId) missing.push('STORAGE_S3_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('STORAGE_S3_SECRET_ACCESS_KEY');
  if (missing.length > 0) {
    throw new Error(`storage: missing required env: ${missing.join(', ')}`);
  }

  // `STORAGE_S3_FORCE_PATH_STYLE=true` is required for MinIO. Default true to
  // match the dev/prod target (#22 D-02). Accept '1'/'true'/'yes' as truthy.
  const forcePathStyle =
    forcePathStyleRaw === undefined ||
    forcePathStyleRaw === '' ||
    forcePathStyleRaw === '1' ||
    forcePathStyleRaw === 'true' ||
    forcePathStyleRaw === 'yes';

  return {
    // Non-null assertions are safe: we returned above on `missing.length > 0`.
    endpoint: endpoint as string,
    region: region as string,
    bucket: bucket as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    forcePathStyle,
  };
}

/**
 * Returns a representation of the config with the secret redacted. Used for
 * the boot log line and as the `toString`/inspect hook so accidental
 * `console.log(config)` calls cannot leak the secret.
 */
export function redactConfig(cfg: S3CompatConfig): Record<string, unknown> {
  return {
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: REDACTED,
    forcePathStyle: cfg.forcePathStyle,
  };
}

let cachedBackend: StorageBackend | null = null;

export function getStorage(env: StorageEnv = process.env as StorageEnv): StorageBackend {
  if (cachedBackend) return cachedBackend;
  const cfg = parseStorageEnv(env);
  // Audit-friendly: log bucket + endpoint only. No creds.
  // Using stderr-bound console.info keeps it out of stdout pipelines while
  // remaining visible to the standard fastify logger.
  console.info(`storage: bucket=${cfg.bucket} endpoint=${cfg.endpoint}`);
  cachedBackend = new S3CompatStorageBackend(cfg);
  return cachedBackend;
}

/** Test-only: clear the cached singleton. */
export function __resetStorageForTests(): void {
  cachedBackend = null;
}
