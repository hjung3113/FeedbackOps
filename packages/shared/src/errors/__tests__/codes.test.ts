import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from '../codes.js';

describe('errorCodeSchema — Slice 3 #13 codes', () => {
  it.each([
    'voc.severity_not_user_settable',
    'validation.unexpected_field',
    'rich_content.disallowed_node',
    'rich_content.disallowed_attr',
    'rich_content.invalid_attr_value',
    'rich_content.missing_required_attr',
    'rich_content.external_image_forbidden',
  ])('parses %s', (code) => {
    expect(errorCodeSchema.parse(code)).toBe(code);
  });

  it('rejects retired attachment.unsupported_pending_storage_slice (PLAN-22 C7b)', () => {
    expect(() => errorCodeSchema.parse('attachment.unsupported_pending_storage_slice')).toThrow();
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

describe('errorCodeSchema — Slice 8 #185 survey response submission codes', () => {
  it.each(['conflict.survey_not_open', 'conflict.survey_response_already_submitted'])(
    'parses %s',
    (code) => {
      expect(errorCodeSchema.parse(code)).toBe(code);
    },
  );
});
