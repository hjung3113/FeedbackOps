export interface UnassignedBadgeProps {
  label?: string;
  tone?: 'danger' | 'neutral';
}

export function UnassignedBadge({ label = '담당자 없음', tone = 'danger' }: UnassignedBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        tone === 'neutral'
          ? 'border border-border-subtle bg-surface-canvas text-text-muted'
          : 'bg-accent-danger/10 text-accent-danger'
      }`}
    >
      {label}
    </span>
  );
}
