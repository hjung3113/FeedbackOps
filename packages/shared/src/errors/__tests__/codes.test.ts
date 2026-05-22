import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from '../codes.js';

describe('errorCodeSchema — Slice 3 #13 codes', () => {
  it.each([
    'voc.severity_not_user_settable',
    'validation.unexpected_field',
    'rich_content.disallowed_node',
    'rich_content.external_image_forbidden',
    'attachment.unsupported_pending_storage_slice',
  ])('parses %s', (code) => {
    expect(errorCodeSchema.parse(code)).toBe(code);
  });
});

describe('errorCodeSchema — Slice 3 #17 codes', () => {
  it('parses conflict.triage_already_committed', () => {
    expect(errorCodeSchema.parse('conflict.triage_already_committed')).toBe(
      'conflict.triage_already_committed',
    );
  });

  it('rejects unknown code', () => {
    expect(() => errorCodeSchema.parse('conflict.unknown_code')).toThrow();
  });
});

describe('errorCodeSchema — Slice 3 #22 / PLAN-22 C3a codes', () => {
  it.each([
    'storage.unavailable',
    'attachment.too_large',
    'attachment.unsupported_type',
    'not_implemented.todo',
  ])('parses %s', (code) => {
    expect(errorCodeSchema.parse(code)).toBe(code);
  });
});
