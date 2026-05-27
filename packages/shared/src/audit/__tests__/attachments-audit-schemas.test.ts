// Schema-level tests for the attachments audit detail vocab (PLAN-22 C3a).
//
// Locks the privacy invariant: `filename` must never appear in the audit
// detail. The `.strict()` mode on the schema is what enforces it; this test
// pins that behavior so a future refactor cannot silently relax it.

import { describe, expect, it } from 'vitest';

import { attachmentUploadedDetailSchema } from '../attachments.js';
import { AUDIT_EVENT_TYPES, AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const V = '01919b8c-0000-7000-8000-000000000002';

const canonical = {
  attachment_id: U,
  actor_id: V,
  storage_key: 'ws-1/01919b8c-0000-7000-8000-000000000003/photo.png',
  size_bytes: 12345,
  mime_type: 'image/png',
};

describe('attachmentUploadedDetailSchema', () => {
  it('parses canonical detail', () => {
    expect(attachmentUploadedDetailSchema.parse(canonical)).toEqual(canonical);
  });

  it('rejects detail with filename field (privacy invariant — .strict())', () => {
    expect(() =>
      attachmentUploadedDetailSchema.parse({ ...canonical, filename: 'photo.png' }),
    ).toThrow();
  });

  it('rejects missing attachment_id', () => {
    const { attachment_id: _drop, ...rest } = canonical;
    expect(() => attachmentUploadedDetailSchema.parse(rest)).toThrow();
  });

  it('rejects missing storage_key', () => {
    const { storage_key: _drop, ...rest } = canonical;
    expect(() => attachmentUploadedDetailSchema.parse(rest)).toThrow();
  });

  it('rejects negative size_bytes', () => {
    expect(() =>
      attachmentUploadedDetailSchema.parse({ ...canonical, size_bytes: -1 }),
    ).toThrow();
  });
});

describe('AUDIT_EVENT_TYPES — attachment_uploaded', () => {
  it('includes attachment_uploaded', () => {
    expect(AUDIT_EVENT_TYPES).toContain('attachment_uploaded');
  });

  it('is registered with attachmentUploadedDetailSchema', () => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.attachment_uploaded).toBe(attachmentUploadedDetailSchema);
  });
});
