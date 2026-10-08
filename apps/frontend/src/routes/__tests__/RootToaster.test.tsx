// RootToaster.test.tsx — #851: bottom-center toasts must clear expanded panel action footers.
//
// The expanded Triage panel and the VOC detail panel end in an action footer that
// spans the whole main area; a bottom-centred toast at sonner's default offset
// covers that footer (the 4-second undo toast after `Triage 확정 & 다음 VOC`).
// __root.tsx raises the Toaster's desktop `offset` above the tallest footer.
//
// jsdom has no layout engine, so a pure CSS position check is impossible. The pin
// is sonner's own documented API instead: the `offset` prop lands as inline CSS
// custom properties on the rendered `ol[data-sonner-toaster]`, and sonner's
// stylesheet maps `--offset-bottom` to `bottom:` for bottom-positioned toasters
// (desktop; `--mobile-offset-*` stays at sonner's default).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppRouterContext, RootLayout, TOASTER_BOTTOM_OFFSET } from '../__root';

// Footer heights derived from the shipped Tailwind classes (4px spacing base):
// - TriageActions footer (features/voc/components/triage/TriageActions.tsx):
//   border-t 1px + py-4 (2 × 16px) + primary h-8 32px + flex-col gap-2 8px
//   + secondary row h-7 28px = 101px
// - VOC detail footer (features/voc/components/detail/NextActionFooter.tsx):
//   border-t 1px + py-3 (2 × 12px) + Button size="sm" h-8 32px = 57px
const TRIAGE_ACTIONS_FOOTER_PX = 1 + 16 * 2 + 32 + 8 + 28;
const NEXT_ACTION_FOOTER_PX = 1 + 12 * 2 + 32;
const CLEAR_GAP_PX = 16;

function renderRootLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRouteWithContext<AppRouterContext>()({
    component: RootLayout,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="root-toaster-test-marker" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  toast.dismiss();
});

describe('root Toaster offset (#851)', () => {
  it('sits above the tallest expanded panel action footer plus a 16px gap', () => {
    expect(TRIAGE_ACTIONS_FOOTER_PX).toBe(101);
    expect(NEXT_ACTION_FOOTER_PX).toBe(57);
    expect(TOASTER_BOTTOM_OFFSET).toBe(
      Math.max(TRIAGE_ACTIONS_FOOTER_PX, NEXT_ACTION_FOOTER_PX) + CLEAR_GAP_PX,
    );
  });

  it('renders the Toaster at bottom-center with the offset as sonner --offset-bottom', async () => {
    renderRootLayout();
    await screen.findByTestId('root-toaster-test-marker');

    // The <ol data-sonner-toaster> mounts only while a toast is active; the
    // subscriber updates synchronously via flushSync, so one act() is enough.
    act(() => {
      toast('offset probe');
    });

    const region = screen.getByRole('region', { name: /^Notifications/ });
    // The subscriber adds the toast inside setTimeout (sonner's anti-batching),
    // so wait for the <ol data-sonner-toaster> to appear before asserting.
    const toasterList = await waitFor(() => {
      const list = region.querySelector<HTMLOListElement>('ol[data-sonner-toaster]');
      expect(list).not.toBeNull();
      return list;
    });
    expect(toasterList?.getAttribute('data-y-position')).toBe('bottom');
    expect(toasterList?.getAttribute('data-x-position')).toBe('center');
    expect(toasterList?.style.getPropertyValue('--offset-bottom')).toBe(
      `${TOASTER_BOTTOM_OFFSET}px`,
    );
  });
});
