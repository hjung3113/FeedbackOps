import { describe, expect, it } from 'vitest';
import { internalCommentRequestSchema } from '../internal-comment-request.js';

const VALID_DOC = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'normal comment' }] }],
};
const BLANK_DOC = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
};
const EMPTY_DOC = { type: 'doc' as const, content: [] };
const MENTION_DOC = { type: 'doc' as const, content: [{ type: 'mention' }] };
const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';

describe('internalCommentRequestSchema', () => {
  it('accepts body without mentions', () => {
    const result = internalCommentRequestSchema.parse({ body_rich_content: VALID_DOC });
    expect(result.body_rich_content).toEqual(VALID_DOC);
    expect(result.mentions).toBeUndefined();
  });

  it('accepts body with empty mentions array', () => {
    const result = internalCommentRequestSchema.parse({
      body_rich_content: VALID_DOC,
      mentions: [],
    });
    expect(result.mentions).toEqual([]);
  });

  it('accepts body with valid uuid mentions', () => {
    const result = internalCommentRequestSchema.parse({
      body_rich_content: VALID_DOC,
      mentions: [UUID, UUID2],
    });
    expect(result.mentions).toEqual([UUID, UUID2]);
  });

  it('accepts exactly 50 mentions (boundary)', () => {
    const uuids = Array.from({ length: 50 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    );
    expect(() =>
      internalCommentRequestSchema.parse({ body_rich_content: VALID_DOC, mentions: uuids }),
    ).not.toThrow();
  });

  it('rejects 51 mentions (max 50)', () => {
    const uuids = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    );
    expect(() =>
      internalCommentRequestSchema.parse({ body_rich_content: VALID_DOC, mentions: uuids }),
    ).toThrow();
  });

  it('rejects invalid uuid in mentions', () => {
    expect(() =>
      internalCommentRequestSchema.parse({
        body_rich_content: VALID_DOC,
        mentions: ['not-a-uuid'],
      }),
    ).toThrow();
  });

  it('rejects missing body_rich_content', () => {
    expect(() => internalCommentRequestSchema.parse({})).toThrow();
  });

  it.each([
    ['whitespace-only paragraph', BLANK_DOC],
    ['structurally empty document', EMPTY_DOC],
  ])('rejects %s', (_name, body_rich_content) => {
    expect(() => internalCommentRequestSchema.parse({ body_rich_content })).toThrow();
  });

  it('accepts a mention-only document as content', () => {
    expect(internalCommentRequestSchema.safeParse({ body_rich_content: MENTION_DOC }).success).toBe(true);
  });
});
