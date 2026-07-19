import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';
import { useMe } from '@/lib/auth/useMe';

/** Capability decisions are authoritative; /me is only a fail-closed readiness gate. */
export function useSurveyManageGate(managedSystemId?: string) {
  const me = useMe();
  const permission = usePermissionCheck({ capability: 'survey.manage', ...(managedSystemId ? { managedSystemId } : {}) });
  const loading = me.isLoading || me.isPending || permission.isPending;
  const canManage = !loading && !me.isError && !permission.isError && permission.data?.state === 'approved';
  return { canManage, gateState: loading ? 'loading' as const : me.isError || permission.isError ? 'error' as const : 'absent' as const };
}
