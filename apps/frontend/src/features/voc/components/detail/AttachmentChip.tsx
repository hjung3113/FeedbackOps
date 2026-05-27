// AttachmentChip — compact horizontal pill rendering a linked attachment
// on the VOC body or a conversation entry. Paperclip icon + filename + size,
// click → download via GET /attachments/:id/download (browser handles
// Content-Disposition).
//
// Prototype shape: see screen-voc-create.jsx:285-340 (file icon + name + size)
// — compacted to a single-line chip for the read-side detail panel.
// PLAN-22 §Bug-1 (2026-05-22).

import { Paperclip } from 'lucide-react';
import * as React from 'react';

import type { LinkedAttachment } from '@fops/shared';

import { formatFileSize } from '../../lib/format-file-size';

export interface AttachmentChipProps {
  attachment: Pick<LinkedAttachment, 'id' | 'name' | 'size_bytes'>;
}

export function AttachmentChip({ attachment }: AttachmentChipProps): React.ReactElement {
  // Anchor with href triggers a same-origin GET that carries the session
  // cookie; Content-Disposition: attachment makes the browser download
  // instead of navigate. download attr is a hint; the server header wins.
  const href = `/attachments/${attachment.id}/download`;
  return (
    <a
      data-testid="attachment-chip"
      data-attachment-id={attachment.id}
      href={href}
      // Same-tab navigation is fine — Content-Disposition: attachment makes
      // the browser save instead of replacing the page. Explicit download
      // attribute is a hint to the UA.
      download={attachment.name}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-subtle bg-surface-card text-xs text-text-secondary hover:bg-surface-card-elevated transition-colors max-w-[240px]"
    >
      <Paperclip className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
      <span className="truncate" title={attachment.name}>
        {attachment.name}
      </span>
      <span className="text-text-muted shrink-0">{formatFileSize(attachment.size_bytes)}</span>
    </a>
  );
}

export interface AttachmentChipListProps {
  // Tolerate undefined for legacy fixtures/test envelopes built before the
  // schema gained `attachments[]`. BE always sends `[]` when none.
  attachments: ReadonlyArray<Pick<LinkedAttachment, 'id' | 'name' | 'size_bytes'>> | undefined;
}

export function AttachmentChipList({
  attachments,
}: AttachmentChipListProps): React.ReactElement | null {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div
      data-testid="attachment-chip-list"
      className="flex flex-wrap gap-2 mt-2"
    >
      {attachments.map((a) => (
        <AttachmentChip key={a.id} attachment={a} />
      ))}
    </div>
  );
}
