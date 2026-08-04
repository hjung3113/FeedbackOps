import { describe, expect, it } from 'vitest';

import { isTipTapDocBlank, isTipTapDocStructurallyEmpty } from '../rich-content.js';

describe('TipTap rich-content emptiness', () => {
  it.each([
    ['null', null, true],
    ['non-object', 'text', true],
    ['missing content', { type: 'doc' }, true],
    ['empty content', { type: 'doc', content: [] }, true],
    [
      'one whitespace text node',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] },
      true,
    ],
    [
      'multiple whitespace text nodes',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: ' ' },
              { type: 'text', text: '\n\t' },
            ],
          },
        ],
      },
      true,
    ],
    [
      'text content',
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'actual text' }] }],
      },
      false,
    ],
    [
      'nested text content',
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
              },
            ],
          },
        ],
      },
      false,
    ],
    ['textless image node', { type: 'doc', content: [{ type: 'image' }] }, false],
    ['textless attachment reference', { type: 'doc', content: [{ type: 'attachmentRef' }] }, false],
    // A node type this predicate has never heard of must count as content, so
    // the surface allowlist keeps ownership of "is this node permitted" and can
    // answer rich_content.disallowed_node. Treating unknowns as nothing made a
    // mention-only document report as blank and swallowed that contract.
    [
      'textless mention node',
      { type: 'doc', content: [{ type: 'mention', attrs: { id: 'u-1' } }] },
      false,
    ],
    ['entirely unknown node type', { type: 'doc', content: [{ type: 'somethingNew' }] }, false],
    // Structural scaffolding with nothing in it is still blank.
    [
      'empty list scaffolding',
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }],
          },
        ],
      },
      true,
    ],
    [
      'whitespace-only code block',
      { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: '  ' }] }] },
      true,
    ],
  ])('blank: %s', (_name, doc, expected) => {
    expect(isTipTapDocBlank(doc)).toBe(expected);
  });

  it('keeps whitespace text paragraphs structurally non-empty', () => {
    expect(
      isTipTapDocStructurallyEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(false);
  });
});
