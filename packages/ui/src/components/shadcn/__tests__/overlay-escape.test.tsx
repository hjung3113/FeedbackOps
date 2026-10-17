import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../dropdown-menu.js';
import { Popover, PopoverContent, PopoverTrigger } from '../popover.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip.js';

beforeEach(() => {
  const getStyles = window.getComputedStyle.bind(window);
  // jsdom does not compile Tailwind. Model Presence's live computed animation name,
  // only for elements whose actual motion classes provide an exit animation.
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const styles = getStyles(element, pseudo);
    Object.defineProperty(styles, 'animationName', {
      get: () =>
        element.className.includes('animate-out')
          ? element.getAttribute('data-state') === 'closed'
            ? 'exit'
            : 'enter'
          : 'none',
    });
    return styles;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(['tooltip', 'popover'] as const)(
  'Escape closes the dialog after its inner %s closes',
  (kind) => {
    const onOpenChange = vi.fn();
    function NestedDialog() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Outer dialog</DialogTitle>
            <DialogDescription>Nested Escape ownership</DialogDescription>
            <button type="button" onClick={() => setOpen(true)}>
              Open inner
            </button>
            {kind === 'tooltip' ? (
              <TooltipProvider>
                <Tooltip open={open} onOpenChange={setOpen}>
                  <TooltipTrigger>Help</TooltipTrigger>
                  <TooltipContent data-testid="inner">Help content</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger>Options</PopoverTrigger>
                <PopoverContent data-testid="inner">Options content</PopoverContent>
              </Popover>
            )}
          </DialogContent>
        </Dialog>
      );
    }
    render(<NestedDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getByTestId('inner')).toHaveAttribute(
      'data-state',
      kind === 'tooltip' ? 'instant-open' : 'open',
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument();
  },
);

it('closing a submenu unregisters it immediately, then Escape closes the root', () => {
  const onOpenChange = vi.fn();
  render(
    <DropdownMenu defaultOpen onOpenChange={onOpenChange}>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
          <DropdownMenuSubContent data-testid="submenu">
            <DropdownMenuItem>Nested action</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'More' }), { key: 'ArrowRight' });
  const submenu = screen.getByTestId('submenu');
  expect(submenu).toHaveAttribute('data-state', 'open');
  fireEvent.keyDown(submenu, { key: 'ArrowLeft' });
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByTestId('submenu')).not.toBeInTheDocument();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
