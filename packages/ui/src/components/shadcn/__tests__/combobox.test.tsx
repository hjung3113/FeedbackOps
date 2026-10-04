import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from '../combobox.js';

describe('Combobox accessible labels', () => {
  it('uses its configured listbox label and empty text', () => {
    render(
      <Combobox
        options={[]}
        value={null}
        onChange={() => {}}
        placeholder="Choose an option"
        listboxLabel="Available options"
        emptyText="No matching options"
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox', { name: 'Available options' })).toBeInTheDocument();
    expect(screen.getByText('No matching options')).toBeInTheDocument();
  });
});
