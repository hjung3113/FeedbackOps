import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useMe, usePermissionCheck } = vi.hoisted(() => ({
  useMe: vi.fn(),
  usePermissionCheck: vi.fn(),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe }));
vi.mock('@/features/admin/permissions/use-permission-check', () => ({
  usePermissionCheck,
}));

import { useSurveyManageGate } from '../SurveyPermissionGate';

const readyMe = { isLoading: false, isPending: false, isError: false };
const approved = {
  isPending: false,
  isError: false,
  data: { state: 'approved' },
};

describe('useSurveyManageGate', () => {
  it.each([
    ['loading', 'approved', { ...readyMe, isLoading: true }, approved],
    ['error', 'approved', { ...readyMe, isError: true }, approved],
    ['absent', 'denied', readyMe, { ...approved, data: { state: 'denied' } }],
  ] as const)(
    'fails closed when /me is %s or survey.manage is unavailable',
    (state, permissionState, me, permission) => {
      useMe.mockReturnValue(me);
      usePermissionCheck.mockReturnValue(permission);

      const { result } = renderHook(() => useSurveyManageGate('system-1'));

      expect(result.current).toEqual({
        canManage: false,
        permissionState,
        gateState: state,
      });
    },
  );

  it('permits a cached ready /me only with an approved survey.manage decision', () => {
    useMe.mockReturnValue(readyMe);
    usePermissionCheck.mockReturnValue(approved);

    const { result } = renderHook(() => useSurveyManageGate('system-1'));

    expect(result.current).toEqual({
      canManage: true,
      permissionState: 'approved',
      gateState: undefined,
    });
    expect(usePermissionCheck).toHaveBeenCalledWith({
      capability: 'survey.manage',
      managedSystemId: 'system-1',
    });
  });
});
