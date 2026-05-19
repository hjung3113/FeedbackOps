import { Outlet, createRootRoute } from '@tanstack/react-router';
import { OctagonAlert, TriangleAlert, Info, Loader2, CircleCheck } from 'lucide-react';
import { Toaster } from 'sonner';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-full bg-surface-canvas text-text-primary">
      <Outlet />
      <Toaster
        position="bottom-center"
        richColors
        closeButton
        icons={{
          // error is OctagonAlert (octagonal stop) so users do not confuse it with the close × button on the right.
          error: <OctagonAlert className="h-4 w-4" aria-hidden />,
          warning: <TriangleAlert className="h-4 w-4" aria-hidden />,
          info: <Info className="h-4 w-4" aria-hidden />,
          success: <CircleCheck className="h-4 w-4" aria-hidden />,
          loading: <Loader2 className="h-4 w-4 animate-spin" aria-hidden />,
        }}
      />
    </div>
  );
}
