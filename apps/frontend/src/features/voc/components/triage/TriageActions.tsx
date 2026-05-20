/**
 * TriageActions — footer action buttons for the TriagePanel.
 *
 * Prototype ref: screen-voc-create.jsx:572-584
 * Three buttons:
 *   1. "Triage 확정 & 다음 VOC" — primary, disabled when !dirty. Block-width.
 *   2. "Finding 만들기" — secondary, always enabled.
 *   3. "보류" — subtle, always enabled.
 *
 * Chunk 2: no mutation logic. Buttons emit onConfirm/onFinding/onSkip callbacks.
 * Chunk 3 will wire real mutation into onConfirm.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.3, §3.5):
 *   .panel-footer → border-t border-border-subtle px-5 py-4 flex flex-col gap-2 bg-surface-detail
 *   .btn-primary .btn-block → w-full bg-accent-primary text-text-on-accent
 *   .btn-secondary → bg-surface-card text-text-primary shadow-subtle
 *   .btn-subtle → text-text-secondary hover:bg-surface-card
 *
 * Neon Lime rule (PLAN-21 §Acceptance criteria "Neon Lime usage rule"):
 *   bg-accent-primary is only used on the "Triage 확정" CTA. ✓
 */

import * as React from 'react';
import { Check, BookOpen, ChevronRight } from 'lucide-react';
import { cn } from '@fops/ui';

export interface TriageActionsProps {
  dirty: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onFinding: () => void;
  onSkip: () => void;
}

export function TriageActions({
  dirty,
  submitting,
  onConfirm,
  onFinding,
  onSkip,
}: TriageActionsProps): React.ReactElement {
  const confirmDisabled = !dirty || submitting;

  return (
    <div className="border-t border-border-subtle px-5 py-4 flex flex-col gap-2 bg-surface-detail shrink-0">
      {/* Primary CTA — Triage 확정 */}
      <button
        type="button"
        aria-label="Triage 확정 & 다음 VOC"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className={cn(
          'w-full inline-flex items-center justify-center gap-1.5',
          'h-8 px-3.5 rounded-md text-sm font-semibold',
          'bg-accent-primary text-text-on-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          'disabled:opacity-40 disabled:pointer-events-none',
        )}
      >
        <Check size={12} aria-hidden="true" />
        Triage 확정 &amp; 다음 VOC
      </button>

      {/* Secondary actions row */}
      <div className="flex gap-2">
        {/* Finding 만들기 */}
        <button
          type="button"
          aria-label="Finding 만들기"
          onClick={onFinding}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-1.5',
            'h-7 px-2.5 rounded-md text-[13px] font-medium',
            'bg-surface-card text-text-primary shadow-subtle',
            'hover:bg-surface-popover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          <BookOpen size={11} aria-hidden="true" />
          Finding 만들기
        </button>

        {/* 보류 */}
        <button
          type="button"
          aria-label="보류"
          onClick={onSkip}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-1.5',
            'h-7 px-2.5 rounded-md text-[13px] font-medium',
            'text-text-secondary',
            'hover:bg-surface-card hover:text-text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          <ChevronRight size={11} aria-hidden="true" />
          보류
        </button>
      </div>
    </div>
  );
}

TriageActions.displayName = 'TriageActions';
