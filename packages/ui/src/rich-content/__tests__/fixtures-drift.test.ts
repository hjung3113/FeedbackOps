import { describe, expect, it } from 'vitest';

import {
  UI_INVALID_RICH_CONTENT_FIXTURES,
  UI_RICH_CONTENT_ERROR_CODES,
  UI_VALID_RICH_CONTENT_FIXTURES,
} from '../fixtures-local';
import { UI_SURFACES, type UISurface } from '../allowlist-local';
import { sanitizeClient } from '../sanitizeClient';

describe('UI rich-content fixture mirror', () => {
  it('pins the canonical corpus shape without importing @fops/shared', () => {
    const expectedSurfaces = new Set<UISurface>([
      'voc-description',
      'reporter-reply',
      'public-update',
      'internal-comment',
    ]);

    expect(new Set(UI_SURFACES)).toEqual(expectedSurfaces);
    expect(new Set(Object.keys(UI_VALID_RICH_CONTENT_FIXTURES))).toEqual(expectedSurfaces);
    expect(new Set(Object.keys(UI_INVALID_RICH_CONTENT_FIXTURES))).toEqual(expectedSurfaces);
    expect(new Set(UI_RICH_CONTENT_ERROR_CODES)).toEqual(new Set([
      'rich_content.disallowed_node',
      'rich_content.disallowed_attr',
      'rich_content.invalid_attr_value',
      'rich_content.missing_required_attr',
      'rich_content.external_image_forbidden',
    ]));

    const mirroredCodes = new Set(
      UI_SURFACES.flatMap((surface) => (
        UI_INVALID_RICH_CONTENT_FIXTURES[surface].map((fixture) => fixture.expectedCode)
      )),
    );
    expect(mirroredCodes).toEqual(new Set(UI_RICH_CONTENT_ERROR_CODES));
  });

  it.each(UI_SURFACES)('%s valid fixtures survive client sanitize-on-render', (surface) => {
    for (const doc of UI_VALID_RICH_CONTENT_FIXTURES[surface]) {
      expect(sanitizeClient(doc, surface)).toEqual(doc);
    }
  });

  it.each(UI_SURFACES)('%s invalid fixtures are cleaned by client sanitize-on-render', (surface) => {
    for (const { doc } of UI_INVALID_RICH_CONTENT_FIXTURES[surface]) {
      expect(sanitizeClient(doc, surface)).not.toEqual(doc);
    }
  });
});
