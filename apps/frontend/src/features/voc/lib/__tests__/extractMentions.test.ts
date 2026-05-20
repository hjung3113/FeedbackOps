// extractMentions.test.ts — TDD RED
// Tests:
//   1. dedupes duplicate actor_id values
//   2. ignores non-mention nodes (paragraph, text, bold, etc.)
//
// C5.4 of slice3 #21.

import { describe, it, expect } from 'vitest';
import type { TipTapDoc } from '@fops/ui';

// Named import after implementation ships.
import { extractMentions } from '../extractMentions';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_A = '00000000-0000-0000-0000-000000000001';
const ACTOR_B = '00000000-0000-0000-0000-000000000002';

/** A TipTap doc with two mentions of ACTOR_A and one of ACTOR_B */
function docWithMentions(): TipTapDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'mention', attrs: { actor_id: ACTOR_A } },
          { type: 'text', text: ' and ' },
          { type: 'mention', attrs: { actor_id: ACTOR_B } },
          { type: 'text', text: ' also ' },
          { type: 'mention', attrs: { actor_id: ACTOR_A } }, // duplicate
        ],
      },
    ],
  };
}

/** A TipTap doc with no mention nodes */
function docWithNoMentions(): TipTapDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'No mentions here' }],
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractMentions', () => {
  it('deduplicates duplicate actor_id values across the document', () => {
    const result = extractMentions(docWithMentions());
    // ACTOR_A appears twice but should only appear once in the result.
    expect(result).toHaveLength(2);
    expect(result).toContain(ACTOR_A);
    expect(result).toContain(ACTOR_B);
  });

  it('returns empty array when no mention nodes exist', () => {
    const result = extractMentions(docWithNoMentions());
    expect(result).toEqual([]);
  });
});
