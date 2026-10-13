import { ListStateMessage } from '@/components/ListStateMessage';
import type { PermissionGrantAdminItem } from '@fops/shared';
import { Button, ListShell, ListTabs, type ListToolbarTab, ObjectRow } from '@fops/ui';
import * as React from 'react';

import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { GLOSSARY } from '@/lib/copy/glossary';
import { SCOPE_SELECTOR_COPY } from '@/lib/copy/managed-system-scope';
import { formatDateOnly, formatDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';

import { PermissionDirectGrantForm } from './permission-direct-grant-form.js';
import { PermissionGrantDetail } from './permission-grant-detail.js';
import { permissionGrantTabs } from './permission-grants-search.js';
import {
  type ActivePermission,
  usePermissionGrantsConsole,
} from './use-permission-grants-console.js';

const PERMISSION_GRANTS_PANEL_ID = 'permission-grants-list-panel';

export function PermissionGrantsScreen() {
  const {
    grants,
    denies,
    visiblePermissions,
    activeTab,
    selected,
    selectedId,
    actorNames,
    managedSystemNames,
    cacheReturnedGrant,
    discardReturnedGrant,
    handleCreatedGrant,
    isPending,
    isError,
    grantCountKnown,
    denyCountKnown,
    handleTabChange,
    handleSelect,
    handleClose,
  } = usePermissionGrantsConsole();
  const [directGrantOpen, setDirectGrantOpen] = React.useState(false);
  const [focusGrantIdAfterClose, setFocusGrantIdAfterClose] = React.useState<{
    id: string;
    navigationAttempted: boolean;
  } | null>(null);
  const directGrantTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const selectionContext = `${activeTab}:${selectedId ?? ''}`;
  const currentSelectionContext = React.useRef(selectionContext);
  const screenMounted = React.useRef(false);
  React.useLayoutEffect(() => {
    currentSelectionContext.current = selectionContext;
  }, [selectionContext]);

  React.useEffect(() => {
    screenMounted.current = true;
    return () => {
      screenMounted.current = false;
    };
  }, []);

  function handleDirectGrantCreated(
    item: PermissionGrantAdminItem,
    submittedContext: string,
  ): void {
    const navigationAttempted =
      screenMounted.current && currentSelectionContext.current === submittedContext;
    if (navigationAttempted) {
      handleCreatedGrant(item.id);
    }
    setFocusGrantIdAfterClose({ id: item.id, navigationAttempted });
    setDirectGrantOpen(false);
  }

  React.useEffect(() => {
    const pending = focusGrantIdAfterClose;
    if (directGrantOpen || pending === null) return;
    // The dialog has no Radix trigger (opened by a plain toolbar button), so the
    // library has nothing to restore focus to. The navigation to the created
    // grant settles asynchronously: wait for it, then return focus to the
    // selected row, falling back to the trigger while no row is mounted.
    const settled = pending.navigationAttempted ? pending.id === selectedId : true;
    if (!settled) return;
    setFocusGrantIdAfterClose(null);
    const panel = document.getElementById(PERMISSION_GRANTS_PANEL_ID);
    const selectedBar = panel?.querySelector('[data-testid="object-row-selected-bar"]');
    const selectedRow = selectedBar?.closest<HTMLElement>('[role="button"]');
    if (selectedRow) {
      selectedRow.focus();
      return;
    }
    directGrantTriggerRef.current?.focus();
  }, [directGrantOpen, focusGrantIdAfterClose, selectedId]);

  const tabs: ListToolbarTab[] = permissionGrantTabs.map((tab) => ({
    value: tab.value,
    label: tab.label,
    id: `permission-grant-tab-${tab.value}`,
    controlsId: PERMISSION_GRANTS_PANEL_ID,
    ...(tab.value === 'grants' && grantCountKnown ? { badgeCount: grants.length } : {}),
    ...(tab.value === 'denies' && denyCountKnown ? { badgeCount: denies.length } : {}),
  }));

  return (
    <ListShell
      toolbar={{
        title: ADMIN_PERMISSIONS_COPY.activeTitle,
        subtitle: ADMIN_PERMISSIONS_COPY.listSubtitle,
        actions: (
          <>
            <Button
              ref={directGrantTriggerRef}
              type="button"
              size="sm"
              onClick={() => setDirectGrantOpen(true)}
            >
              {ADMIN_PERMISSIONS_COPY.directGrant.action}
            </Button>
            <PermissionDirectGrantForm
              open={directGrantOpen}
              selectionContext={selectionContext}
              managedSystemNames={managedSystemNames}
              activeGrants={grants}
              cacheReturnedGrant={cacheReturnedGrant}
              onOpenChange={setDirectGrantOpen}
              onCreated={handleDirectGrantCreated}
            />
          </>
        ),
      }}
      tabs={
        <ListTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(next) => handleTabChange(next as typeof activeTab)}
          ariaLabel={ADMIN_PERMISSIONS_COPY.tabLabel}
        />
      }
      list={
        <section
          id={PERMISSION_GRANTS_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`permission-grant-tab-${activeTab}`}
          data-testid="permission-grants-list"
        >
          {isPending ? (
            <p className="p-6 text-sm text-text-muted">{ADMIN_PERMISSIONS_COPY.loading}</p>
          ) : null}
          {isError ? (
            <p className="p-6 text-sm text-accent-danger">{ADMIN_PERMISSIONS_COPY.error}</p>
          ) : null}
          {!isPending && !isError && visiblePermissions.length === 0 ? (
            <ListStateMessage variant="empty" title={ADMIN_PERMISSIONS_COPY.empty} />
          ) : null}
          {visiblePermissions.map((permission) => (
            <ActivePermissionRow
              key={permission.item.id}
              permission={permission}
              actorName={actorNames[permission.item.actor_id]}
              managedSystemName={
                permission.item.managed_system_id
                  ? managedSystemNames[permission.item.managed_system_id]
                  : undefined
              }
              selected={selectedId === permission.item.id}
              onSelect={() => handleSelect(permission.item.id)}
            />
          ))}
        </section>
      }
      detailPanel={
        selected ? (
          <PermissionGrantDetail
            permission={selected}
            actorNames={actorNames}
            managedSystemNames={managedSystemNames}
            onClose={handleClose}
            onGrantRevoked={discardReturnedGrant}
            onSuccess={handleClose}
          />
        ) : undefined
      }
    />
  );
}

function ActivePermissionRow({
  permission,
  actorName,
  managedSystemName,
  selected,
  onSelect,
}: {
  permission: ActivePermission;
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const { kind, item } = permission;
  const when = kind === 'grants' ? item.granted_at : item.created_at;
  const expiration = kind === 'grants' ? item.expires_at : null;

  return (
    <ObjectRow
      title={`${actorName ?? GLOSSARY.unknownUser} · ${getCapabilityDisplayLabel(item.capability)}`}
      selected={selected}
      onClick={onSelect}
      meta={
        <>
          <span className="font-mono text-text-muted">{item.capability}</span>
          <span>·</span>
          <span>
            {item.managed_system_id
              ? (managedSystemName ?? GLOSSARY.managedSystem)
              : SCOPE_SELECTOR_COPY.workspaceAll}
          </span>
          {item.managed_system_id && !managedSystemName ? (
            <span className="font-mono text-text-muted">{shortId(item.managed_system_id)}</span>
          ) : null}
          <span>·</span>
          <span>{formatDateTime(when)}</span>
          {expiration ? (
            <>
              <span>·</span>
              <span>
                {ADMIN_PERMISSIONS_COPY.expiration} {formatDateOnly(expiration.slice(0, 10))}
              </span>
            </>
          ) : null}
          <span>·</span>
          <span className="font-mono text-text-muted">{shortId(item.id)}</span>
        </>
      }
      trailing={
        !actorName ? (
          <span className="text-right text-xs text-text-muted">
            <span className="font-mono">{shortId(item.actor_id)}</span>
          </span>
        ) : undefined
      }
    />
  );
}
