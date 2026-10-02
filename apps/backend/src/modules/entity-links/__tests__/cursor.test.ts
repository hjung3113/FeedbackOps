import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { decodeEntityLinksInventoryCursor, encodeEntityLinksInventoryCursor } from '../cursor.js';

describe('Entity Link inventory cursor', () => {
  it('round trips a microsecond timestamp without losing the ordering boundary', () => {
    const id = randomUUID();
    const cursor = encodeEntityLinksInventoryCursor({
      createdAtRaw: '2026-09-01 00:00:00.123456+00',
      id,
    });

    expect(decodeEntityLinksInventoryCursor(cursor)).toEqual({
      createdAt: '2026-09-01T00:00:00.123456+00:00',
      id,
    });
  });

  it.each(['not-base64!', Buffer.from('{"createdAt":3}', 'utf8').toString('base64')])(
    'rejects malformed cursor %s',
    (cursor) => {
      expect(() => decodeEntityLinksInventoryCursor(cursor)).toThrow();
    },
  );
});
