// PublicUpdateToolbar.test.tsx — TDD RED
// Tests:
//   1. Only Bold, Italic, BulletList toolbar buttons render (no Link, Attach)
//
// C5.2 of slice3 #21.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PublicUpdateToolbar } from '../PublicUpdateToolbar';

describe('<PublicUpdateToolbar>', () => {
  it('renders Bold, Italic, and BulletList buttons — no Link or Attach', () => {
    // Pass null editor (toolbar should render with disabled state gracefully).
    render(<PublicUpdateToolbar editor={null} />);

    // The three permitted marks for the public-update surface.
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bullet.?list|unordered.?list/i })).toBeInTheDocument();

    // Link and Attach are NOT present on this surface (spec §C5.2).
    expect(screen.queryByRole('button', { name: /link/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /attach/i })).toBeNull();
  });
});
