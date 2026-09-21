// Unit tests for the storage factory.
//
// Covers (a) env parsing returns a fully-populated config and the singleton
// is the same instance across `getStorage()` calls; (b) the secret access key
// never appears in `redactConfig()` output, the structured
// `storage: materialized` line, or any JSON-stringified view of the config.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobLog } from '../../job-log.js';
import {
  __resetStorageForTests,
  getStorage,
  parseStorageEnv,
  redactConfig,
  type StorageEnv,
} from '../factory.js';

const VALID_ENV: StorageEnv = {
  STORAGE_S3_ENDPOINT: 'http://localhost:9000',
  STORAGE_S3_REGION: 'us-east-1',
  STORAGE_S3_BUCKET: 'fops-attachments',
  STORAGE_S3_ACCESS_KEY_ID: 'minio',
  STORAGE_S3_SECRET_ACCESS_KEY: 'super-secret-key-do-not-log',
  STORAGE_S3_FORCE_PATH_STYLE: 'true',
};

describe('factory', () => {
  beforeEach(() => {
    __resetStorageForTests();
  });

  afterEach(() => {
    __resetStorageForTests();
    vi.restoreAllMocks();
  });

  it('parses STORAGE_S3_* env and returns singleton', () => {
    const cfg = parseStorageEnv(VALID_ENV);
    expect(cfg).toEqual({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'fops-attachments',
      accessKeyId: 'minio',
      secretAccessKey: 'super-secret-key-do-not-log',
      forcePathStyle: true,
    });

    const a = getStorage(VALID_ENV);
    const b = getStorage(VALID_ENV);
    expect(a).toBe(b);
  });

  it('throws on missing required env vars', () => {
    const { STORAGE_S3_BUCKET: _b, ...withoutBucket } = VALID_ENV;
    expect(() => parseStorageEnv(withoutBucket)).toThrow(/STORAGE_S3_BUCKET/);
    expect(() =>
      parseStorageEnv({
        STORAGE_S3_ENDPOINT: '',
        STORAGE_S3_REGION: '',
        STORAGE_S3_BUCKET: '',
        STORAGE_S3_ACCESS_KEY_ID: '',
        STORAGE_S3_SECRET_ACCESS_KEY: '',
      }),
    ).toThrow(/missing required env/);
  });

  it('defaults forcePathStyle to true (MinIO requirement)', () => {
    const { STORAGE_S3_FORCE_PATH_STYLE: _f, ...withoutForce } = VALID_ENV;
    const cfg = parseStorageEnv(withoutForce);
    expect(cfg.forcePathStyle).toBe(true);
  });

  it('redacts STORAGE_S3_SECRET_ACCESS_KEY from any toString/log output', () => {
    const cfg = parseStorageEnv(VALID_ENV);
    const redacted = redactConfig(cfg);
    const blob = JSON.stringify(redacted);
    expect(blob).not.toContain('super-secret-key-do-not-log');
    expect(redacted.secretAccessKey).toBe('***REDACTED***');
  });

  it('logs storage: materialized ONCE with endpoint_origin, never the secret or userinfo', async () => {
    const calls: Array<{ msg: string; meta: Record<string, unknown> }> = [];
    const log: JobLog = {
      info: (msg, meta) => calls.push({ msg, meta: meta ?? {} }),
      warn: () => {},
      error: () => {},
    };
    const consoleInfo = vi.spyOn(console, 'info');
    const env: StorageEnv = {
      ...VALID_ENV,
      STORAGE_S3_ENDPOINT: 'http://user:pw@minio:9000/x',
    };
    const backend = getStorage(env, { log });
    // Lazy init: the line fires on the first method call — and only then.
    await backend.exists('any-key').catch(() => {
      /* expected: no MinIO running in unit tests */
    });
    await backend.exists('other-key').catch(() => {});

    const materialized = calls.filter((c) => c.msg === 'storage: materialized');
    expect(materialized).toHaveLength(1);
    const meta = materialized[0]?.meta;
    expect(meta?.endpoint_origin).toBe('http://minio:9000');
    expect(meta?.bucket).toBe('fops-attachments');
    expect(meta?.region).toBe('us-east-1');
    expect(meta?.force_path_style).toBe(true);

    // No secret keys or values, no userinfo from the endpoint, no key names.
    const blob = JSON.stringify(calls);
    expect(blob).not.toContain('super-secret-key-do-not-log');
    expect(blob).not.toContain('pw');
    expect(blob).not.toContain('user:');
    expect('accessKeyId' in (meta ?? {})).toBe(false);
    expect('secretAccessKey' in (meta ?? {})).toBe(false);
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('logs the literal invalid origin for an endpoint that does not parse', async () => {
    const calls: Array<{ msg: string; meta: Record<string, unknown> }> = [];
    const log: JobLog = {
      info: (msg, meta) => calls.push({ msg, meta: meta ?? {} }),
      warn: () => {},
      error: () => {},
    };
    const backend = getStorage({ ...VALID_ENV, STORAGE_S3_ENDPOINT: 'not-a-url' }, { log });
    await backend.exists('k').catch(() => {});

    const meta = calls.find((c) => c.msg === 'storage: materialized')?.meta;
    expect(meta?.endpoint_origin).toBe('invalid');
  });

  it('without a logger logs nothing and never touches console.info', async () => {
    const consoleInfo = vi.spyOn(console, 'info');
    const backend = getStorage(VALID_ENV);
    await backend.exists('any-key').catch(() => {
      /* expected: no MinIO running in unit tests */
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  // ─── Lazy init (Slice 3 #22 hotfix) ──────────────────────────────────────
  // Bug: boot path of integration tests called getStorage() unconditionally,
  // which threw "missing required env" and crashed unrelated suites.
  // Contract: getStorage() must be cheap and never validate env until a
  // storage method is actually invoked. parseStorageEnv() retains its
  // strict throw-on-missing semantics — production failures still loud.
  describe('lazy initialization', () => {
    const MISSING_ENV: StorageEnv = {};

    it('getStorage() does NOT throw if env missing (lazy init)', () => {
      expect(() => getStorage(MISSING_ENV)).not.toThrow();
    });

    it('first put() with missing env throws missing-env error', async () => {
      const backend = getStorage(MISSING_ENV);
      await expect(
        backend.put({ key: 'k', bytes: Buffer.from(''), mimeType: 'text/plain' }),
      ).rejects.toThrow(/missing required env/);
    });

    it('first exists() with missing env throws missing-env error', async () => {
      const backend = getStorage(MISSING_ENV);
      await expect(backend.exists('k')).rejects.toThrow(/missing required env/);
    });
  });
});
