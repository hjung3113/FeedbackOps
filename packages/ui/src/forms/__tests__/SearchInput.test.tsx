/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { SearchInput } from '../SearchInput.js';

describe('SearchInput', () => {
  it('renders an input element', () => {
    render(<SearchInput />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('input has disabled attribute', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('input has aria-disabled="true"', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders default Korean placeholder', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'VOC 검색…');
  });

  it('accepts custom placeholder', () => {
    render(<SearchInput placeholder="검색..." />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', '검색...');
  });

  it('wrapper span has tabIndex=0 (tooltip focusable wrapper)', () => {
    const { container } = render(<SearchInput />);
    const wrapper = container.querySelector('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
  });

  it('wrapper span has cursor-not-allowed class', () => {
    const { container } = render(<SearchInput />);
    const wrapper = container.querySelector('span[tabindex="0"]');
    expect(wrapper?.className).toContain('cursor-not-allowed');
  });

  it('renders a Search icon (svg)', () => {
    const { container } = render(<SearchInput />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});
