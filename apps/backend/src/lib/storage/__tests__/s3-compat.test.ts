// Unit tests for S3CompatStorageBackend.
//
// We mock the S3 client via `aws-sdk-client-mock` so these tests run without
// any container or network. The `Upload` helper from `@aws-sdk/lib-storage`
// dispatches `PutObjectCommand` (single-part) or `CreateMultipartUpload`
// (multipart) on the same mocked client — we assert via mock call counts.

import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageUnavailableError } from '../index.js';
import { S3CompatStorageBackend } from '../s3-compat.js';

const BUCKET = 'fops-attachments-test';

function makeBackend(): { backend: S3CompatStorageBackend; mock: ReturnType<typeof mockClient> } {
  const client = new S3Client({ region: 'us-east-1' });
  const mock = mockClient(client);
  const backend = new S3CompatStorageBackend(
    {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: BUCKET,
      accessKeyId: 'x',
      secretAccessKey: 'y',
      forcePathStyle: true,
    },
    client,
  );
  return { backend, mock };
}

describe('s3-compat', () => {
  let ctx: { backend: S3CompatStorageBackend; mock: ReturnType<typeof mockClient> };

  beforeEach(() => {
    ctx = makeBackend();
  });

  afterEach(() => {
    ctx.mock.reset();
  });

  it('put() streams via lib-storage Upload and returns storage_key', async () => {
    ctx.mock.on(PutObjectCommand).resolves({ ETag: '"deadbeef"' });
    const body = Readable.from([Buffer.from('hello world')]);
    const result = await ctx.backend.put({
      key: 'ws-1/uuid/file.txt',
      bytes: body,
      mimeType: 'text/plain',
    });
    expect(result.key).toBe('ws-1/uuid/file.txt');
    // lib-storage Upload uses PutObjectCommand for small bodies.
    const calls = ctx.mock.commandCalls(PutObjectCommand);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]?.args[0].input.Bucket).toBe(BUCKET);
    expect(calls[0]?.args[0].input.Key).toBe('ws-1/uuid/file.txt');
    expect(calls[0]?.args[0].input.ContentType).toBe('text/plain');
  });

  it('get() returns a readable stream', async () => {
    const payload = Readable.from([Buffer.from('downloaded')]);
    // Cast: SDK types Body as StreamingBlobPayloadOutputTypes (sdk-types-stream),
    // which is structurally a Readable in Node. Mock requires this exact shape.
    ctx.mock.on(GetObjectCommand).resolves({
      Body: payload as unknown as never,
      ContentType: 'text/plain',
      ContentLength: 10,
    });
    const result = await ctx.backend.get('ws-1/uuid/file.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(result.size).toBe(10);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('downloaded');
  });

  it('delete() is idempotent on missing key', async () => {
    ctx.mock.on(DeleteObjectCommand).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }),
    );
    await expect(ctx.backend.delete('ws-1/uuid/missing.txt')).resolves.toBeUndefined();
  });

  it('exists() returns false for missing key, true after put', async () => {
    ctx.mock
      .on(HeadObjectCommand)
      .rejectsOnce(
        Object.assign(new Error('NotFound'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .resolves({ ContentLength: 11, ContentType: 'text/plain' });

    expect(await ctx.backend.exists('ws-1/uuid/file.txt')).toBe(false);

    ctx.mock.on(PutObjectCommand).resolves({});
    await ctx.backend.put({
      key: 'ws-1/uuid/file.txt',
      bytes: Buffer.from('hello world'),
      mimeType: 'text/plain',
    });
    expect(await ctx.backend.exists('ws-1/uuid/file.txt')).toBe(true);
  });

  it('put() surfaces storage.unavailable for network errors', async () => {
    ctx.mock
      .on(PutObjectCommand)
      .rejects(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(
      ctx.backend.put({
        key: 'ws-1/uuid/file.txt',
        bytes: Buffer.from('hi'),
        mimeType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('put() wraps NoSuchBucket as storage.unavailable', async () => {
    ctx.mock.on(PutObjectCommand).rejects(
      Object.assign(new Error('NoSuchBucket'), {
        name: 'NoSuchBucket',
        $metadata: { httpStatusCode: 404 },
      }),
    );
    await expect(
      ctx.backend.put({
        key: 'ws-1/uuid/file.txt',
        bytes: Buffer.from('hi'),
        mimeType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('get() re-throws NoSuchKey for the route layer to map to 404', async () => {
    ctx.mock.on(GetObjectCommand).rejects(
      Object.assign(new Error('NoSuchKey'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      }),
    );
    await expect(ctx.backend.get('missing')).rejects.toMatchObject({ name: 'NoSuchKey' });
  });
});
