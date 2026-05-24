import type { JSONContent } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as React from 'react';
import { cn } from '../utils/cn';
import {
  getExtensionsForSurface,
  type UIRichContentExtensionCapability,
} from './allowlist-local';
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

/**
 * Result of a successful attachment upload — the strict envelope returned
 * by POST /attachments (mirrors @fops/shared AttachmentCreated, kept loose
 * here so packages/ui has no shared-domain import). PLAN-22 C8.
 */
export interface RichEditorAttachmentResult {
  attachment_id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
}

/**
 * Helper bag passed to the toolbar render-prop. Surface toolbars use
 * `attach(file)` to upload + insert in one step; the editor wires the
 * AttachmentRef node insertion on the consumer's behalf so toolbars stay
 * free of TipTap node-schema knowledge.
 */
export interface RichEditorToolbarApi {
  /**
   * Uploads `file` via the injected `onAttach` and, on resolve, inserts an
   * `attachmentRef` node at the current cursor position carrying
   * `{ id, name, size_bytes, mime_type }`. On failure, re-throws so the
   * caller can surface a toast (PLAN-22 C8 acceptance).
   */
  attach: (file: File) => Promise<RichEditorAttachmentResult>;
}

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
  /**
   * Toolbar render-prop. Receives the live editor + a toolbar API helper
   * (PLAN-22 C8). If `onAttach` is not provided, `toolbarApi.attach` rejects
   * synchronously — toolbars should hide Attach when the surface does not
   * inject an uploader.
   */
  toolbar?: (editor: Editor | null, toolbarApi: RichEditorToolbarApi) => React.ReactNode;
  /**
   * Uploads a single picked file to the attachments service and returns the
   * created-attachment envelope (PLAN-22 C8). The editor will insert an
   * `attachmentRef` node carrying `{ attachment_id, name, size_bytes,
   * mime_type }` on success. Errors propagate to the caller.
   */
  onAttach?: (file: File) => Promise<RichEditorAttachmentResult>;
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
  onAttach,
}: RichEditorProps) {
  const extensions = React.useMemo(
    () => buildExtensionsForSurface(surface, placeholder ?? ''),
    [surface, placeholder],
  );

  const editor = useEditor({
    extensions,
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

  // Stable toolbar API. `attach` uploads via the injected `onAttach`, and on
  // resolve inserts an `attachmentRef` node at the current selection carrying
  // the four spec attrs. On failure we re-throw so the caller can toast — the
  // editor stays in its prior state (no partial node inserted).
  const onAttachRef = React.useRef(onAttach);
  React.useEffect(() => {
    onAttachRef.current = onAttach;
  }, [onAttach]);

  const toolbarApi = React.useMemo<RichEditorToolbarApi>(
    () => ({
      attach: async (file: File) => {
        const uploader = onAttachRef.current;
        if (!uploader) {
          throw new Error('RichEditor: onAttach is not configured for this surface');
        }
        const result = await uploader(file);
        if (editor) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'attachmentRef',
              attrs: {
                id: result.attachment_id,
                name: result.name,
                size_bytes: result.size_bytes,
                mime_type: result.mime_type,
              },
            })
            .run();
        }
        return result;
      },
    }),
    [editor],
  );

  return (
    <div
      className={cn(
        'rich-editor border border-border-subtle rounded-md bg-surface-canvas',
        className,
      )}
      data-surface={surface}
    >
      {toolbar?.(editor, toolbarApi)}
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

function buildExtensionsForSurface(surface: RichEditorSurface, placeholder: string) {
  const capabilitySet = new Set<UIRichContentExtensionCapability>(getExtensionsForSurface(surface));
  const has = (capability: UIRichContentExtensionCapability): boolean =>
    capabilitySet.has(capability);

  return [
    StarterKit.configure({
      // ADR-0011: image extension is NOT registered. Users cannot author images client-side; backend is authoritative.
      // Disable built-ins that are not in the surface capability map, plus built-ins configured separately below.
      blockquote: false,
      bold: has('bold') ? undefined : false,
      bulletList: has('list') ? undefined : false,
      code: has('code') ? undefined : false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: has('italic') ? undefined : false,
      link: false,
      listItem: has('list') ? undefined : false,
      orderedList: has('list') ? undefined : false,
      strike: false,
      underline: false,
    }),
    ...(has('link') ? [Link.configure({ openOnClick: false })] : []),
    ...(has('underline') ? [Underline] : []),
    Placeholder.configure({ placeholder }),
    ...(has('attachmentRef') ? [AttachmentRef] : []),
    ...(has('mention') ? [Mention] : []),
  ];
}
