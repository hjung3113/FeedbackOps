export function LinkTargetMissingNotice({ message }: { message: string }) {
  return (
    <div className="p-6">
      <output
        data-testid="tasks-link-missing"
        className="block text-sm font-medium text-text-primary"
      >
        {message}
      </output>
    </div>
  );
}
