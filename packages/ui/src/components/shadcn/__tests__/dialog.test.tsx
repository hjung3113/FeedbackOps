import { render, screen } from '@testing-library/react';
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
