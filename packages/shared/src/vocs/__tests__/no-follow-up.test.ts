import { describe, expect, it } from 'vitest';
import { recordVocNoFollowUpRequestSchema, vocFollowUpStateSchema } from '../no-follow-up.js';

describe('VOC no-follow-up contract', () => {
  it('trims a required reason and rejects oversized raw input and extra fields', () => {
    expect(recordVocNoFollowUpRequestSchema.parse({ reason: '  조치 불필요  ' })).toEqual({
      reason: '조치 불필요',
    });
    for (const input of [
      {},
      { reason: '   ' },
      { reason: `a${' '.repeat(2000)}` },
      { reason: '사유', extra: true },
    ]) {
      expect(recordVocNoFollowUpRequestSchema.safeParse(input).success).toBe(false);
    }
  });
  it('requires explicit eligibility and a complete current decision', () => {
    expect(vocFollowUpStateSchema.safeParse({ can_record: true }).success).toBe(false);
    expect(
      vocFollowUpStateSchema.parse({ can_record: false, can_withdraw: false, decision: null }),
    ).toEqual({ can_record: false, can_withdraw: false, decision: null });
  });
});
