import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api';
import { envelopeMessage } from './envelopeMessage';

describe('envelopeMessage', () => {
  it('maps an ApiError to its Korean catalog message', () => {
    const err = new ApiError(409, {
      code: 'conflict.parent_archived',
      message: 'parent archived',
    });
    expect(envelopeMessage(err)).toBe('상위 항목이 보관되어 더 이상 변경할 수 없습니다.');
  });

  it('maps a plain Error to the Korean fallback message', () => {
    expect(envelopeMessage(new Error('network down'))).toBe(
      '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
  });

  it('maps a non-Error value to the Korean fallback message', () => {
    expect(envelopeMessage('boom')).toBe('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  });
});
