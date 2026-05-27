import { describe, expect, it } from 'vitest';

import {
  invalidDocs,
  RICH_CONTENT_ERROR_CODES,
  SHARED_SURFACES,
  validDocs,
  type RichContentErrorCode,
} from '../index.js';

describe('shared rich-content fixture corpus', () => {
  it('exports valid and invalid docs for every rich-content surface', () => {
    for (const surface of SHARED_SURFACES) {
      expect(validDocs[surface].length).toBeGreaterThan(0);
      expect(invalidDocs[surface].length).toBeGreaterThan(0);
    }
  });

  it('pins every top-level rich-content sanitizer error code', () => {
    const expectedCodes: readonly RichContentErrorCode[] = RICH_CONTENT_ERROR_CODES;
    const corpusCodes = new Set(
      SHARED_SURFACES.flatMap((surface) => invalidDocs[surface].map((fixture) => fixture.expectedCode)),
    );

    expect(corpusCodes).toEqual(new Set(expectedCodes));
  });
});
