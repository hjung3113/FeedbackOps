import { describe, expect, it } from 'vitest';
import { statusForCode } from '../errors.js';

describe('statusForCode — Slice 3 #13 prefixes', () => {
  it.each([
    ['voc.severity_not_user_settable', 422],
    ['rich_content.disallowed_node', 422],
    ['rich_content.external_image_forbidden', 422],
    ['attachment.unsupported_pending_storage_slice', 422],
    ['validation.unexpected_field', 422],
  ] as const)('%s → %d', (code, status) => {
    expect(statusForCode(code as never)).toBe(status);
  });
});
