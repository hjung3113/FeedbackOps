// #168 step 3 (test a): embedding input derivation + source_hash.
//
// These pin the contract the whole ingestion path rests on: the hash changes
// exactly when the embedded text changes, and never otherwise.

import { describe, expect, it } from 'vitest';

import {
  deriveVocEmbeddingInput,
  deriveVocEmbeddingText,
  flattenRichContentToText,
  hashVocEmbeddingText,
} from '../text.js';

const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })),
});

describe('flattenRichContentToText', () => {
  it('collects text leaves and keeps block boundaries', () => {
    expect(flattenRichContentToText(doc('first line', 'second line'))).toBe(
      'first line\nsecond line',
    );
  });

  it('walks nested containers', () => {
    const nested = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }],
            },
          ],
        },
      ],
    };
    expect(flattenRichContentToText(nested)).toBe('alpha\nbeta');
  });

  it('ignores attributes so identifiers never reach the model', () => {
    const withMention = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'assigned to ' },
            { type: 'mention', attrs: { id: '11111111-2222-3333-4444-555555555555' } },
          ],
        },
      ],
    };
    expect(flattenRichContentToText(withMention)).toBe('assigned to');
  });

  it('is total: unparseable shapes flatten to empty rather than throwing', () => {
    for (const value of [null, undefined, 'a string', 42, {}, { type: 'doc' }, []]) {
      expect(flattenRichContentToText(value)).toBe('');
    }
  });
});

describe('deriveVocEmbeddingText', () => {
  it('falls back to the title alone when the description is empty or missing', () => {
    for (const description of [null, undefined, { type: 'doc', content: [] }]) {
      expect(
        deriveVocEmbeddingText({ title: '  Login fails  ', descriptionRichContent: description }),
      ).toBe('Login fails');
    }
  });

  it('separates title from body so the two fields cannot alias', () => {
    expect(
      deriveVocEmbeddingText({ title: 'Login fails', descriptionRichContent: doc('on Safari') }),
    ).toBe('Login fails\n\non Safari');
  });
});

describe('hashVocEmbeddingText / deriveVocEmbeddingInput', () => {
  const base = { title: 'Login fails', descriptionRichContent: doc('on Safari') };

  it('is stable for the same VOC content', () => {
    expect(deriveVocEmbeddingInput(base).sourceHash).toBe(
      deriveVocEmbeddingInput({
        title: 'Login fails',
        descriptionRichContent: doc('on Safari'),
      }).sourceHash,
    );
  });

  it('changes when only the title changes', () => {
    const changed = deriveVocEmbeddingInput({ ...base, title: 'Login fails intermittently' });
    expect(changed.sourceHash).not.toBe(deriveVocEmbeddingInput(base).sourceHash);
  });

  it('changes when only the description changes', () => {
    const changed = deriveVocEmbeddingInput({
      ...base,
      descriptionRichContent: doc('on Chrome'),
    });
    expect(changed.sourceHash).not.toBe(deriveVocEmbeddingInput(base).sourceHash);
  });

  it('is a hash of the derived text, not of the raw columns', () => {
    const derived = deriveVocEmbeddingInput(base);
    expect(derived.sourceHash).toBe(hashVocEmbeddingText(derived.text));
    expect(derived.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
