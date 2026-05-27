import { describe, expect, it } from 'vitest';
import { AttachmentCreatedSchema } from '../attachment.js';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';
const VALID = {
  id: UUID,
  name: 'screenshot.png',
  size_bytes: 12345,
  mime_type: 'image/png',
  uploaded_by_actor_id: UUID2,
  created_at: '2026-05-22T10:00:00.000Z',
};

describe('AttachmentCreatedSchema', () => {
  it('parses 201 envelope', () => {
    const parsed = AttachmentCreatedSchema.parse(VALID);
    expect(parsed.id).toBe(UUID);
    expect(parsed.size_bytes).toBe(12345);
    expect(parsed.mime_type).toBe('image/png');
    expect(parsed.uploaded_by_actor_id).toBe(UUID2);
  });

  it('rejects extra fields (.strict)', () => {
    expect(() =>
      AttachmentCreatedSchema.parse({ ...VALID, storage_uri: 's3://...' }),
    ).toThrow();
  });

  it('rejects negative size_bytes', () => {
    expect(() => AttachmentCreatedSchema.parse({ ...VALID, size_bytes: -1 })).toThrow();
  });

  it('requires uuid id', () => {
    expect(() => AttachmentCreatedSchema.parse({ ...VALID, id: 'not-a-uuid' })).toThrow();
  });

  it('requires uuid uploaded_by_actor_id', () => {
    expect(() =>
      AttachmentCreatedSchema.parse({ ...VALID, uploaded_by_actor_id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('created_at parses as ISO 8601 datetime string', () => {
    const parsed = AttachmentCreatedSchema.parse(VALID);
    expect(parsed.created_at).toBe('2026-05-22T10:00:00.000Z');
    expect(() => AttachmentCreatedSchema.parse({ ...VALID, created_at: 'not-a-date' })).toThrow();
  });
});
