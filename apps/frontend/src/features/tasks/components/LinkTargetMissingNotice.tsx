export function LinkTargetMissingNotice({ message }: { message: string }) {
  return (
    <div className="p-6">
      {/* biome-ignore lint/a11y/useSemanticElements: #1022 requires the shipped paragraph notice with status semantics. */}
      <p
        role="status"
        data-testid="tasks-link-missing"
        className="text-sm font-medium text-text-primary"
      >
        {message}
      </p>
    </div>
  );
}
