import { describe, expect, it } from 'vitest';
import { createVocRequestSchema, FORBIDDEN_CREATE_FIELDS } from '../create-request.js';

const VALID = {
  primary_managed_system_id: '00000000-0000-4000-8000-000000000001',
  title: 'something broke',
  description_rich_content: { type: 'doc', content: [] },
};

describe('createVocRequestSchema', () => {
  it('accepts minimal valid body', () => {
    expect(createVocRequestSchema.parse(VALID)).toMatchObject(VALID);
  });

  it('defaults source_context to direct_use', () => {
    expect(createVocRequestSchema.parse(VALID).source_context).toBe('direct_use');
  });

  it('accepts empty attachments array', () => {
    expect(createVocRequestSchema.parse({ ...VALID, attachments: [] }).attachments).toEqual([]);
  });

  it('rejects title > 200 chars', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: 'a'.repeat(201) })).toThrow();
  });

  it('rejects title length 0', () => {
    expect(() => createVocRequestSchema.parse({ ...VALID, title: '' })).toThrow();
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
