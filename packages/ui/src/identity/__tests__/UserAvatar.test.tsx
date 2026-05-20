/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render } from '@testing-library/react';
import { UserAvatar } from '../UserAvatar.js';

describe('UserAvatar', () => {
  it('renders sm size with h-6 w-6 text-xs classes', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Alice' }} size="sm" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-6');
    expect(root.className).toContain('w-6');
    expect(root.className).toContain('text-xs');
  });

  it('renders md size (default) with h-8 w-8 text-sm classes', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Bob' }} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-8');
    expect(root.className).toContain('w-8');
    expect(root.className).toContain('text-sm');
  });

  it('renders lg size with h-10 w-10 text-base classes', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Carol' }} size="lg" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-10');
    expect(root.className).toContain('w-10');
    expect(root.className).toContain('text-base');
  });

  it('shows uppercase first char of display_name as initial', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'alice' }} />,
    );
    expect(container.textContent).toBe('A');
  });

  it('shows uppercase initial for a Latin name', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Bob Smith' }} />,
    );
    expect(container.textContent).toBe('B');
  });

  it('renders first Hangul syllable as-is (no transformation)', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: '김철수' }} />,
    );
    // '김'.toUpperCase() === '김' — unchanged
    expect(container.textContent).toBe('김');
  });
});
