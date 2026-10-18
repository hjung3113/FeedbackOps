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

import { ComposerToolbarButton } from '@/features/cross-system/composer-editor/ComposerToolbarButton';
import { promptForLink } from '@/features/cross-system/composer-editor/promptForLink';
import { AttachButton, type TipTapEditor } from '@fops/ui';
import { Bold, Italic, Link } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ReporterReplyToolbarProps {
  editor: TipTapEditor | null;
  /** PLAN-22 C8: wired through RichEditor toolbar API; hidden when omitted. */
  onAttach?: (file: File) => Promise<unknown>;
  onAttachError?: (err: unknown) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export function ReporterReplyToolbar({
  editor,
  onAttach,
  onAttachError,
}: ReporterReplyToolbarProps): React.ReactElement {
  const disabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="reporter-reply-toolbar"
    >
      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={disabled}
        title="굵게"
      >
        <Bold size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={disabled}
        title="기울임"
      >
        <Italic size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => promptForLink(editor)}
        isActive={editor?.isActive('link') ?? false}
        disabled={disabled}
        title="링크"
      >
        <Link size={14} />
      </ComposerToolbarButton>

      {/* Attach — PLAN-22 C8. Wired through RichEditor toolbar API. */}
      {onAttach ? (
        <AttachButton
          data-testid="reporter-reply-attach"
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
