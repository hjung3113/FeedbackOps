import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select.js';

describe('Select keyboard interaction', () => {
  it('uses keyboard typeahead to select a matching option', () => {
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="apple" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });

    fireEvent.keyDown(trigger, { key: 'b' });

    expect(onValueChange).toHaveBeenCalledWith('banana');
    expect(trigger).toHaveTextContent('Banana');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
