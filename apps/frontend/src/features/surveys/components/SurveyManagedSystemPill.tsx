export function SurveyManagedSystemPill({ name }: { name?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-border-subtle bg-surface-card px-1.5 py-0.5 text-xs text-text-secondary">
      {name ?? '알 수 없는 Managed System'}
    </span>
  );
}
