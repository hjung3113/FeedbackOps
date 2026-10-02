import type { AdminPermissionRequestRow } from '@/lib/api';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionRequestDetail } from './permission-request-detail.js';
import { PermissionRequestsScreen } from './permission-requests-screen.js';

const mocks = vi.hoisted(() => ({
  useConsole: vi.fn(),
  mutate: vi.fn(),
  error: null as unknown,
  reset: vi.fn(),
}));

vi.mock('./use-permission-requests-console.js', () => ({
  usePermissionRequestsConsole: mocks.useConsole,
}));

vi.mock('./useDecidePermissionRequest.js', () => ({
  useDecidePermissionRequest: () => ({
    mutate: mocks.mutate,
    isPending: false,
    error: mocks.error,
    reset: () => {
      mocks.error = null;
      mocks.reset();
    },
  }),
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
  requested_expiration: '2099-12-31T23:59:59.000Z',
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

function localDateValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function chooseApproval() {
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
}

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.error = null;
  mocks.reset.mockReset();
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

afterEach(() => {
  mocks.error = null;
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

    expect(screen.getByText('만료 2099. 12. 31.')).toBeInTheDocument();
    expect(screen.getAllByText(/만료/)).toHaveLength(1);
  });

  it('shows the requested expiration in the detail panel', () => {
    renderDetail();

    expect(screen.getByText('요청 만료일')).toBeInTheDocument();
    expect(screen.getByText('2099. 12. 31.', { exact: true })).toBeInTheDocument();
  });

  it('keeps the requested expiration by default and omits an unchanged approval field', () => {
    renderDetail();
    chooseApproval();

    const keepOption = screen.getByRole('radio', {
      name: '요청 만료일 유지 · 2099. 12. 31.',
    });
    expect(keepOption).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('새 만료일')).toHaveValue('2099-12-31');
    expect(screen.getByLabelText('새 만료일')).toBeDisabled();
    fireEvent.click(screen.getByText('요청 만료일 유지 · 2099. 12. 31.', { exact: true }));
    expect(keepOption).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    const submitted = mocks.mutate.mock.calls[0]?.[0];
    expect(submitted).not.toHaveProperty('expiration');
  });

  it('includes “만료 없음” in the keep option accessible name when no date was requested', () => {
    render(<PermissionRequestDetail request={REQUEST_WITHOUT_EXPIRATION} onClose={() => {}} />);
    chooseApproval();

    expect(screen.getByRole('radio', { name: '요청 만료일 유지 · 만료 없음' })).toBeInTheDocument();
  });

  it('omits expiration when the changed date is the same as the request date', () => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByRole('radio', { name: '만료일 변경' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate.mock.calls[0]?.[0]).not.toHaveProperty('expiration');
  });

  it.each([
    { option: '만료일 변경', date: '2099-12-30', expiration: '2099-12-30T23:59:59.000Z' },
    { option: '만료 없음', date: null, expiration: null },
  ])('sends the $option approval value', ({ option, date, expiration }) => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByText(option, { exact: true }));
    if (date !== null) {
      fireEvent.change(screen.getByLabelText('새 만료일'), { target: { value: date } });
    }
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate.mock.calls[0]?.[0]).toHaveProperty('expiration', expiration);
  });

  it.each([
    {
      scenario: 'a date before today',
      date: (() => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 2);
        return localDateValue(pastDate);
      })(),
    },
    { scenario: 'an empty invalid date', date: '' },
  ])('blocks approval with an inline error for $scenario', ({ date }) => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByText('만료일 변경', { exact: true }));

    const input = screen.getByLabelText('새 만료일');
    expect(input).toHaveAttribute('min', localDateValue(new Date()));
    fireEvent.change(input, { target: { value: date } });
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(screen.getByRole('alert')).toHaveTextContent('만료일은 현재 시각보다 이후여야 합니다.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'permission-approval-expiration-error');
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('blocks approval when a valid expiration is replaced with an invalid typed draft', () => {
    renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByText('만료일 변경', { exact: true }));

    const input = screen.getByLabelText('새 만료일');
    fireEvent.change(input, { target: { value: '2099-12-30' } });
    fireEvent.change(input, { target: { value: '2099-02-30' } });
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('날짜를 YYYY-MM-DD 형식으로 입력하세요.');
  });

  it('shows an expiration field rejection from the server beside the date input', () => {
    const view = renderDetail();
    chooseApproval();
    fireEvent.click(screen.getByText('만료일 변경', { exact: true }));
    fireEvent.change(screen.getByLabelText('새 만료일'), {
      target: { value: '2099-12-30' },
    });
    fireEvent.click(screen.getByTestId('permission-decision-submit'));

    mocks.error = {
      code: 'validation.failed',
      detail: { fields: [{ path: ['expiration'], code: 'too_small' }] },
    };
    view.rerender(<PermissionRequestDetail request={REQUEST} onClose={() => {}} />);

    expect(screen.getByRole('alert')).toHaveTextContent('만료일은 현재 시각보다 이후여야 합니다.');
    expect(screen.getByLabelText('새 만료일')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('새 만료일'), {
      target: { value: '2099-12-29' },
    });
    expect(mocks.reset).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
