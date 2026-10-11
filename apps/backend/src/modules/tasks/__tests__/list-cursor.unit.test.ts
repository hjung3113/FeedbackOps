import { describe, expect, it } from 'vitest';
import { decodeListCursor, encodeListCursor } from '../list-cursor.js';

describe('list cursor wire contract', () => {
  it('preserves sub-millisecond order at the page boundary', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      decodeListCursor(encodeListCursor({ timestamp: '2026-01-01 00:00:00.123456+00', id })),
    ).toEqual({ timestamp: '2026-01-01T00:00:00.123456+00:00', id });
  });
  it.each(['bad', '', Buffer.from('{}').toString('base64')])(
    'rejects malformed cursor %s',
    (raw) => {
      expect(() => decodeListCursor(raw)).toThrow(
        expect.objectContaining({
          code: 'validation.failed',
          detail: { fields: [{ path: ['cursor'], code: 'invalid_cursor' }] },
        }),
      );
    },
  );
});
