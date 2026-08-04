import { describe, expect, it } from 'vitest';
import { createVocRequestSchema, FORBIDDEN_CREATE_FIELDS } from '../create-request.js';

// The body used to be `content: []`, which encoded a weaker contract than the
// product has: the create form marks 상세 설명 required and the prototype gates
// submit on `body.trim()`. #327 shipped that rule to the wire, so the shared
// fixture has to carry a real body. The detail screen's `설명 없음` state stays
// — it renders rows created before the rule, not new ones.
const VALID = {
  primary_managed_system_id: '00000000-0000-4000-8000-000000000001',
  title: 'something broke',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '재현 절차' }] }],
  },
};

describe('createVocRequestSchema', () => {
  it('accepts minimal valid body', () => {
    expect(createVocRequestSchema.parse(VALID)).toMatchObject(VALID);
  });

  it('defaults source_context to direct_use', () => {
    expect(createVocRequestSchema.parse(VALID).source_context).toBe('direct_use');
  });

  it('accepts empty attachment_ids array (PLAN-22 C7b)', () => {
    expect(
      createVocRequestSchema.parse({ ...VALID, attachment_ids: [] }).attachment_ids,
    ).toEqual([]);
  });

  it('accepts up to 10 attachment_ids', () => {
    const ten = Array.from(
      { length: 10 },
      (_, i) => `00000000-0000-4000-8000-${(100 + i).toString().padStart(12, '0')}`,
    );
    expect(
      createVocRequestSchema.parse({ ...VALID, attachment_ids: ten }).attachment_ids,
    ).toHaveLength(10);
  });

  it('rejects > 10 attachment_ids', () => {
    const eleven = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-4000-8000-${(200 + i).toString().padStart(12, '0')}`,
    );
    expect(() =>
      createVocRequestSchema.parse({ ...VALID, attachment_ids: eleven }),
    ).toThrow();
  });

  it('rejects non-uuid attachment_ids', () => {
    expect(() =>
      createVocRequestSchema.parse({ ...VALID, attachment_ids: ['not-a-uuid'] }),
    ).toThrow();
  });

  it('rejects title > 200 chars', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: 'a'.repeat(201) })).toThrow();
  });

  it('rejects title length 0', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: '' })).toThrow();
  });

  // #327 at the schema boundary. The integration test covers the route; these
  // pin the contract where both the API and the create form's resolver read it.
  it('rejects a whitespace-only title', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: '   ' })).toThrow();
  });

  it('trims the stored title', () => {
    expect(createVocRequestSchema.parse({ ...VALID, title: '  실제 제목  ' }).title).toBe(
      '실제 제목',
    );
  });

  it('rejects a whitespace-only description', () => {
    expect(() =>
      createVocRequestSchema.parse({
        ...VALID,
        description_rich_content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        },
      }),
    ).toThrow();
  });

  it('rejects a structurally empty description', () => {
    expect(() =>
      createVocRequestSchema.parse({
        ...VALID,
        description_rich_content: { type: 'doc', content: [] },
      }),
    ).toThrow();
  });

  it('rejects unknown source_context', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, source_context: 'bogus' })).toThrow();
  });

  it('exports the forbidden-field list', () => {
    expect(FORBIDDEN_CREATE_FIELDS).toEqual([
      'reporter_id',
      'severity',
      'reporter_facing_status',
      'triage_state',
      'owner_user_id',
      'owner_team_id',
      'display_id',
    ]);
  });
});
