import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../sheet.js';

describe('SheetContent accessible labels', () => {
  it('uses its configured close label', () => {
    render(
      <Sheet open>
        <SheetContent closeLabel="Close navigation">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Navigation panel description</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
  });
});

describe('SheetContent toast interactions (#1030)', () => {
  it.each(['toast', 'outside', 'caller'] as const)(
    'protects toast clicks and preserves outside interaction: %s',
    async (target) => {
      const onOpenChange = vi.fn();
      const onInteractOutside = vi.fn();
      render(
        <>
          <Sheet open onOpenChange={onOpenChange}>
            <SheetContent onInteractOutside={onInteractOutside}>
              <SheetTitle>Overlay title</SheetTitle>
              <SheetDescription>Overlay description</SheetDescription>
            </SheetContent>
          </Sheet>
          <ol data-sonner-toaster>
            <li>
              <button type="button">실행 취소</button>
            </li>
          </ol>
          <div data-testid="plain-outside" />
        </>,
      );
      // Radix installs the document pointerdown listener on the next turn.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      fireEvent.pointerDown(
        target === 'toast' ? screen.getByText('실행 취소') : screen.getByTestId('plain-outside'),
        { pointerType: 'mouse', button: 0 },
      );
      if (target === 'toast') {
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      } else {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        if (target === 'caller') expect(onInteractOutside).toHaveBeenCalled();
      }
    },
  );
});
