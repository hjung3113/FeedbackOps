// rich-editor-controlled-clear.test.tsx — REV-3 Cluster Z
//
// Finding: RichEditor's controlled-value effect bails on falsy values:
//   useEffect(() => { if (!editor || !value) return; ... }, [editor, value]);
// So when a parent flips its controlled `value` from a non-empty TipTapDoc to
// null/undefined (e.g. composer clears its draft after submit success, or VOC
// switches), the editor visually keeps the prior content. The user sees stale
// text in the composer body.
//
// Required behavior: an explicit clear from the parent (value === null /
// undefined / empty-doc) must reset the editor to an empty doc.

import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { RichEditor, type TipTapDoc } from '../src/index';

const NON_EMPTY_DOC: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'stale body text' }],
    },
  ],
};

function readEditorText(): string {
  const editable = document.querySelector('[contenteditable]');
  return editable?.textContent ?? '';
}

describe('RichEditor — controlled clear (REV-3 Cluster Z)', () => {
  it('flipping value from non-empty doc to null clears the editor content', async () => {
    function Host({ value }: { value: TipTapDoc | null }) {
      // Pass undefined when value is null so the prop is absent — the
      // composers currently spread `{...(draftDoc != null ? { value } : {})}`
      // so an absent prop is the common controlled-clear path in production.
      return value == null ? (
        <RichEditor surface="public-update" />
      ) : (
        <RichEditor surface="public-update" value={value} />
      );
    }

    const { rerender } = render(<Host value={NON_EMPTY_DOC} />);

    // Wait one tick for TipTap to commit initial content.
    await new Promise((r) => setTimeout(r, 20));
    expect(readEditorText()).toContain('stale body text');

    // Parent flips draft to null → expect editor visible content to clear.
    rerender(<Host value={null} />);
    await new Promise((r) => setTimeout(r, 20));

    expect(readEditorText()).not.toContain('stale body text');
  });

  it('flipping value to an explicit empty doc clears the editor content', async () => {
    const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

    function Host({ value }: { value: TipTapDoc }) {
      return <RichEditor surface="public-update" value={value} />;
    }

    const { rerender } = render(<Host value={NON_EMPTY_DOC} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(readEditorText()).toContain('stale body text');

    rerender(<Host value={EMPTY_DOC} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(readEditorText()).not.toContain('stale body text');
  });
});
