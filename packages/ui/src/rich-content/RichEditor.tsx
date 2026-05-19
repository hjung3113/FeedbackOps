import * as React from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import type { JSONContent } from '@tiptap/core';
import { AttachmentRef } from './extensions/attachmentRef';
import { Mention } from './extensions/mention';
import { cn } from '../utils/cn';

// TipTapDoc is a branded alias over JSONContent for type safety at feature boundaries.
// The `content` array is typed as JSONContent[] to satisfy @tiptap/core's strict overloads.
export type TipTapDoc = JSONContent & { type: 'doc' };

export interface RichEditorProps {
  surface: string;
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
      className={cn('rich-editor border border-border-subtle rounded-md bg-surface-canvas', className)}
      data-surface={surface}
    >
      {toolbar?.(editor)}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 focus:outline-none"
        style={minHeight ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight } : undefined}
      />
    </div>
  );
}
