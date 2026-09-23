import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api';
import { envelopeMessage } from './envelopeMessage';

describe('envelopeMessage', () => {
  it('formats an ApiError as `code: message`', () => {
    const err = new ApiError(409, {
      code: 'conflict.parent_archived',
      message: 'parent archived',
    });
    expect(envelopeMessage(err)).toBe('conflict.parent_archived: parent archived');
  });

  it('returns a plain Error message with no code prefix', () => {
    expect(envelopeMessage(new Error('network down'))).toBe('network down');
  });

  it('returns exactly "unknown error" for a non-Error value', () => {
    expect(envelopeMessage('boom')).toBe('unknown error');
  });
});
