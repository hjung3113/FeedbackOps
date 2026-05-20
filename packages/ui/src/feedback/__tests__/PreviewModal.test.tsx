/// <reference types="@testing-library/jest-dom" />
// PreviewModal.test.tsx — TDD RED
// Tests:
//   1. open/close: renders children when open, hidden when closed
//   2. size lg: Dialog renders with max-w-3xl (lg size class)
//   3. title: renders the provided title string
//
// C5.5 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:486-504

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PreviewModal } from '../PreviewModal.js';

describe('PreviewModal', () => {
  it('renders children and title when open', () => {
    render(
      <PreviewModal open onClose={vi.fn()} title="Public update — Reporter preview">
        <div data-testid="preview-content">Preview body</div>
      </PreviewModal>,
    );
    expect(screen.getByText('Public update — Reporter preview')).toBeInTheDocument();
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
  });

  it('does not render children when closed', () => {
    render(
      <PreviewModal open={false} onClose={vi.fn()} title="Some preview">
        <div data-testid="hidden-content">Should not show</div>
      </PreviewModal>,
    );
    expect(screen.queryByTestId('hidden-content')).not.toBeInTheDocument();
  });

  it('applies size lg (max-w-3xl) to the dialog content', () => {
    render(
      <PreviewModal open onClose={vi.fn()} title="Reporter reply preview">
        <span>body</span>
      </PreviewModal>,
    );
    // The dialog content wrapper should carry the lg size class.
    const content = document.querySelector('[data-testid="preview-modal-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toMatch(/max-w-3xl/);
  });
});
