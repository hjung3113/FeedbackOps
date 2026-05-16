// <PermissionStateView> renders the correct label + icon for each of the
// four Slice 1 active states. The other states are also exercised to pin
// the dead-state copy so S1.2 producers don't surprise the UI.

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PermissionStateView } from '../permission-state-view.js';

describe('<PermissionStateView>', () => {
  test('approved → "Access granted"', () => {
    render(<PermissionStateView state="approved" capability="workspace.admin" />);
    expect(screen.getByText('Access granted')).toBeInTheDocument();
  });

  test('request_access → renders Request access button (Slice 1: noop click)', () => {
    render(<PermissionStateView state="request_access" capability="workspace.admin" />);
    const btn = screen.getByRole('button', { name: 'Request access' });
    expect(btn).toBeInTheDocument();
    // ADR-0016 touch target: the @fops/ui Button class set encodes min-h-10
    // / min-w-10 which is 40×40px in the tailwind preset.
    expect(btn).toHaveClass('min-h-10');
  });

  test('pending_request → "Request pending"', () => {
    render(<PermissionStateView state="pending_request" capability="workspace.admin" />);
    expect(screen.getByText('Request pending')).toBeInTheDocument();
    // No request button when the request is already in flight.
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });

  test('blocked_non_requestable → "Access blocked"', () => {
    render(<PermissionStateView state="blocked_non_requestable" capability="workspace.admin" />);
    expect(screen.getByText('Access blocked')).toBeInTheDocument();
  });

  test('hidden_existence → "Not found"', () => {
    render(<PermissionStateView state="hidden_existence" capability="workspace.admin" />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  test('rejected → "Request rejected"', () => {
    render(<PermissionStateView state="rejected" capability="workspace.admin" />);
    expect(screen.getByText('Request rejected')).toBeInTheDocument();
  });

  test('expired → "Access expired"', () => {
    render(<PermissionStateView state="expired" capability="workspace.admin" />);
    expect(screen.getByText('Access expired')).toBeInTheDocument();
  });

  test('revoked → "Access revoked"', () => {
    render(<PermissionStateView state="revoked" capability="workspace.admin" />);
    expect(screen.getByText('Access revoked')).toBeInTheDocument();
  });
});
