// PublicUpdateToolbar.test.tsx
// Tests:
//   1. 굵게, Italic, BulletList always render; Link never renders.
//   2. PLAN-22 C8 (OQ-3 override): Attach renders only when `onAttach` is
//      wired. The earlier "no Attach on public-update" rule was rescinded by
//      OQ-3; absence is still the default when no uploader is injected.
//
// C5.2 of slice3 #21 + PLAN-22 C8.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PublicUpdateToolbar } from '../PublicUpdateToolbar';

describe('<PublicUpdateToolbar>', () => {
  it('renders Bold, Italic, and BulletList; Link never renders', () => {
    render(<PublicUpdateToolbar editor={null} />);

    expect(screen.getByRole('button', { name: /굵게/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /기울임/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /글머리 기호|bullet/i }),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /링크/i })).toBeNull();
  });

  it('hides Attach by default (no onAttach injected)', () => {
    render(<PublicUpdateToolbar editor={null} />);
    expect(screen.queryByTestId('public-update-attach')).not.toBeInTheDocument();
  });

  it('renders Attach when onAttach is wired (PLAN-22 C8 OQ-3 default)', () => {
    render(<PublicUpdateToolbar editor={null} onAttach={vi.fn(() => Promise.resolve())} />);
    expect(screen.getByRole('button', { name: '첨부 파일 추가' })).toBeInTheDocument();
  });
});
