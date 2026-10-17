import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { fetchCapabilityScope, useMe, usePermissionCheck } = vi.hoisted(() => ({
  fetchCapabilityScope: vi.fn(),
  useMe: vi.fn(),
  usePermissionCheck: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ fetchCapabilityScope }));
vi.mock('@/lib/auth/useMe', () => ({ useMe }));
vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck,
}));

import { useSurveyManageAnySystemGate, useSurveyManageGate } from '../SurveyPermissionGate';

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

describe('useSurveyManageAnySystemGate', () => {
  function renderAnySystemGate() {
    return renderHook(() => useSurveyManageAnySystemGate(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });
  }

  it.each([
    ['Admin (all)', { scope: { kind: 'all' } }, true],
    [
      'scoped Developer with one Managed System',
      { scope: { kind: 'scoped', managed_system_ids: ['system-1'] } },
      true,
    ],
    [
      'scoped grant with no Managed System',
      { scope: { kind: 'scoped', managed_system_ids: [] } },
      false,
    ],
  ])('permits creation only for a manageable scope: %s', async (_name, scope, canManage) => {
    fetchCapabilityScope.mockResolvedValue(scope);

    const { result } = renderAnySystemGate();

    await waitFor(() => expect(result.current.canManage).toBe(canManage));
  });

  it('fails closed while the scope is loading', () => {
    // The repo TS lib predates Promise.withResolvers; the executor form is the
    // only way to build a never-settling promise here.
    fetchCapabilityScope.mockImplementation(() => new Promise<never>(() => {}));

    const { result } = renderAnySystemGate();

    expect(result.current.canManage).toBe(false);
  });

  it('fails closed when the scope read errors', async () => {
    fetchCapabilityScope.mockRejectedValue(new Error('scope failed'));

    const { result } = renderAnySystemGate();

    await waitFor(() => expect(fetchCapabilityScope).toHaveBeenCalled());
    expect(result.current.canManage).toBe(false);
  });
});
