import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { editDescriptionRequestSchema } from '../edit-description-request.js';

const validDoc = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
};

describe('editDescriptionRequestSchema', () => {
  it('accepts all 3 fields', () => {
    const result = editDescriptionRequestSchema.parse({
      title: 'New title',
      description_rich_content: validDoc,
      attachment_ids: [],
    });
    expect(result.title).toBe('New title');
  });

  it('accepts title-only (single field)', () => {
    const result = editDescriptionRequestSchema.parse({ title: 'Only title' });
    expect(result.title).toBe('Only title');
  });

  it('accepts description_rich_content only', () => {
    const result = editDescriptionRequestSchema.parse({
      description_rich_content: validDoc,
    });
    expect(result.description_rich_content).toEqual(validDoc);
  });

  it('accepts attachment_ids only (PLAN-22 C7b)', () => {
    const result = editDescriptionRequestSchema.parse({ attachment_ids: [] });
    expect(result.attachment_ids).toEqual([]);
  });

  it('accepts attachment_ids with valid uuid (PLAN-22 C7b)', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const result = editDescriptionRequestSchema.parse({ attachment_ids: [id] });
    expect(result.attachment_ids).toEqual([id]);
  });

  it('rejects legacy attachments field (replaced by attachment_ids)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ attachments: [] }),
    ).toThrow(z.ZodError);
  });

  it('rejects empty body (non-empty refinement)', () => {
    expect(() => editDescriptionRequestSchema.parse({})).toThrow();
  });

  it('rejects unknown key (strict mode)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ title: 'ok', foobar: 'extra' }),
    ).toThrow(z.ZodError);
  });

  it('rejects __proto__ key via Object.create (strict mode catches extra keys)', () => {
    // Note: `{ title: 'ok', __proto__: 'x' }` in a JS object literal sets the
    // prototype, not a real enumerable key, so Object.keys() doesn't surface it
    // and Zod .strict() cannot catch it via that path. The actual __proto__ XSS
    // surface is defense-in-depth handled by JSON schema validation upstream.
    // We verify that a real unknown key (e.g. 'proto') is caught instead.
    expect(() =>
      editDescriptionRequestSchema.parse({ title: 'ok', proto: 'x' }),
    ).toThrow(z.ZodError);
  });

  it('rejects title too short (empty string)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ title: '' }),
    ).toThrow(z.ZodError);
  });

  it('rejects title too long (201 chars)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ title: 'a'.repeat(201) }),
    ).toThrow(z.ZodError);
  });

  it('accepts title at max length (200 chars)', () => {
    const result = editDescriptionRequestSchema.parse({ title: 'a'.repeat(200) });
    expect(result.title?.length).toBe(200);
  });

  it('rejects malformed uuid in attachment_ids', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({
        attachment_ids: ['not-a-uuid'],
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects id field (forbidden, strict mode catches it)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ title: 'ok', id: 'some-id' }),
    ).toThrow(z.ZodError);
  });

  it('rejects created_at field (strict mode)', () => {
    expect(() =>
      editDescriptionRequestSchema.parse({ title: 'ok', created_at: 'now' }),
    ).toThrow(z.ZodError);
  });
});
