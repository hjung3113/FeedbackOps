// ComposerFooter.test.tsx — TDD RED
// Tests:
//   1. Preview button is visible (and enabled by default)
//   2. Submit button is disabled when isDocEmpty=true
//
// C5.2 of slice3 #21.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ComposerFooter } from '../ComposerFooter';

describe('<ComposerFooter>', () => {
  it('renders a visible Preview button', () => {
    render(
      <ComposerFooter
        submitLabel="Publish update"
        onPreview={() => undefined}
        onSubmit={() => undefined}
        isEmpty={false}
        isSubmitting={false}
      />,
    );
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview/i })).not.toBeDisabled();
  });

  it('disables the Submit button when document is empty', () => {
    render(
      <ComposerFooter
        submitLabel="Publish update"
        onPreview={() => undefined}
        onSubmit={() => undefined}
        isEmpty={true}
        isSubmitting={false}
      />,
    );
    expect(screen.getByRole('button', { name: /publish update/i })).toBeDisabled();
  });
});
