import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';

import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { fetchPermissionDenies, fetchPermissionGrants } from '@/lib/api/permissions';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { PermissionDenyAdminItem, PermissionGrantAdminItem } from '@fops/shared';

import type { PermissionGrantTab, PermissionGrantsSearch } from './permission-grants-search.js';
import { permissionDeniesListKey, permissionGrantsListKey } from './useRevokePermission.js';

export type ActivePermission =
  | { kind: 'grants'; item: PermissionGrantAdminItem }
  | { kind: 'denies'; item: PermissionDenyAdminItem };

export function usePermissionGrantsConsole(): {
  grants: PermissionGrantAdminItem[];
  denies: PermissionDenyAdminItem[];
  visiblePermissions: ActivePermission[];
  activeTab: PermissionGrantTab;
  selected: ActivePermission | null;
  selectedId: string | null;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  isPending: boolean;
  isError: boolean;
  grantCountKnown: boolean;
  denyCountKnown: boolean;
  handleTabChange: (next: PermissionGrantTab) => void;
  handleSelect: (id: string) => void;
  handleClose: () => void;
} {
  const search = useSearch({ strict: false }) as PermissionGrantsSearch;
  const navigate = useNavigate({ from: '/admin/permissions/grants' });
  const grantsQuery = useQuery({
    queryKey: permissionGrantsListKey,
    queryFn: ({ signal }) => fetchPermissionGrants(signal),
    retry: false,
  });
  const deniesQuery = useQuery({
    queryKey: permissionDeniesListKey,
    queryFn: ({ signal }) => fetchPermissionDenies(signal),
    retry: false,
  });
  const actors = useWorkspaceActors({ retry: false, staleTime: 0 });
  const actorNames = Object.fromEntries(
    (actors.actors ?? []).map((actor) => [actor.id, actor.display_name]),
  );
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    retry: false,
  });
  const managedSystemNames = Object.fromEntries(
    (managedSystemsQuery.data?.items ?? []).map((managedSystem) => [
      managedSystem.id,
      managedSystem.name,
    ]),
  );

  const activeTab: PermissionGrantTab = search.tab ?? 'grants';
  const selectedId = search.selected ?? null;
  const activeQuery = activeTab === 'grants' ? grantsQuery : deniesQuery;
  const grants = grantsQuery.data ?? [];
  const denies = deniesQuery.data ?? [];
  const visiblePermissions: ActivePermission[] =
    activeTab === 'grants'
      ? grants.map((item) => ({ kind: 'grants', item }))
      : denies.map((item) => ({ kind: 'denies', item }));
  const selected = visiblePermissions.find(({ item }) => item.id === selectedId) ?? null;
  const initializedTabs = React.useRef(new Set<PermissionGrantTab>());

  function handleTabChange(next: PermissionGrantTab): void {
    const nextVisible = next === 'grants' ? grants : denies;
    const selectionIsVisible =
      selectedId !== null && nextVisible.some((permission) => permission.id === selectedId);
    const nextSelectedId = selectionIsVisible ? selectedId : (nextVisible[0]?.id ?? null);
    void navigate({
      to: '/admin/permissions/grants',
      search: (prev) => {
        const { tab: _tab, selected: _selected, ...rest } = prev;
        return {
          ...rest,
          ...(next === 'denies' ? { tab: 'denies' as const } : {}),
          ...(nextSelectedId !== null ? { selected: nextSelectedId } : {}),
        };
      },
    });
  }

  function handleSelect(id: string): void {
    void navigate({
      to: '/admin/permissions/grants',
      search: (prev) => ({ ...prev, selected: id }),
    });
  }

  function handleClose(): void {
    void navigate({
      to: '/admin/permissions/grants',
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }

  React.useEffect(() => {
    if (!activeQuery.isSuccess) return;

    const isFirstTabReconcile = !initializedTabs.current.has(activeTab);
    if (selectedId !== null && !visiblePermissions.some(({ item }) => item.id === selectedId)) {
      const fallbackId = isFirstTabReconcile ? (visiblePermissions[0]?.item.id ?? null) : null;
      initializedTabs.current.add(activeTab);
      void navigate({
        to: '/admin/permissions/grants',
        replace: true,
        search: ({ selected: _selected, ...rest }) =>
          fallbackId === null ? rest : { ...rest, selected: fallbackId },
      });
      return;
    }

    if (isFirstTabReconcile) {
      initializedTabs.current.add(activeTab);
      const firstVisibleId = visiblePermissions[0]?.item.id;
      if (selectedId === null && firstVisibleId !== undefined) {
        void navigate({
          to: '/admin/permissions/grants',
          replace: true,
          search: (prev) => ({ ...prev, selected: firstVisibleId }),
        });
      }
    }
  }, [activeQuery.isSuccess, activeTab, navigate, selectedId, visiblePermissions]);

  return {
    grants,
    denies,
    visiblePermissions,
    activeTab,
    selected,
    selectedId,
    actorNames,
    managedSystemNames,
    isPending: activeQuery.isPending,
    isError: activeQuery.isError,
    grantCountKnown: grantsQuery.isSuccess && !grantsQuery.isError,
    denyCountKnown: deniesQuery.isSuccess && !deniesQuery.isError,
    handleTabChange,
    handleSelect,
    handleClose,
  };
}
