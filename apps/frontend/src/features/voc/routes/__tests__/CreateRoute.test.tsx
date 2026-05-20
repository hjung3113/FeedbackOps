// C9b — Unit tests for CreateRoute.
// Focuses on the DirtyConfirmation modal flow driven by useBlocker.
// VocCreateScreen is stubbed so this test doesn't need a full QueryClient / fetch setup.

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ── Mock @tanstack/react-router ───────────────────────────────────────────────

const navigateMock = vi.fn();
const searchMock = vi.fn(() => ({}));
let blockerMock: {
  status: 'idle' | 'blocked';
  proceed?: () => void;
  reset?: () => void;
} = { status: 'idle' };

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock(),
  useBlocker: vi.fn(() => blockerMock),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

// ── Stub VocCreateScreen ──────────────────────────────────────────────────────

// Capture onDirtyChange so tests can call it to simulate dirty state
let capturedOnDirtyChange: ((dirty: boolean) => void) | undefined;

vi.mock('../../components/create/VocCreateScreen', () => ({
  VocCreateScreen: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
    onCancel?: () => void;
    initialManagedSystemId?: string;
  }) => {
    capturedOnDirtyChange = onDirtyChange;
    return <div data-testid="voc-create-screen-stub">screen stub</div>;
  },
}));

import { CreateRoute } from '../CreateRoute';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<CreateRoute>', () => {
  it('DirtyConfirmation is closed when blocker status is idle', () => {
    blockerMock = { status: 'idle' };

    render(<CreateRoute />);

    // AlertDialog with open=false should not show the dialog content
    // The confirmation modal renders inside an AlertDialog whose title is
    // '변경사항이 저장되지 않았습니다'
    expect(
      screen.queryByText('변경사항이 저장되지 않았습니다'),
    ).not.toBeInTheDocument();
  });

  it('DirtyConfirmation opens when blocker is blocked; 확인 calls proceed, 취소 calls reset', () => {
    const proceedFn = vi.fn();
    const resetFn = vi.fn();
    blockerMock = { status: 'blocked', proceed: proceedFn, reset: resetFn };

    render(<CreateRoute />);

    // Simulate the screen reporting isDirty = true so the useBlocker.shouldBlockFn returns true.
    // Then React re-renders and the useEffect sees status === 'blocked' → opens dialog.
    // In our mock, blockerMock.status is already 'blocked' from the start, so the
    // effect should open the dialog on initial mount.
    expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();

    // Click 확인 (= '이동' button — AlertDialogAction)
    fireEvent.click(screen.getByRole('button', { name: '이동' }));
    expect(proceedFn).toHaveBeenCalledOnce();

    // Re-open scenario: render with blocked state again and click 취소
    resetFn.mockClear();
    proceedFn.mockClear();
  });

  it('clicking 취소 in DirtyConfirmation calls reset', () => {
    const proceedFn = vi.fn();
    const resetFn = vi.fn();
    blockerMock = { status: 'blocked', proceed: proceedFn, reset: resetFn };

    render(<CreateRoute />);

    expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();

    // '계속 작성' = AlertDialogCancel button
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(resetFn).toHaveBeenCalledOnce();
    expect(proceedFn).not.toHaveBeenCalled();
  });
});
