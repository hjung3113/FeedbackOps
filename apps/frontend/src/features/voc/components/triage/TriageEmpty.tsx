// TriageEmpty — zero-state for the triage queue.
// Prototype ref: screen-voc-create.jsx:691-697
// Copy is verbatim from prototype.

import * as React from 'react';
import { CheckCircle } from 'lucide-react';

export function TriageEmpty(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12 px-6 text-center">
      <CheckCircle size={24} className="text-accent-success" aria-hidden="true" />
      <strong className="text-sm font-semibold text-text-primary">큐가 비었습니다</strong>
      <span className="text-xs text-text-muted">
        모든 VOC를 triage 처리했습니다. 새 VOC가 들어오면 자동으로 추가됩니다.
      </span>
    </div>
  );
}

TriageEmpty.displayName = 'TriageEmpty';
