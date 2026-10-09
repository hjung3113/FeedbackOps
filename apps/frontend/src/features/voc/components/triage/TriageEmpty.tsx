// TriageEmpty — zero-state for the triage queue.
// Prototype ref: screen-voc-create.jsx:691-697
// Copy is verbatim from prototype.
// #922/FIX1: tabScoped renders the tab-scoped copy unless the queue total is a
// known zero; the default keeps the queue-empty copy.

import { VOC_TRIAGE_TAB_EMPTY_LABEL } from '@/lib/copy/voc-views';
import { CheckCircle } from 'lucide-react';
import type * as React from 'react';

export interface TriageEmptyProps {
  /** #922/FIX1: the queue total is not a known zero (rows elsewhere, or unknown). */
  tabScoped?: boolean;
}

export function TriageEmpty({ tabScoped }: TriageEmptyProps): React.ReactElement {
  if (tabScoped === true) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-12 px-6 text-center">
        <strong className="text-sm font-semibold text-text-primary">
          {VOC_TRIAGE_TAB_EMPTY_LABEL}
        </strong>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12 px-6 text-center">
      <CheckCircle size={24} className="text-accent-success" aria-hidden="true" />
      <strong className="text-sm font-semibold text-text-primary">큐가 비었습니다</strong>
      <span className="text-xs text-text-muted">
        모든 VOC를 Triage 처리했습니다. 새 VOC가 들어오면 자동으로 추가됩니다.
      </span>
    </div>
  );
}

TriageEmpty.displayName = 'TriageEmpty';
