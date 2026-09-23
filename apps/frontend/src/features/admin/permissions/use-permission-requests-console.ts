import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';

import { type AdminPermissionRequestRow, fetchPermissionRequestsAll } from '@/lib/api';

import type { PermissionRequestsSearch, ReviewTab } from './permission-requests-search.js';
import { useWorkspaceActors } from './permission-state-view.js';
import { permissionRequestsReviewKey } from './useDecidePermissionRequest.js';

export function usePermissionRequestsConsole(): {
  allRequests: AdminPermissionRequestRow[];
  visibleRequests: AdminPermissionRequestRow[];
  activeTab: ReviewTab;
  selected: AdminPermissionRequestRow | null;
  selectedId: string | null;
  actorNames: Record<string, string>;
  isPending: boolean;
  isError: boolean;
  handleTabChange: (next: ReviewTab) => void;
  handleSelect: (id: string) => void;
  handleClose: () => void;
} {
  const search = useSearch({ strict: false }) as PermissionRequestsSearch;
  const navigate = useNavigate({ from: '/admin/permissions/requests' });
  const query = useQuery({
    queryKey: permissionRequestsReviewKey,
    queryFn: ({ signal }) => fetchPermissionRequestsAll({ status: 'all', signal }),
    retry: false,
  });
  const actors = useWorkspaceActors();
  const actorNames = Object.fromEntries(
    (actors.data ?? []).map((actor) => [actor.id, actor.display_name]),
  );
  // Tab + selection are URL state; `pending` is the default tab (omitted).
  const activeTab: ReviewTab = search.tab ?? 'pending';
  const selectedId = search.selected ?? null;
  const hasAppliedInitialSelection = React.useRef(false);
  const allRequests = query.data?.requests ?? [];
  const visibleRequests =
    activeTab === 'all'
      ? allRequests
      : allRequests.filter((request) => request.status === activeTab);
  const selected = visibleRequests.find((request) => request.id === selectedId) ?? null;

  function handleTabChange(next: ReviewTab): void {
    // Existing selection rule: keep the selection if it is visible in the new
    // tab, else select the first visible request, else none — in one navigate.
    const nextVisible =
      next === 'all' ? allRequests : allRequests.filter((request) => request.status === next);
    const selectionIsVisible =
      selectedId !== null && nextVisible.some((request) => request.id === selectedId);
    const nextSelectedId = selectionIsVisible ? selectedId : (nextVisible[0]?.id ?? null);
    void navigate({
      to: '/admin/permissions/requests',
      search: (prev) => {
        const { tab: _tab, selected: _selected, ...rest } = prev;
        return {
          ...rest,
          ...(next !== 'pending' ? { tab: next } : {}),
          ...(nextSelectedId !== null ? { selected: nextSelectedId } : {}),
        };
      },
    });
  }

  function handleSelect(id: string): void {
    void navigate({
      to: '/admin/permissions/requests',
      search: (prev) => ({ ...prev, selected: id }),
    });
  }

  function handleClose(): void {
    void navigate({
      to: '/admin/permissions/requests',
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }

  React.useEffect(() => {
    // Reconcile only against successfully loaded data: a failed/loading list
    // must never clear a deep-linked selection. Tab-change selection is decided
    // in handleTabChange (atomic push); URL-driven tab changes (Back, deep
    // links) are NOT re-selected here so history restores the exact prior UI.
    if (!query.isSuccess) return;

    if (selectedId !== null && !visibleRequests.some((request) => request.id === selectedId)) {
      // Stale/mismatched selection. On the very first reconcile (a deep link
      // whose selection is not in the tab) fall back to the first visible
      // request like the original UI; afterwards (e.g. a decided request left
      // the tab) just drop it.
      const fallbackId = hasAppliedInitialSelection.current
        ? null
        : (visibleRequests[0]?.id ?? null);
      hasAppliedInitialSelection.current = true;
      void navigate({
        to: '/admin/permissions/requests',
        replace: true,
        search: ({ selected: _selected, ...rest }) =>
          fallbackId === null ? rest : { ...rest, selected: fallbackId },
      });
      return;
    }

    if (!hasAppliedInitialSelection.current) {
      hasAppliedInitialSelection.current = true;
      const firstVisibleId = visibleRequests[0]?.id;
      if (selectedId === null && firstVisibleId !== undefined) {
        void navigate({
          to: '/admin/permissions/requests',
          replace: true,
          search: (prev) => ({ ...prev, selected: firstVisibleId }),
        });
      }
    }
  }, [navigate, query.isSuccess, selectedId, visibleRequests]);

  return {
    allRequests,
    visibleRequests,
    activeTab,
    selected,
    selectedId,
    actorNames,
    isPending: query.isPending,
    isError: query.isError,
    handleTabChange,
    handleSelect,
    handleClose,
  };
}
