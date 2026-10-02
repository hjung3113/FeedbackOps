import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';

/** Capability decisions are authoritative; /me is only a fail-closed readiness gate. */
export function useSurveyManageGate(managedSystemId?: string) {
  const gate = useSurveyCapabilityGate('survey.manage', managedSystemId);
  return {
    canManage: gate.approved,
    permissionState: gate.permissionState,
    gateState: gate.gateState,
  };
}

/** Survey Result content stays fail-closed until /me and survey.read agree. */
export function useSurveyReadGate(managedSystemId?: string) {
  const gate = useSurveyCapabilityGate('survey.read', managedSystemId);
  return { canRead: gate.approved, gateState: gate.gateState };
}

function useSurveyCapabilityGate(
  capability: 'survey.manage' | 'survey.read',
  managedSystemId?: string,
) {
  const me = useMe();
  const permission = usePermissionCheck({
    capability,
    ...(managedSystemId ? { managedSystemId } : {}),
  });
  const loading = me.isLoading || me.isPending || permission.isPending;
  const approved =
    !loading && !me.isError && !permission.isError && permission.data?.state === 'approved';
  return {
    approved,
    permissionState: permission.data?.state,
    gateState: loading
      ? ('loading' as const)
      : me.isError || permission.isError
        ? ('error' as const)
        : approved
          ? undefined
          : ('absent' as const),
  };
}
