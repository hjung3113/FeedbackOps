// ReporterReplyToolbar — toolbar config for the reporter-reply RichEditor surface.
//
// C5.3 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.3
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (reply variant)
//
// Allowed marks: Bold, Italic, Link.
// Attach: rendered but DOM disabled (attachment-deferral per spec).
//
// Mirrors PublicUpdateToolbar button pattern for visual consistency.

import type { TipTapEditor } from '@fops/ui';
import { cn } from '@fops/ui';
import { Bold, Italic, Link, Paperclip } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ReporterReplyToolbarProps {
  editor: TipTapEditor | null;
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

export function ReporterReplyToolbar({ editor }: ReporterReplyToolbarProps): React.ReactElement {
  const disabled = editor === null;

  function toggleLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl ?? '');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="reporter-reply-toolbar"
    >
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={disabled}
        title="Bold"
      >
        <Bold size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={disabled}
        title="Italic"
      >
        <Italic size={14} />
      </ToolbarButton>

      <ToolbarButton
        onClick={toggleLink}
        isActive={editor?.isActive('link') ?? false}
        disabled={disabled}
        title="Link"
      >
        <Link size={14} />
      </ToolbarButton>

      {/* Attach: rendered but DOM disabled (attachment-deferral — ships in #22) */}
      <button
        type="button"
        disabled={true}
        title="Attach (not yet available)"
        aria-label="Attach"
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded text-text-secondary',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <Paperclip size={14} />
      </button>
    </div>
  );
}
