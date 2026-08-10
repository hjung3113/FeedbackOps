import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';
import { useMe } from '@/lib/auth/useMe';

/** Capability decisions are authoritative; /me is only a fail-closed readiness gate. */
export function useSurveyManageGate(managedSystemId?: string) {
  const me = useMe();
  const permission = usePermissionCheck({
    capability: 'survey.manage',
    ...(managedSystemId ? { managedSystemId } : {}),
  });
  const loading = me.isLoading || me.isPending || permission.isPending;
  const canManage =
    !loading && !me.isError && !permission.isError && permission.data?.state === 'approved';
  return {
    canManage,
    permissionState: permission.data?.state,
    gateState: loading
      ? ('loading' as const)
      : me.isError || permission.isError
        ? ('error' as const)
        : canManage
          ? undefined
          : ('absent' as const),
  };
}

/** Survey Result content stays fail-closed until /me and survey.read agree. */
export function useSurveyReadGate(managedSystemId?: string) {
  const me = useMe();
  const permission = usePermissionCheck({
    capability: 'survey.read',
    ...(managedSystemId ? { managedSystemId } : {}),
  });
  const loading = me.isLoading || me.isPending || permission.isPending;
  const canRead =
    !loading && !me.isError && !permission.isError && permission.data?.state === 'approved';
  return {
    canRead,
    gateState: loading
      ? ('loading' as const)
      : me.isError || permission.isError
        ? ('error' as const)
        : canRead
          ? undefined
          : ('absent' as const),
  };
}
