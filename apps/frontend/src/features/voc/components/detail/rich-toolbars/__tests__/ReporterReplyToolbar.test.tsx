// ReporterReplyToolbar.test.tsx
// Tests:
//   1. Bold, Italic, Link always render.
//   2. PLAN-22 C8: Attach renders only when `onAttach` is wired (enabled).
//
// C5.3 of slice3 #21 + PLAN-22 C8.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ReporterReplyToolbar } from '../ReporterReplyToolbar';

describe('<ReporterReplyToolbar>', () => {
  it('renders Bold, Italic, and Link buttons', () => {
    render(<ReporterReplyToolbar editor={null} />);

    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link/i })).toBeInTheDocument();
  });

  it('hides Attach when onAttach is not provided', () => {
    render(<ReporterReplyToolbar editor={null} />);
    expect(screen.queryByTestId('reporter-reply-attach')).not.toBeInTheDocument();
  });

  it('renders enabled Attach when onAttach is wired', () => {
    render(<ReporterReplyToolbar editor={null} onAttach={vi.fn(() => Promise.resolve())} />);
    const attach = screen.getByRole('button', { name: '첨부 파일 추가' });
    expect(attach).toBeInTheDocument();
  });
});
