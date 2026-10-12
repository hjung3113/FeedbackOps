import { act, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog.js';

describe('DialogContent accessible labels', () => {
  it('uses its configured close label', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Dismiss dialog">
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Dismiss dialog' })).toBeInTheDocument();
  });
});

describe('DialogContent toast interactions (#1030)', () => {
  it.each(['toast', 'outside', 'caller'] as const)(
    'protects toast clicks and preserves outside interaction: %s',
    async (target) => {
      const onOpenChange = vi.fn();
      const onInteractOutside = vi.fn();
      render(
        <>
          <Dialog open onOpenChange={onOpenChange}>
            <DialogContent onInteractOutside={onInteractOutside}>
              <DialogTitle>Overlay title</DialogTitle>
              <DialogDescription>Overlay description</DialogDescription>
            </DialogContent>
          </Dialog>
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
