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
  value?: TipTapDoc;
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
    content: value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: !disabled,
    onUpdate({ editor }) {
      const doc = editor.getJSON() as TipTapDoc;
      onChange?.(doc);
    },
    immediatelyRender: false,
  });

  // Re-sync value when controlled
  React.useEffect(() => {
    if (!editor || !value) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      editor.commands.setContent(value);
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
