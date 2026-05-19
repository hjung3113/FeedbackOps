import { describe, expect, it } from 'vitest';
import { reporterReplyRequestSchema } from '../reporter-reply-request.js';

const VALID_DOC = { type: 'doc' as const, content: [] };
const UUID = '00000000-0000-4000-8000-000000000001';

describe('reporterReplyRequestSchema', () => {
  it('accepts minimal body without attachments', () => {
    const result = reporterReplyRequestSchema.parse({ body_rich_content: VALID_DOC });
    expect(result.body_rich_content).toEqual(VALID_DOC);
    expect(result.attachments).toBeUndefined();
  });

  it('accepts empty attachments array', () => {
    const result = reporterReplyRequestSchema.parse({
      body_rich_content: VALID_DOC,
      attachments: [],
    });
    expect(result.attachments).toEqual([]);
  });

  it('accepts attachments array with valid uuid refs (shape layer; value layer rejects at service)', () => {
    // The zod schema allows attachment refs — the service raises
    // attachment.unsupported_pending_storage_slice at the value layer.
    const result = reporterReplyRequestSchema.parse({
      body_rich_content: VALID_DOC,
      attachments: [{ id: UUID }],
    });
    expect(result.attachments).toEqual([{ id: UUID }]);
  });

  it('rejects attachment ref with invalid uuid', () => {
    expect(() =>
      reporterReplyRequestSchema.parse({
        body_rich_content: VALID_DOC,
        attachments: [{ id: 'not-a-uuid' }],
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
});
