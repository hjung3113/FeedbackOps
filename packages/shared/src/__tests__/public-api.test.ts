import { describe, expect, it } from 'vitest';

import { surveyResponseSubmittedDetailSchema } from '../index.js';

describe('@fops/shared public API', () => {
  it('exports the survey response submitted audit detail schema', () => {
    const payload = {
      survey_id: '01919b8c-0000-7000-8000-000000000001',
      response_id: '01919b8c-0000-7000-8000-000000000002',
      question_count: 3,
      identity_protected: true,
    };

    expect(surveyResponseSubmittedDetailSchema.parse(payload)).toEqual(payload);
  });
});
