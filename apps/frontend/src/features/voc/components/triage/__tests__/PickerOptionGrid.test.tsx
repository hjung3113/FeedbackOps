import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PickerOptionGrid } from '../PickerOptionGrid';

describe('PickerOptionGrid', () => {
  it('preserves the interactive option as the grid root', () => {
    const { container } = render(
      <PickerOptionGrid columns="owner">
        <button type="button" className="grid items-center">
          Owner
        </button>
      </PickerOptionGrid>,
    );

    expect(screen.getByRole('button', { name: 'Owner' })).toHaveStyle({
      '--picker-option-grid-columns': '18px 1fr auto',
    });
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });
});
