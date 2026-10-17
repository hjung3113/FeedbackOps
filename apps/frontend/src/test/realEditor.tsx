// Real TipTap editor harness for jsdom: mounts the production RichEditor (surface extensions
// included) with a caller-supplied toolbar and exposes the live editor, so tests can set a
// real selection and assert real marks / focus. Production RichEditor internals stay untouched.

import { RichEditor, type RichEditorSurface, type TipTapDoc, type TipTapEditor } from '@fops/ui';
import * as React from 'react';
import { afterEach, beforeEach } from 'vitest';

type RangePrototype = Record<string, unknown>;

/**
 * ProseMirror reads Range/Element geometry when it scrolls the selection into view; jsdom has
 * none. Supplies the missing methods for one test file and restores the originals afterwards.
 */
export function useJsdomRangeGeometry(): void {
  const saved: Array<() => void> = [];
  beforeEach(() => {
    const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const patch = (proto: RangePrototype, key: string, impl: () => unknown) => {
      const had = Object.hasOwn(proto, key);
      const original = proto[key];
      proto[key] = impl;
      saved.push(() => {
        if (had) proto[key] = original;
        else delete proto[key];
      });
    };
    const rangeProto = Range.prototype as unknown as RangePrototype;
    const textProto = Text.prototype as unknown as RangePrototype;
    patch(rangeProto, 'getClientRects', () => []);
    patch(rangeProto, 'getBoundingClientRect', () => rect);
    patch(textProto, 'getClientRects', () => []);
  });
  afterEach(() => {
    for (const restore of saved.splice(0).reverse()) restore();
  });
}

export const HELLO_WORLD_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
} as TipTapDoc;

function EditorSpy({
  editor,
  onEditor,
}: {
  editor: TipTapEditor | null;
  onEditor: (editor: TipTapEditor | null) => void;
}): null {
  React.useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return null;
}

export function RealEditorHarness({
  surface,
  value,
  onEditor,
  renderToolbar,
}: {
  surface: RichEditorSurface;
  value: TipTapDoc | null;
  onEditor: (editor: TipTapEditor | null) => void;
  renderToolbar: (editor: TipTapEditor | null) => React.ReactNode;
}): React.ReactElement {
  return (
    <RichEditor
      surface={surface}
      value={value}
      onChange={() => {}}
      toolbar={(editor) => (
        <>
          <EditorSpy editor={editor} onEditor={onEditor} />
          {renderToolbar(editor)}
        </>
      )}
    />
  );
}
