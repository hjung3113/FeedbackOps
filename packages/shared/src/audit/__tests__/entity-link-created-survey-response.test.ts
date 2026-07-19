import { describe, expect, it } from 'vitest';

import { entityLinkCreatedDetailSchema } from '../../enums/audit-events.js';

const LINK = '01919b8c-0000-7000-8000-000000000001';
const RESPONSE = '01919b8c-0000-7000-8000-000000000002';
const FINDING = '01919b8c-0000-7000-8000-000000000003';

describe('survey-response entity_link.created details', () => {
  it.each(['generated_finding', 'evidence_of'] as const)('accepts %s', (relation_type) => {
    expect(
      entityLinkCreatedDetailSchema.parse({
        link_id: LINK,
        source: { type: 'survey_response', id: RESPONSE },
        target: { type: 'finding', id: FINDING },
        relation_type,
        visibility: 'internal_only',
      }),
    ).toMatchObject({ relation_type });
  });

  it('rejects respondent or raw-text smuggling', () => {
    expect(() =>
      entityLinkCreatedDetailSchema.parse({
        link_id: LINK,
        source: { type: 'survey_response', id: RESPONSE },
        target: { type: 'finding', id: FINDING },
        relation_type: 'evidence_of',
        visibility: 'internal_only',
        respondent_id: LINK,
        raw_text: 'private response',
      }),
    ).toThrow();
  });
});
