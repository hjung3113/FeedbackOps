// PreviewModal.tsx — Dialog wrapper for composer preview surfaces in @fops/ui.
//
// C5.5 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:486-504
//
// Verbatim prototype JSX (lines 486-504, Pack 17 translation):
//
//   <PreviewModal
//     open={previewOpen}
//     onClose={() => setPreviewOpen(false)}
//     title={
//       composerTab === 'public' ? 'Public update — Reporter preview' :
//       composerTab === 'reply'  ? 'Reporter reply preview' :
//       'Internal note preview'
//     }>
//     {composerTab === 'public' ? (
//       <ComposerPublicPreview voc={voc} owner={owner || reporter}
//         nextStatus={nextReporterStatus} draftHtml={publicDraft} />
//     ) : composerTab === 'reply' ? (
//       <ComposerReplyPreview voc={voc} owner={owner || reporter} reporter={reporter}
//         draftHtml={replyDraft} />
//     ) : (
//       <div className="text-sm muted">내부 노트는 미리보기 대신 발행 후 확인하세요.</div>
//     )}
//   </PreviewModal>
//
// Pack 17 translation:
//   Dialog size="lg" → max-w-3xl (prototype has a wider preview card)
//   bg-surface-card  → var(--surface-card)  #fbfdff
//   border-border-subtle → var(--border-subtle) #cbd6e6

import type * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/shadcn/dialog.js';
import { cn } from '../utils/cn.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PreviewModalProps {
  /** Controls Dialog open state. */
  open: boolean;
  /** Called when the Dialog requests close (X button, Escape, overlay click). */
  onClose: () => void;
  /** Title shown in the dialog header (e.g. "Public update — Reporter preview"). */
  title: string;
  /** Preview content — ComposerPublicPreview, ComposerReplyPreview, or a note. */
  children?: React.ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreviewModal({
  open,
  onClose,
  title,
  children,
  className,
}: PreviewModalProps): React.ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        data-testid="preview-modal-content"
        className={cn(
          // size="lg": max-w-3xl overrides shadcn's default max-w-lg
          // bg-surface-card + border-border-subtle already on DialogContent base
          'max-w-3xl',
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Preview body — scrollable if content is tall */}
        <div className="overflow-y-auto max-h-[70vh]">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

PreviewModal.displayName = 'PreviewModal';
