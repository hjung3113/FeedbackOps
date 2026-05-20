import type { JSONContent } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as React from 'react';
import { cn } from '../utils/cn';
import { AttachmentRef } from './extensions/attachmentRef';
import { Mention } from './extensions/mention';

// TipTapDoc is a branded alias over JSONContent for type safety at feature boundaries.
// The `content` array is typed as JSONContent[] to satisfy @tiptap/core's strict overloads.
export type TipTapDoc = JSONContent & { type: 'doc' };

/** Spec-locked surface identifiers. Typos compile-fail here instead of silently producing wrong toolbar config in #19. */
export type RichEditorSurface =
  | 'voc-description'
  | 'reporter-reply'
  | 'public-update'
  | 'internal-comment';

export interface RichEditorProps {
  surface: RichEditorSurface;
  /**
   * Controlled value. Pass `null` (or an empty doc) to explicitly clear the
   * editor — e.g. after submit success or VOC switch. Omitting the prop
   * (`undefined`) leaves the editor uncontrolled. REV-3 Cluster Z.
   */
  value?: TipTapDoc | null;
  defaultValue?: TipTapDoc;
  onChange?: (doc: TipTapDoc) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string | number;
  className?: string;
  toolbar?: (editor: Editor | null) => React.ReactNode;
}

export function RichEditor({
  surface,
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
  minHeight,
  className,
  toolbar,
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // ADR-0011: image extension is NOT registered. Users cannot author images client-side; backend is authoritative.
        // Disable built-ins that we configure separately below to avoid duplicate extension warnings.
        link: false,
        underline: false,
      }),
      Link.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      AttachmentRef,
      Mention,
    ],
    // value can be null (explicit clear); fall through to defaultValue / empty doc.
    content: (value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as TipTapDoc,
    editable: !disabled,
    onUpdate({ editor }) {
      const doc = editor.getJSON() as TipTapDoc;
      onChange?.(doc);
    },
    immediatelyRender: false,
  });

  // Re-sync value when controlled.
  // REV-3 Cluster Z: an explicit `null`/`undefined` from a controlled parent
  // must visually clear the editor. The prior implementation bailed on any
  // falsy value (`!value`), so submit-success and VOC-switch flows that
  // flipped the parent draft to null left stale content in the editor body.
  //
  // Controlled vs uncontrolled is detected via a ref on the initial render:
  // if the consumer ever passed a non-undefined `value`, the component is
  // controlled for the remainder of its life and subsequent null/undefined
  // values mean "clear me". A component that never receives a `value` prop
  // is uncontrolled (e.g. `<RichEditor surface="..." defaultValue={...} />`)
  // and the effect is a no-op for it.
  const wasControlledRef = React.useRef<boolean>(value !== undefined);
  React.useEffect(() => {
    if (!editor) return;
    if (value !== undefined) {
      wasControlledRef.current = true;
    }
    if (!wasControlledRef.current) return;
    const targetDoc: TipTapDoc =
      value ?? ({ type: 'doc', content: [{ type: 'paragraph' }] } as TipTapDoc);
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(targetDoc)) {
      editor.commands.setContent(targetDoc);
    }
  }, [editor, value]);

  // Re-apply editable when disabled changes
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        'rich-editor border border-border-subtle rounded-md bg-surface-canvas',
        className,
      )}
      data-surface={surface}
    >
      {toolbar?.(editor)}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 focus:outline-none"
        style={
          minHeight
            ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }
            : undefined
        }
      />
    </div>
  );
}
