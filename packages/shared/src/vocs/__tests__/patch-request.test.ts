import { describe, expect, it } from 'vitest';
import {
  patchVocRequestSchema,
  FORBIDDEN_PATCH_FIELDS,
  FORBIDDEN_PATCH_FIELD_ERROR_CODES,
} from '../patch-request.js';

const U = '01919b8c-0000-7000-8000-000000000001';

describe('patchVocRequestSchema', () => {
  it('accepts empty body (all fields optional)', () => {
    const result = patchVocRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts full triage commit payload', () => {
    const result = patchVocRequestSchema.parse({
      severity: 'high',
      owner_user_id: U,
      analytics_area_id: U,
      triage_state: 'triaged',
    });
    expect(result.severity).toBe('high');
    expect(result.triage_state).toBe('triaged');
  });

  it('accepts severity null (de-triage path)', () => {
    const result = patchVocRequestSchema.parse({ severity: null });
    expect(result.severity).toBeNull();
  });

  it('accepts owner_user_id with null owner_team_id', () => {
    const result = patchVocRequestSchema.parse({ owner_user_id: U, owner_team_id: null });
    expect(result.owner_user_id).toBe(U);
  });

  it('accepts owner_team_id with null owner_user_id', () => {
    const result = patchVocRequestSchema.parse({ owner_user_id: null, owner_team_id: U });
    expect(result.owner_team_id).toBe(U);
  });

  it('rejects owner_user_id + owner_team_id both non-null (mutex)', () => {
    expect(() =>
      patchVocRequestSchema.parse({ owner_user_id: U, owner_team_id: U }),
    ).toThrow();
  });

  it('accepts postpone_review: true without triage_state', () => {
    const result = patchVocRequestSchema.parse({ postpone_review: true });
    expect(result.postpone_review).toBe(true);
  });

  it('rejects postpone_review: true + triage_state together (mutex)', () => {
    expect(() =>
      patchVocRequestSchema.parse({ postpone_review: true, triage_state: 'triaged' }),
    ).toThrow();
  });

  it('accepts postpone_review: false + triage_state (not mutex when false)', () => {
    const result = patchVocRequestSchema.parse({ postpone_review: false, triage_state: 'triaged' });
    expect(result.triage_state).toBe('triaged');
  });

  it('rejects invalid severity value', () => {
    expect(() => patchVocRequestSchema.parse({ severity: 'extreme' })).toThrow();
  });

  it('rejects invalid triage_state value', () => {
    expect(() => patchVocRequestSchema.parse({ triage_state: 'pending' })).toThrow();
  });

  it('rejects invalid uuid for analytics_area_id', () => {
    expect(() => patchVocRequestSchema.parse({ analytics_area_id: 'not-a-uuid' })).toThrow();
  });

  it('accepts analytics_area_id: null (de-link path)', () => {
    const result = patchVocRequestSchema.parse({ analytics_area_id: null });
    expect(result.analytics_area_id).toBeNull();
  });

  it.each(['low', 'medium', 'high', 'critical'] as const)(
    'accepts severity=%s',
    (severity) => {
      const result = patchVocRequestSchema.parse({ severity });
      expect(result.severity).toBe(severity);
    },
  );

  it('accepts both owner fields null simultaneously', () => {
    const result = patchVocRequestSchema.parse({ owner_user_id: null, owner_team_id: null });
    expect(result.owner_user_id).toBeNull();
    expect(result.owner_team_id).toBeNull();
  });

  it('accepts triage_state alone without postpone_review', () => {
    const result = patchVocRequestSchema.parse({ triage_state: 'needs_more_information' });
    expect(result.triage_state).toBe('needs_more_information');
  });

  it('accepts postpone_review: false alone', () => {
    const result = patchVocRequestSchema.parse({ postpone_review: false });
    expect(result.postpone_review).toBe(false);
  });

  it('strips unknown fields (zod default passthrough-or-strip behavior)', () => {
    // Default zod .object() strips unknown keys — the controller layer is the
    // gate for forbidden-field rejection, so schema silently drops unknowns.
    const result = patchVocRequestSchema.parse({ severity: 'low', unknownField: 'x' });
    expect(result).not.toHaveProperty('unknownField');
    expect(result.severity).toBe('low');
  });
});

describe('FORBIDDEN_PATCH_FIELDS', () => {
  it('contains reporter_facing_status', () => {
    expect(FORBIDDEN_PATCH_FIELDS).toContain('reporter_facing_status');
  });

  it('contains all immutable server-resolved fields', () => {
    for (const f of ['title', 'description_rich_content', 'display_id', 'reporter_id', 'workspace_id', 'primary_managed_system_id'] as const) {
      expect(FORBIDDEN_PATCH_FIELDS).toContain(f);
    }
  });

  it('contains cluster_decision (Slice 3 Q5 exclusion)', () => {
    expect(FORBIDDEN_PATCH_FIELDS).toContain('cluster_decision');
  });
});

describe('FORBIDDEN_PATCH_FIELD_ERROR_CODES', () => {
  it('maps reporter_facing_status to dedicated error code', () => {
    expect(FORBIDDEN_PATCH_FIELD_ERROR_CODES.reporter_facing_status).toBe(
      'voc.reporter_status_via_public_update_only',
    );
  });

  it('maps all other forbidden fields to validation.unexpected_field', () => {
    const otherFields = FORBIDDEN_PATCH_FIELDS.filter((f) => f !== 'reporter_facing_status');
    for (const field of otherFields) {
      expect(FORBIDDEN_PATCH_FIELD_ERROR_CODES[field]).toBe('validation.unexpected_field');
    }
  });

  it('covers every entry in FORBIDDEN_PATCH_FIELDS (no gaps)', () => {
    for (const field of FORBIDDEN_PATCH_FIELDS) {
      expect(FORBIDDEN_PATCH_FIELD_ERROR_CODES).toHaveProperty(field);
    }
  });
});
