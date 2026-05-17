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
