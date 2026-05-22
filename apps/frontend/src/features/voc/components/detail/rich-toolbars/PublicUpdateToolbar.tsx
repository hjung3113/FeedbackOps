// PublicUpdateToolbar — toolbar config for the public-update RichEditor surface.
//
// C5.2 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.2
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468
//
// Allowed marks: Bold, Italic, BulletList. Link is intentionally excluded.
// PLAN-22 C8: Attach is now available on all four RichEditor surfaces per
// OQ-3 default. Earlier "clean public copy policy" deferred attach here;
// OQ-3 explicitly overrides that for #22.

import { AttachButton, cn, type TipTapEditor } from '@fops/ui';
import { Bold, Italic, List } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PublicUpdateToolbarProps {
  editor: TipTapEditor | null;
  /** PLAN-22 C8: wired through RichEditor toolbar API; hidden when omitted. */
  onAttach?: (file: File) => Promise<unknown>;
  onAttachError?: (err: unknown) => void;
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

export function PublicUpdateToolbar({
  editor,
  onAttach,
  onAttachError,
}: PublicUpdateToolbarProps): React.ReactElement {
  const disabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="public-update-toolbar"
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
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={disabled}
        title="Bullet list"
      >
        <List size={14} />
      </ToolbarButton>

      {/* Attach — PLAN-22 C8 (OQ-3 default). Wired through RichEditor toolbar API. */}
      {onAttach ? (
        <AttachButton
          data-testid="public-update-attach"
          disabled={disabled}
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
