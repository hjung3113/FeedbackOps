/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render } from '@testing-library/react';
import { UserAvatar } from '../UserAvatar.js';

describe('UserAvatar', () => {
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
