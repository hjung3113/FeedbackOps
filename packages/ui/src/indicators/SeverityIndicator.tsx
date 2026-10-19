export {
  SeverityIndicator,
  type SeverityIndicatorProps,
  type SeverityEnum,
} from '@ap/ui';

// Keep the FeedbackOps compatibility value used by SeverityBadge; @ap/ui does not expose it.
export const SEVERITY_LABELS: Record<import('@ap/ui').SeverityEnum, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
  critical: '심각',
};
