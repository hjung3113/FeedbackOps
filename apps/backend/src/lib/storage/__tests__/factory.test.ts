// Unit tests for the storage factory.
//
// Covers (a) env parsing returns a fully-populated config and the singleton
// is the same instance across `getStorage()` calls; (b) the secret access key
// never appears in `redactConfig()` output, the boot log line, or any
// JSON-stringified view of the config.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    vi.spyOn(console, 'info').mockImplementation(() => {});
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

  it('boot log line includes bucket + endpoint but never the secret', () => {
    const calls: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      calls.push(args.map((a) => String(a)).join(' '));
    });
    getStorage(VALID_ENV);
    const joined = calls.join('\n');
    expect(joined).toContain('bucket=fops-attachments');
    expect(joined).toContain('endpoint=http://localhost:9000');
    expect(joined).not.toContain('super-secret-key-do-not-log');
  });
});
