import type { AdminPermissionRequestRow } from '@/lib/api';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionRequestDetail } from './permission-request-detail.js';
import { PermissionRequestsScreen } from './permission-requests-screen.js';

const mocks = vi.hoisted(() => ({
  useConsole: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('./use-permission-requests-console.js', () => ({
  usePermissionRequestsConsole: mocks.useConsole,
}));

vi.mock('./useDecidePermissionRequest.js', () => ({
  useDecidePermissionRequest: () => ({ mutate: mocks.mutate, isPending: false }),
}));

vi.mock('../settings/use-workspace-settings.js', () => ({
  useWorkspaceSettings: () => ({ data: undefined }),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } } }),
}));

const REQUEST: AdminPermissionRequestRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requested_capability: 'workspace.read',
  requested_managed_system_id: null,
  requested_expiration: '2026-12-31T23:59:59.000Z',
  reason: 'Review the requested access.',
  status: 'pending',
  created_at: '2026-09-30T12:00:00.000Z',
};

const REQUEST_WITHOUT_EXPIRATION: AdminPermissionRequestRow = {
  ...REQUEST,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  requested_expiration: null,
};

function renderDetail() {
  return render(<PermissionRequestDetail request={REQUEST} onClose={() => {}} />);
}

function chooseApproval() {
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
}

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.useConsole.mockReturnValue({
    allRequests: [REQUEST],
    visibleRequests: [REQUEST],
    activeTab: 'pending',
    selected: REQUEST,
    selectedId: REQUEST.id,
    actorNames: { [REQUEST.requester_actor_id]: '김지원' },
    isPending: false,
    isError: false,
    handleTabChange: vi.fn(),
    handleSelect: vi.fn(),
    handleClose: vi.fn(),
  });
});

describe('permission request expiration visibility and approval', () => {
  it('shows the requested expiration in the compact row', () => {
    const requests = [REQUEST, REQUEST_WITHOUT_EXPIRATION];
    mocks.useConsole.mockReturnValue({
      allRequests: requests,
      visibleRequests: requests,
      activeTab: 'pending',
      selected: null,
      selectedId: null,
      actorNames: { [REQUEST.requester_actor_id]: '김지원' },
      isPending: false,
      isError: false,
      handleTabChange: vi.fn(),
      handleSelect: vi.fn(),
      handleClose: vi.fn(),
    });
    render(<PermissionRequestsScreen />);

    expect(screen.getByText('만료 2026-12-31')).toBeInTheDocument();
    expect(screen.getAllByText(/만료/)).toHaveLength(1);
  });

  it('shows the requested expiration in the detail panel', () => {
    renderDetail();

    expect(screen.getByText('요청 만료일')).toBeInTheDocument();
    expect(screen.getByText('2026-12-31', { exact: true })).toBeInTheDocument();
  });

  it('keeps the requested expiration by default and omits an unchanged approval field', () => {
    renderDetail();
    chooseApproval();

    expect(screen.getByRole('radio', { name: '요청 만료일 유지' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('새 만료일')).toHaveValue('2026-12-31');
    expect(screen.getByLabelText('새 만료일')).toBeDisabled();
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    const submitted = mocks.mutate.mock.calls[0]?.[0];
    expect(submitted).not.toHaveProperty('expiration');
  });

  it('omits expiration when the changed date is the same as the request date', () => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByRole('radio', { name: '만료일 변경' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate.mock.calls[0]?.[0]).not.toHaveProperty('expiration');
  });

  it.each([
    { option: '만료일 변경', date: '2027-01-31', expiration: '2027-01-31T23:59:59.000Z' },
    { option: '만료 없음', date: null, expiration: null },
  ])('sends the $option approval value', ({ option, date, expiration }) => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByRole('radio', { name: option }));
    if (date !== null) {
      fireEvent.change(screen.getByLabelText('새 만료일'), { target: { value: date } });
    }
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate.mock.calls[0]?.[0]).toHaveProperty('expiration', expiration);
  });
});
