// ReporterReplyToolbar.test.tsx — TDD RED
// Tests:
//   1. Bold, Italic, Link render; Attach renders as DOM `disabled` button
//
// C5.3 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468
//   Reply toolbar: Bold, Italic, Link (active), Attach (disabled per attachment-deferral).

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ReporterReplyToolbar } from '../ReporterReplyToolbar';

describe('<ReporterReplyToolbar>', () => {
  it('renders Bold, Italic, and Link buttons; Attach renders disabled', () => {
    render(<ReporterReplyToolbar editor={null} />);

    // Permitted active marks
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link/i })).toBeInTheDocument();

    // Attach button is rendered but DOM disabled (attachment-deferral spec)
    const attachBtn = screen.getByRole('button', { name: /attach/i });
    expect(attachBtn).toBeInTheDocument();
    expect(attachBtn).toBeDisabled();
  });
});
