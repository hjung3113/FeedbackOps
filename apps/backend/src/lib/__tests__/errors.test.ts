import { describe, expect, it } from 'vitest';
import { statusForCode } from '../errors.js';

describe('statusForCode — Slice 3 #13 prefixes', () => {
  it.each([
    ['voc.severity_not_user_settable', 422],
    ['rich_content.disallowed_node', 422],
    ['rich_content.external_image_forbidden', 422],
    ['validation.unexpected_field', 422],
  ] as const)('%s → %d', (code, status) => {
    expect(statusForCode(code as never)).toBe(status);
  });
});

describe('statusForCode — PLAN-22 C3a storage prefix', () => {
  it('storage.unavailable → 502', () => {
    expect(statusForCode('storage.unavailable' as never)).toBe(502);
  });

  it('attachment.too_large → 422', () => {
    expect(statusForCode('attachment.too_large' as never)).toBe(422);
  });

  it('attachment.unsupported_type → 422', () => {
    expect(statusForCode('attachment.unsupported_type' as never)).toBe(422);
  });

  it('not_implemented.todo → 501', () => {
    expect(statusForCode('not_implemented.todo' as never)).toBe(501);
  });
});
