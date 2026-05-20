/**
 * Combobox a11y + keyboard nav tests.
 * Cycle-1 codex review P1-3.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Combobox } from '../src/components/shadcn/combobox';

const OPTIONS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Combobox', () => {
  it('renders trigger with placeholder', () => {
    render(
      <Combobox options={OPTIONS} value={null} onChange={() => {}} placeholder="Pick one" />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('opens popover on trigger click', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
  });

  it('Arrow Down moves activeIndex and sets aria-activedescendant', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = document.querySelector('input')!;
    expect(searchInput).toBeTruthy();
    // Before any key press, no activedescendant
    expect(searchInput.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput.getAttribute('aria-activedescendant')).toBeTruthy();
  });

  it('Enter selects the active option and calls onChange', () => {
    const handleChange = vi.fn();
    render(<Combobox options={OPTIONS} value={null} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = document.querySelector('input')!;
    // Arrow Down to first option, then Enter
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith('apple');
  });

  it('Escape closes the popover', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const searchInput = document.querySelector('input')!;
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows empty state when no options match search', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = document.querySelector('input')!;
    fireEvent.change(searchInput, { target: { value: 'zzz' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  it('trigger has aria-controls linking to listbox when open', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    const listboxId = screen.getByRole('listbox').id;
    expect(listboxId).toBeTruthy();
    expect(trigger).toHaveAttribute('aria-controls', listboxId);
  });
});
