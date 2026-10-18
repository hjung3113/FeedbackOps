// InternalCommentToolbar — toolbar for the internal-comment RichEditor surface.
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (internal variant)
//
// Allowed: Bold, Italic, Code (inline), BulletList, Link, @Mention (via MentionPickerButton).
// Attach: rendered but always DOM-disabled (deferred to #22).

import { ComposerToolbarButton } from '@/features/cross-system/composer-editor/ComposerToolbarButton';
import { promptForLink } from '@/features/cross-system/composer-editor/promptForLink';
import { AttachButton, type TipTapEditor } from '@fops/ui';
import { AtSign, Bold, Code, Italic, Link, List } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InternalCommentToolbarProps {
  editor: TipTapEditor | null;
  /** Called when the @Mention button is pressed — opens MentionPickerButton. */
  onInsertMention: () => void;
  /**
   * Wired by the composer through the RichEditor toolbar API (PLAN-22 C8).
   * When provided, the Attach button uploads + inserts an attachmentRef node.
   * When omitted, the button is hidden (no degraded placeholder).
   */
  onAttach?: (file: File) => Promise<unknown>;
  /** Surface to toast on attach failure. */
  onAttachError?: (err: unknown) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalCommentToolbar({
  editor,
  onInsertMention,
  onAttach,
  onAttachError,
}: InternalCommentToolbarProps): React.ReactElement {
  const editorDisabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="internal-comment-toolbar"
    >
      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={editorDisabled}
        title="굵게"
      >
        <Bold size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={editorDisabled}
        title="기울임"
      >
        <Italic size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleCode().run()}
        isActive={editor?.isActive('code') ?? false}
        disabled={editorDisabled}
        title="코드"
      >
        <Code size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={editorDisabled}
        title="글머리 기호"
      >
        <List size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => promptForLink(editor)}
        isActive={editor?.isActive('link') ?? false}
        disabled={editorDisabled}
        title="링크"
      >
        <Link size={14} />
      </ComposerToolbarButton>

      {/* Separator */}
      <div className="w-px h-4 bg-border-subtle mx-0.5" aria-hidden="true" />

      {/* @Mention — Combobox-backed click; NOT inline @-autocomplete (spec §3.5). */}
      <ComposerToolbarButton
        onClick={onInsertMention}
        isActive={false}
        disabled={editorDisabled}
        title="@멘션"
      >
        <AtSign size={14} />
      </ComposerToolbarButton>

      {/* Attach — wired through RichEditor toolbar API (PLAN-22 C8). */}
      {onAttach ? (
        <AttachButton
          data-testid="internal-comment-attach"
          disabled={editorDisabled}
          onPick={async (file) => {
            try {
              await onAttach(file);
            } catch (e) {
              onAttachError?.(e);
            }
          }}
        />
      ) : null}
    </div>
  );
}
