import { render, screen } from '@testing-library/react';
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
