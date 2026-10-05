import { SURVEY_STATUS_LABELS } from '@/lib/copy/enum-labels';
import type { SurveyStatus } from '../types';

const TONE_CLASSES: Record<SurveyStatus, string> = {
  draft: 'border-border-subtle bg-surface-canvas text-text-muted',
  open: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary',
  closed: 'border-border-strong bg-surface-card text-text-secondary',
};

export function surveyStatusLabel(status: SurveyStatus): string {
  return SURVEY_STATUS_LABELS[status];
}

export function SurveyStatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-tiny font-medium ${TONE_CLASSES[status]}`}
      data-testid={`survey-status-${status}`}
    >
      {SURVEY_STATUS_LABELS[status]}
    </span>
  );
}
