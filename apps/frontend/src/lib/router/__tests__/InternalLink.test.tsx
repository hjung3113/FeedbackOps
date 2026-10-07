import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { InternalLink } from '../InternalLink';

type InternalLinkProps = ComponentProps<typeof InternalLink>;

function renderWithRouter(props: InternalLinkProps = { href: '/vocs?view=inbox&tab=unassigned' }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: () => <InternalLink {...props}>Navigate</InternalLink>,
  });
  const vocsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vocs',
    component: () => <div>VOC</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, vocsRoute]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });

  render(<RouterProvider router={router} />);
  return router;
}

describe('InternalLink', () => {
  it('navigates in the router on a plain click and prevents the document navigation', async () => {
    let clickEvent: ReactMouseEvent<HTMLAnchorElement> | undefined;
    const router = renderWithRouter({
      href: '/vocs?view=inbox&tab=unassigned',
      onClick: (event) => {
        clickEvent = event;
      },
    });

    fireEvent.click(await screen.findByRole('link', { name: 'Navigate' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
    expect(router.state.location.search).toEqual({ view: 'inbox', tab: 'unassigned' });
    expect(clickEvent?.defaultPrevented).toBe(true);
  });

  it.each([
    ['ctrl click', { ctrlKey: true }, { href: '/vocs?view=inbox' }],
    ['meta click', { metaKey: true }, { href: '/vocs?view=inbox' }],
    ['shift click', { shiftKey: true }, { href: '/vocs?view=inbox' }],
    ['alt click', { altKey: true }, { href: '/vocs?view=inbox' }],
    ['middle click', { button: 1 }, { href: '/vocs?view=inbox' }],
    ['new tab target', {}, { href: '/vocs?view=inbox', target: '_blank' }],
    ['download link', {}, { href: '/vocs?view=inbox', download: true }],
    ['external link', {}, { href: 'https://example.com' }],
    ['protocol-relative link', {}, { href: '//example.com' }],
  ] as const)('%s keeps browser navigation behavior', async (_name, clickOptions, props) => {
    let clickEvent: ReactMouseEvent<HTMLAnchorElement> | undefined;
    const router = renderWithRouter({
      ...props,
      onClick: (event) => {
        clickEvent = event;
      },
    });

    fireEvent.click(await screen.findByRole('link', { name: 'Navigate' }), clickOptions);

    expect(router.state.location.pathname).toBe('/home');
    expect(clickEvent?.defaultPrevented).toBe(false);
  });

  it('keeps a target=_self link in the router', async () => {
    let clickEvent: ReactMouseEvent<HTMLAnchorElement> | undefined;
    const router = renderWithRouter({
      href: '/vocs?view=inbox',
      target: '_self',
      onClick: (event) => {
        clickEvent = event;
      },
    });

    fireEvent.click(await screen.findByRole('link', { name: 'Navigate' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
    expect(clickEvent?.defaultPrevented).toBe(true);
  });

  it('does not navigate when the caller prevents the click', async () => {
    const onClick = vi.fn((event: ReactMouseEvent<HTMLAnchorElement>) => event.preventDefault());
    const router = renderWithRouter({ href: '/vocs?view=inbox', onClick });

    fireEvent.click(await screen.findByRole('link', { name: 'Navigate' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe('/home');
  });

  it('renders as a plain anchor outside a RouterProvider', () => {
    let clickEvent: ReactMouseEvent<HTMLAnchorElement> | undefined;
    render(
      <InternalLink
        href="/vocs?view=inbox"
        onClick={(event) => {
          clickEvent = event;
        }}
      >
        Navigate
      </InternalLink>,
    );

    const link = screen.getByRole('link', { name: 'Navigate' });
    expect(link).toHaveAttribute('href', '/vocs?view=inbox');
    fireEvent.click(link);
    expect(clickEvent?.defaultPrevented).toBe(false);
  });
});
