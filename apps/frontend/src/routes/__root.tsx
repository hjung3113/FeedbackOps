import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-full bg-surface-canvas text-text-primary">
      <Outlet />
      <Toaster position="bottom-center" richColors closeButton />
    </div>
  );
}
