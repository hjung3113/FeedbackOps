// ComposerFooter — shared footer for all three composer surfaces.
//
// C5.2 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.2
// Prototype ref: docs/design-prototype/screen-voc.jsx:440-468
//
// Verbatim prototype JSX (Pack 17 translation):
//   <div className="composer-footer">
//     <div className="composer-status-row"> ... status hint text ... </div>
//     <div className="hstack">
//       <button className="btn btn-subtle btn-sm" onClick={() => setPreviewOpen(true)}>
//         <Icon name="expand" size={11} />Preview
//       </button>
//       <Button variant="primary" size="sm" disabled={...}>
//         {submitLabel}
//       </Button>
//     </div>
//   </div>
//
// All state is passed in — ComposerFooter is a pure presentational component.
// The consumer is responsible for deciding isEmpty, isSubmitting, isPreviewDisabled,
// isSubmitDisabled, and the optional status hint node.

import { cn } from '@fops/ui';
import { Expand } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ComposerFooterProps {
  /** Action label on the submit button (e.g. "Publish update", "Send reply", "Add note"). */
  submitLabel: string;
  /** Called when Preview button is clicked. */
  onPreview: () => void;
  /** Called when Submit button is clicked. */
  onSubmit: () => void;
  /** True when the editor doc is empty — disables the submit button. */
  isEmpty: boolean;
  /** True during in-flight mutation — disables both buttons + shows loading state. */
  isSubmitting: boolean;
  /**
   * Optional extra reason to disable submit (e.g. reporter_status_gate blocks the
   * staged next status). Stacks with isEmpty.
   */
  isSubmitDisabled?: boolean;
  /**
   * True to render Preview button with DOM `disabled` (InternalCommentComposer per D-5.4).
   * Default false.
   */
  isPreviewDisabled?: boolean;
  /**
   * Optional status hint row rendered above the action buttons.
   * Prototype composer-status-row: status change notice or "공개 타임라인에 기록됨" etc.
   */
  statusHint?: React.ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerFooter({
  submitLabel,
  onPreview,
  onSubmit,
  isEmpty,
  isSubmitting,
  isSubmitDisabled = false,
  isPreviewDisabled = false,
  statusHint,
  className,
}: ComposerFooterProps): React.ReactElement {
  const submitBlocked = isEmpty || isSubmitting || isSubmitDisabled;
  const previewBlocked = isSubmitting || isPreviewDisabled;

  return (
    // Prototype: padding 10px 12px for the footer zone (Pack 17: px-3 py-2.5)
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border-subtle',
        className,
      )}
      data-testid="composer-footer"
    >
      {/* Status hint row — prototype: composer-status-row */}
      <div className="flex-1 min-w-0">{statusHint ?? <span className="sr-only" />}</div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onPreview}
          disabled={previewBlocked}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium',
            'text-text-secondary border border-border-default bg-surface-canvas',
            'hover:bg-surface-row-hover hover:text-text-primary',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <Expand size={11} aria-hidden="true" />
          Preview
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitBlocked}
          className={cn(
            'inline-flex items-center justify-center h-7 px-3 rounded text-xs font-semibold',
            // Neon Lime / accent-primary — one of three allowed Lime targets (spec §6.8)
            'bg-accent-primary text-white',
            'hover:bg-accent-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
