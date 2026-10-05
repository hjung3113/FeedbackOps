import { render, screen } from '@testing-library/react';
import { KeyboardShortcut } from '../KeyboardShortcut.js';

describe('KeyboardShortcut', () => {
  it('renders the caller-provided shortcut label', () => {
    render(<KeyboardShortcut>⌘K</KeyboardShortcut>);

    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });
});
