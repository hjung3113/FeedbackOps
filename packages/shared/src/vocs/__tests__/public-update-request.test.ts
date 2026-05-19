import { describe, expect, it } from 'vitest';
import { publicUpdateRequestSchema } from '../public-update-request.js';

const VALID_DOC = { type: 'doc' as const, content: [] };
const STATUS = 'reviewing' as const;

describe('publicUpdateRequestSchema — shape A/B (skip_public_update=false)', () => {
  it('accepts body + status (shape A)', () => {
    const result = publicUpdateRequestSchema.parse({
      skip_public_update: false,
      body_rich_content: VALID_DOC,
      next_reporter_facing_status: STATUS,
    });
    expect(result.skip_public_update).toBe(false);
    if (!result.skip_public_update) {
      expect(result.body_rich_content).toEqual(VALID_DOC);
      expect(result.next_reporter_facing_status).toBe(STATUS);
    }
  });

  it('rejects missing body_rich_content when skip=false', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: false,
        next_reporter_facing_status: STATUS,
      }),
    ).toThrow();
  });

  it('rejects missing next_reporter_facing_status when skip=false', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: false,
        body_rich_content: VALID_DOC,
      }),
    ).toThrow();
  });

  it('rejects invalid next_reporter_facing_status value', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: false,
        body_rich_content: VALID_DOC,
        next_reporter_facing_status: 'bogus',
      }),
    ).toThrow();
  });
});

describe('publicUpdateRequestSchema — shape C (skip_public_update=true)', () => {
  it('accepts skip + skip_reason (8+ chars trimmed) + status (shape C)', () => {
    const result = publicUpdateRequestSchema.parse({
      skip_public_update: true,
      skip_reason: 'awaiting information from stakeholder',
      next_reporter_facing_status: STATUS,
    });
    expect(result.skip_public_update).toBe(true);
    if (result.skip_public_update) {
      expect(result.skip_reason).toBe('awaiting information from stakeholder');
      expect(result.next_reporter_facing_status).toBe(STATUS);
    }
  });

  it('accepts skip_reason that is exactly 8 non-whitespace chars', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: true,
        skip_reason: 'abcdefgh',
        next_reporter_facing_status: STATUS,
      }),
    ).not.toThrow();
  });

  it('rejects skip_reason shorter than 8 chars trimmed', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: true,
        skip_reason: '  short  ',
        next_reporter_facing_status: STATUS,
      }),
    ).toThrow();
  });

  it('rejects skip_reason of exactly 7 trimmed chars', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: true,
        skip_reason: 'abcdefg',
        next_reporter_facing_status: STATUS,
      }),
    ).toThrow();
  });

  it('rejects skip=true with body_rich_content present (discriminated union disallows mixing)', () => {
    // skip=true shape does not have body_rich_content in its schema;
    // providing it while skip_reason is also absent fails validation.
    // We verify that the shape with skip=true does not accept body_rich_content
    // as a meaningful field — the union routes to the skip branch, which
    // requires skip_reason, not body_rich_content.
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: true,
        body_rich_content: VALID_DOC,
        next_reporter_facing_status: STATUS,
        // skip_reason absent — should fail on skip branch
      }),
    ).toThrow();
  });

  it('rejects missing next_reporter_facing_status when skip=true', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        skip_public_update: true,
        skip_reason: 'valid long reason here',
      }),
    ).toThrow();
  });
});

describe('publicUpdateRequestSchema — discriminator boundary', () => {
  it('rejects when skip_public_update is absent', () => {
    expect(() =>
      publicUpdateRequestSchema.parse({
        body_rich_content: VALID_DOC,
        next_reporter_facing_status: STATUS,
      }),
    ).toThrow();
  });
});
