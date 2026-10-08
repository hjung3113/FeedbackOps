import { DocumentTitleProvider } from '@/lib/router/document-title';
import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { CircleCheck, Info, Loader2, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Toaster } from 'sonner';

export interface AppRouterContext {
  queryClient: QueryClient;
}

// #851: bottom-centred toasts must clear the action footer of an expanded panel,
// which spans the whole main area (the 4-second undo toast after
// "Triage 확정 & 다음 VOC" covered that footer). Footer heights measured from the
// shipped Tailwind classes (4px spacing base):
//   - TriageActions (features/voc/components/triage/TriageActions.tsx):
//     border-t 1px + py-4 (2 × 16px) + primary h-8 32px + flex-col gap-2 8px
//     + secondary row h-7 28px = 101px
//   - VOC detail NextActionFooter (features/voc/components/detail/NextActionFooter.tsx):
//     border-t 1px + py-3 (2 × 12px) + Button size="sm" h-8 32px = 57px
// 101px (tallest) + 16px gap = 117px. Passed as sonner's desktop `offset`;
// `mobileOffset` is not set, so sonner's mobile default (16px) applies.
export const TOASTER_BOTTOM_OFFSET = 117;

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
});

export function RootLayout() {
  return (
    <div className="min-h-full bg-surface-canvas text-text-primary">
      <DocumentTitleProvider>
        <Outlet />
      </DocumentTitleProvider>
      <Toaster
        position="bottom-center"
        offset={TOASTER_BOTTOM_OFFSET}
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
