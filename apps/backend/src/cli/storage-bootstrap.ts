// Idempotent bucket-create CLI for the MinIO (or any S3-compat) backend.
//
// Usage:
//   pnpm --filter @fops/backend exec tsx src/cli/storage-bootstrap.ts
//
// Behavior:
//   * HeadBucket → if 200, log `bucket ready: <name>` and exit 0.
//   * HeadBucket → 404 / NotFound / NoSuchBucket → CreateBucket, log
//     `bucket created: <name>`, exit 0.
//   * Any other error → log + exit 1. Network failures surface as
//     StorageUnavailableError-shaped messages so operators see the
//     same diagnostic as the runtime route layer.

import {
  CreateBucketCommand,
  HeadBucketCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { parseStorageEnv } from '../lib/storage/factory.js';
import { S3CompatStorageBackend } from '../lib/storage/s3-compat.js';

interface BootstrapResult {
  bucket: string;
  created: boolean;
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  if (e.name === 'NotFound' || e.name === 'NoSuchBucket') return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}

export async function bootstrapBucket(
  client: S3Client,
  bucket: string,
): Promise<BootstrapResult> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { bucket, created: false };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return { bucket, created: true };
}

async function main(): Promise<void> {
  // Build the concrete backend directly. `getStorage()` returns a lazy proxy
  // (Slice 3 #22 hotfix) so `instanceof` against the proxy always fails; the
  // CLI needs the raw `client` + `bucket` fields for the SDK Head/Create calls.
  const cfg = parseStorageEnv(process.env);
  const backend = new S3CompatStorageBackend(cfg);
  const result = await bootstrapBucket(backend.client, backend.bucket);
  if (result.created) {
    console.info(`bucket created: ${result.bucket}`);
  } else {
    console.info(`bucket ready: ${result.bucket}`);
  }
}

// Run only when invoked as a script, not on import (tests import
// `bootstrapBucket` directly).
const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('storage-bootstrap.ts') === true ||
  process.argv[1]?.endsWith('storage-bootstrap.js') === true;

if (invokedAsScript) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`storage-bootstrap failed: ${msg}`);
    process.exit(1);
  });
}
