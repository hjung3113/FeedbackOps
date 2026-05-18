import { describe, expect, it } from 'vitest';
import { conversationEntrySchema, conversationKindSchema } from '../conversation.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';

const base = {
  id: U,
  kind: 'public_update' as const,
  actor_id: U2,
  body_rich_content: { type: 'doc' },
  created_at: '2026-01-01T00:00:00.000Z',
  visibility: 'public' as const,
};

describe('conversationKindSchema', () => {
  it.each(['public_update', 'reporter_reply', 'internal_comment'] as const)(
    'accepts kind=%s',
    (kind) => {
      expect(conversationKindSchema.parse(kind)).toBe(kind);
    },
  );

  it('rejects invalid kind', () => {
    expect(() => conversationKindSchema.parse('draft')).toThrow();
  });
});

describe('conversationEntrySchema — public_update', () => {
  it('accepts minimal public_update entry', () => {
    expect(() => conversationEntrySchema.parse(base)).not.toThrow();
  });

  it('accepts public_update with status transition fields', () => {
    const result = conversationEntrySchema.parse({
      ...base,
      reporter_facing_status_before: 'received',
      reporter_facing_status_after: 'reviewing',
      skip_public_update: false,
      skip_reason: null,
    });
    expect(result.reporter_facing_status_after).toBe('reviewing');
  });
});

describe('conversationEntrySchema — reporter_reply', () => {
  it('accepts reporter_reply entry', () => {
    const result = conversationEntrySchema.parse({
      ...base,
      kind: 'reporter_reply',
      visibility: 'reporter',
    });
    expect(result.kind).toBe('reporter_reply');
    expect(result.visibility).toBe('reporter');
  });
});

describe('conversationEntrySchema — internal_comment', () => {
  it('accepts internal_comment entry', () => {
    const result = conversationEntrySchema.parse({
      ...base,
      kind: 'internal_comment',
      visibility: 'internal',
    });
    expect(result.kind).toBe('internal_comment');
    expect(result.visibility).toBe('internal');
  });
});

describe('conversationEntrySchema — visibility enum', () => {
  it.each(['public', 'reporter', 'internal'] as const)(
    'accepts visibility=%s',
    (visibility) => {
      expect(conversationEntrySchema.parse({ ...base, visibility }).visibility).toBe(visibility);
    },
  );

  it('rejects invalid visibility', () => {
    expect(() => conversationEntrySchema.parse({ ...base, visibility: 'private' })).toThrow();
  });
});

describe('conversationEntrySchema — field validation', () => {
  it('rejects invalid id (not uuid)', () => {
    expect(() => conversationEntrySchema.parse({ ...base, id: 'bad' })).toThrow();
  });

  it('rejects missing actor_id', () => {
    const { actor_id: _, ...rest } = base;
    expect(() => conversationEntrySchema.parse(rest)).toThrow();
  });
});
