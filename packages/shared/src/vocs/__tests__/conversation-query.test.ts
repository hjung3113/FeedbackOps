import { describe, expect, it } from 'vitest';
import { getConversationQuerySchema } from '../conversation-query.js';

describe('getConversationQuerySchema — cursor (optional)', () => {
  it('accepts an empty payload (first-page call, cursor undefined)', () => {
    const result = getConversationQuerySchema.parse({});
    expect(result.cursor).toBeUndefined();
  });

  it('accepts cursor string', () => {
    const result = getConversationQuerySchema.parse({ cursor: 'abc123' });
    expect(result.cursor).toBe('abc123');
  });

  it('rejects non-string cursor', () => {
    expect(() => getConversationQuerySchema.parse({ cursor: 123 })).toThrow();
  });
});

describe('getConversationQuerySchema — limit', () => {
  it('defaults limit to 50', () => {
    const result = getConversationQuerySchema.parse({ cursor: 'abc' });
    expect(result.limit).toBe(50);
  });

  it('coerces string limit', () => {
    const result = getConversationQuerySchema.parse({ cursor: 'abc', limit: '20' });
    expect(result.limit).toBe(20);
  });

  it('rejects limit > 100', () => {
    expect(() => getConversationQuerySchema.parse({ cursor: 'abc', limit: 101 })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => getConversationQuerySchema.parse({ cursor: 'abc', limit: 0 })).toThrow();
  });
});

describe('getConversationQuerySchema — kind (optional)', () => {
  it('accepts missing kind', () => {
    const result = getConversationQuerySchema.parse({ cursor: 'abc' });
    expect(result.kind).toBeUndefined();
  });

  it.each(['public_update', 'reporter_reply', 'internal_comment'] as const)(
    'accepts kind=%s',
    (kind) => {
      expect(getConversationQuerySchema.parse({ cursor: 'abc', kind }).kind).toBe(kind);
    },
  );

  it('rejects invalid kind', () => {
    expect(() =>
      getConversationQuerySchema.parse({ cursor: 'abc', kind: 'draft' }),
    ).toThrow();
  });
});
