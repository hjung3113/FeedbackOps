import { describe, expect, it } from 'vitest';

import { HttpError } from '../../errors.js';
import { sanitizeRichContentOrThrow } from '../sanitize-or-throw.js';

describe('sanitizeRichContentOrThrow', () => {
  it('returns the sanitized document on success', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };

    expect(
      sanitizeRichContentOrThrow({
        surface: 'internal-comment',
        doc,
        fieldPath: ['body_rich_content'],
      }),
    ).toEqual(doc);
  });

  it('maps sanitizer failures to field errors with the supplied path', () => {
    let thrown: unknown;
    try {
      sanitizeRichContentOrThrow({
        surface: 'internal-comment',
        doc: { type: 'paragraph' },
        fieldPath: ['body_rich_content'],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({
      code: 'rich_content.disallowed_node',
      detail: {
        fields: [{ path: ['body_rich_content'], code: 'disallowed_node' }],
        hint: '$',
      },
    });
  });

  it('preserves the external image field code', () => {
    let thrown: unknown;
    try {
      sanitizeRichContentOrThrow({
        surface: 'public-update',
        doc: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: 'https://example.com/image.png' } }],
        },
        fieldPath: ['body_rich_content'],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'rich_content.external_image_forbidden',
      detail: {
        fields: [{ path: ['body_rich_content'], code: 'external_image_forbidden' }],
      },
    });
  });
});
