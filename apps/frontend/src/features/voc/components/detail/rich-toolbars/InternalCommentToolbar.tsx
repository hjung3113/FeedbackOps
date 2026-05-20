// InternalCommentToolbar — toolbar for the internal-comment RichEditor surface.
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (internal variant)
//
// Allowed: Bold, Italic, Code (inline), BulletList, Link, @Mention (via MentionPickerButton).
// Attach: rendered but always DOM-disabled (deferred to #22).

import type { TipTapEditor } from '@fops/ui';
import { cn } from '@fops/ui';
import { AtSign, Bold, Code, Italic, Link, List, Paperclip } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InternalCommentToolbarProps {
  editor: TipTapEditor | null;
  /** Called when the @Mention button is pressed — opens MentionPickerButton. */
  onInsertMention: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the editor from losing focus on toolbar click.
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn(
        'inline-flex items-center justify-center h-7 w-7 rounded text-text-secondary',
        'hover:bg-surface-row-hover hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-40',
        isActive && 'bg-surface-row-selected text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalCommentToolbar({
  editor,
  onInsertMention,
}: InternalCommentToolbarProps): React.ReactElement {
  const editorDisabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="internal-comment-toolbar"
    >
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={editorDisabled}
        title="Bold"
      >
        <Bold size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={editorDisabled}
        title="Italic"
      >
        <Italic size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleCode().run()}
        isActive={editor?.isActive('code') ?? false}
        disabled={editorDisabled}
        title="Code"
      >
        <Code size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={editorDisabled}
        title="Bullet list"
      >
        <List size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          const previousUrl = editor?.getAttributes('link').href ?? '';
          const url = window.prompt('Link URL', previousUrl);
          if (url === null) return;
          if (url === '') {
            editor?.chain().focus().extendMarkRange('link').unsetLink().run();
          } else {
            editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }
        }}
        isActive={editor?.isActive('link') ?? false}
        disabled={editorDisabled}
        title="Link"
      >
        <Link size={14} />
      </ToolbarButton>

      {/* Separator */}
      <div className="w-px h-4 bg-border-subtle mx-0.5" aria-hidden="true" />

      {/* @Mention — Combobox-backed click; NOT inline @-autocomplete (spec §3.5). */}
      <ToolbarButton
        onClick={onInsertMention}
        isActive={false}
        disabled={editorDisabled}
        title="@Mention"
      >
        <AtSign size={14} />
      </ToolbarButton>

      {/* Attach — rendered but disabled (deferred to #22). */}
      <ToolbarButton onClick={() => {}} isActive={false} disabled={true} title="Attach file">
        <Paperclip size={14} />
      </ToolbarButton>
    </div>
  );
}
