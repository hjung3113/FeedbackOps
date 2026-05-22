// Singleton factory for the S3-compatible storage backend.
//
// `getStorage()` returns a lazy proxy that defers `STORAGE_S3_*` env parsing
// and `new S3Client({...})` construction until the first `put/get/delete/exists`
// call. This keeps `buildServer()` boot cheap for tests and dev runs that
// never touch attachments — env validation still throws loudly, just on
// first real use instead of at module import time (Slice 3 #22 hotfix).
// `__resetStorageForTests()` clears the cache so unit tests can re-exercise
// env parsing without leaking instances across files.
//
// Logging: when the singleton is first materialized (first method call) we
// emit one informational line `storage: bucket=<name> endpoint=<endpoint>`
// (no creds). The secret access key is **never** logged and is omitted from
// `toString()` on the config object — see `redact()` and the
// `Symbol.for('nodejs.util.inspect.custom')` hook below.

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

/**
 * Returns a lazy proxy over the real storage backend. The proxy defers env
 * parsing + `S3Client` construction until the first method call so that boot
 * paths (and integration tests that inject their own storage via
 * `buildServer({ storage })`) do not crash on missing `STORAGE_S3_*` env.
 *
 * Env validation still throws — just at first use, not at import time. The
 * thrown error preserves the existing `storage: missing required env: ...`
 * message so callers / tests can match on it.
 */
export function getStorage(env: StorageEnv = process.env as StorageEnv): StorageBackend {
  if (cachedBackend) return cachedBackend;

  // Materialize on demand. Memoized inside the proxy so we only parse env +
  // build the S3 client once per process even across many method calls.
  let real: StorageBackend | null = null;
  const materialize = (): StorageBackend => {
    if (real) return real;
    const cfg = parseStorageEnv(env);
    // Audit-friendly: log bucket + endpoint only. No creds.
    // Using stderr-bound console.info keeps it out of stdout pipelines while
    // remaining visible to the standard fastify logger.
    console.info(`storage: bucket=${cfg.bucket} endpoint=${cfg.endpoint}`);
    real = new S3CompatStorageBackend(cfg);
    return real;
  };

  // Wrap each call so a synchronous throw from `materialize()` (env missing,
  // S3 client construction failure) surfaces as a rejected promise rather
  // than a thrown error at the call site. Callers `await` these methods and
  // expect Promise-shaped failure.
  const proxy: StorageBackend = {
    put: async (input) => materialize().put(input),
    get: async (key) => materialize().get(key),
    delete: async (key) => materialize().delete(key),
    exists: async (key) => materialize().exists(key),
  };

  cachedBackend = proxy;
  return proxy;
}

/** Test-only: clear the cached singleton. */
export function __resetStorageForTests(): void {
  cachedBackend = null;
}
