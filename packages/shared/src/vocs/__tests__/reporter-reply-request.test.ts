import { describe, expect, it } from 'vitest';
import { reporterReplyRequestSchema } from '../reporter-reply-request.js';

const VALID_DOC = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'normal reply' }] }],
};
const BLANK_DOC = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
};
const EMPTY_DOC = { type: 'doc' as const, content: [] };
const MENTION_DOC = { type: 'doc' as const, content: [{ type: 'mention' }] };
const UUID = '00000000-0000-4000-8000-000000000001';

describe('reporterReplyRequestSchema', () => {
  it('accepts minimal body without attachments', () => {
    const result = reporterReplyRequestSchema.parse({ body_rich_content: VALID_DOC });
    expect(result.body_rich_content).toEqual(VALID_DOC);
    expect(result.attachment_ids).toBeUndefined();
  });

  it('accepts empty attachment_ids array (PLAN-22 C7b)', () => {
    const result = reporterReplyRequestSchema.parse({
      body_rich_content: VALID_DOC,
      attachment_ids: [],
    });
    expect(result.attachment_ids).toEqual([]);
  });

  it('accepts attachment_ids array with valid uuids', () => {
    const result = reporterReplyRequestSchema.parse({
      body_rich_content: VALID_DOC,
      attachment_ids: [UUID],
    });
    expect(result.attachment_ids).toEqual([UUID]);
  });

  it('rejects non-uuid attachment_ids entries', () => {
    expect(() =>
      reporterReplyRequestSchema.parse({
        body_rich_content: VALID_DOC,
        attachment_ids: ['not-a-uuid'],
      }),
    ).toThrow();
  });

  it('rejects legacy attachments: [] field (replaced by attachment_ids)', () => {
    expect(() =>
      reporterReplyRequestSchema.parse({
        body_rich_content: VALID_DOC,
        attachments: [],
      }),
    ).toThrow();
  });

  it('rejects missing body_rich_content', () => {
    expect(() => reporterReplyRequestSchema.parse({})).toThrow();
  });

  it('rejects body_rich_content with wrong root type', () => {
    expect(() =>
      reporterReplyRequestSchema.parse({ body_rich_content: { type: 'paragraph' } }),
    ).toThrow();
  });

  it.each([
    ['whitespace-only paragraph', BLANK_DOC],
    ['structurally empty document', EMPTY_DOC],
  ])('rejects %s', (_name, body_rich_content) => {
    expect(() => reporterReplyRequestSchema.parse({ body_rich_content })).toThrow();
  });

  it('accepts a mention-only document as content', () => {
    expect(reporterReplyRequestSchema.safeParse({ body_rich_content: MENTION_DOC }).success).toBe(
      true,
    );
  });
});
