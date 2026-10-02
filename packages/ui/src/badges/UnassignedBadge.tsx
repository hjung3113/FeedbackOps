export interface UnassignedBadgeProps {
  label?: string;
}

export function UnassignedBadge({ label = '담당자 없음' }: UnassignedBadgeProps) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-danger/10 px-2 py-0.5 text-xs font-medium text-accent-danger">
      {label}
    </span>
  );
}
