import { Button } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">FeedbackOps</h1>
      <p className="text-text-muted">Slice 0 shell. Slice 1 lands Workspace + Actor + Permission.</p>
      <Button>Primary</Button>
    </main>
  );
}
