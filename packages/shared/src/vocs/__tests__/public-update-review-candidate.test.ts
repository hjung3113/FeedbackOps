import { describe, expect, it } from 'vitest';

import { resolvePublicUpdateReviewCandidateRequestSchema } from '../public-update-review-candidate.js';

const ID = '11111111-1111-4111-8111-111111111111';
const DOC = { type: 'doc' as const, content: [] };

describe('resolvePublicUpdateReviewCandidateRequestSchema', () => {
  it('requires an explicit reporter-facing status when applying', () => {
    expect(() =>
      resolvePublicUpdateReviewCandidateRequestSchema.parse({
        action: 'apply',
        candidate_id: ID,
        public_update: { skip_public_update: false, body_rich_content: DOC },
      }),
    ).toThrow();
  });

  it('requires a non-empty dismissal reason', () => {
    expect(() =>
      resolvePublicUpdateReviewCandidateRequestSchema.parse({
        action: 'dismiss',
        candidate_id: ID,
        dismissal_reason: '  ',
      }),
    ).toThrow();
  });
});
