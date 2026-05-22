// Unit test for the storage-bootstrap CLI helper.
//
// We exercise `bootstrapBucket` directly with a mocked S3 client; the
// script-entry path (`main`) is intentionally not invoked here.

import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapBucket } from '../storage-bootstrap.js';

describe('storage-bootstrap CLI', () => {
  const client = new S3Client({ region: 'us-east-1' });
  const mock = mockClient(client);

  beforeEach(() => {
    mock.reset();
  });
  afterEach(() => {
    mock.reset();
  });

  it('creates bucket if missing; no-op if present', async () => {
    // First call: HEAD 404 → CREATE
    mock.on(HeadBucketCommand).rejectsOnce(
      Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    );
    mock.on(CreateBucketCommand).resolves({});
    const created = await bootstrapBucket(client, 'fops-attachments');
    expect(created).toEqual({ bucket: 'fops-attachments', created: true });
    expect(mock.commandCalls(CreateBucketCommand)).toHaveLength(1);

    // Second call: HEAD 200 → no CREATE
    mock.reset();
    mock.on(HeadBucketCommand).resolves({});
    const reuse = await bootstrapBucket(client, 'fops-attachments');
    expect(reuse).toEqual({ bucket: 'fops-attachments', created: false });
    expect(mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
  });
});
