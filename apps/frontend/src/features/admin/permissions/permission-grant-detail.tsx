import { Button, FieldRow, PanelSectionTitle } from '@fops/ui';

import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { GLOSSARY } from '@/lib/copy/glossary';
import { SCOPE_SELECTOR_COPY } from '@/lib/copy/managed-system-scope';
import { formatDateOnly, formatDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';
import type { PermissionDenyAdminItem, PermissionGrantAdminItem } from '@fops/shared';

import { PermissionGrantActionForm } from './permission-grant-action-form.js';
import type { ActivePermission } from './use-permission-grants-console.js';

export function PermissionGrantDetail({
  permission,
  actorNames,
  managedSystemNames,
  onClose,
  onSuccess,
}: {
  permission: ActivePermission;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { kind, item } = permission;
  const actorName = actorNames[item.actor_id] ?? GLOSSARY.unknownUser;

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="permission-grants-detail-panel"
    >
      <header className="flex h-[50px] items-center gap-3 border-b border-border-subtle px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-muted">
            {kind === 'grants'
              ? ADMIN_PERMISSIONS_COPY.activeTitle
              : ADMIN_PERMISSIONS_COPY.deniesTab}
          </p>
          <p className="truncate text-sm font-medium text-text-primary">
            {actorName} · {getCapabilityDisplayLabel(item.capability)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={ADMIN_PERMISSIONS_COPY.closePanel}
        >
          {ADMIN_PERMISSIONS_COPY.close}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>
              {kind === 'grants'
                ? ADMIN_PERMISSIONS_COPY.grantInfo
                : ADMIN_PERMISSIONS_COPY.denyInfo}
            </PanelSectionTitle>
            <FieldRow label={ADMIN_PERMISSIONS_COPY.target} className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>{actorName}</span>
                <span className="font-mono text-xs text-text-muted">{shortId(item.actor_id)}</span>
              </span>
            </FieldRow>
            <FieldRow label={ADMIN_PERMISSIONS_COPY.permission} className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>{getCapabilityDisplayLabel(item.capability)}</span>
                <span className="font-mono text-xs text-text-muted">{item.capability}</span>
              </span>
            </FieldRow>
            <FieldRow label={ADMIN_PERMISSIONS_COPY.scope} className="px-0">
              <PermissionScope
                id={item.managed_system_id}
                name={
                  item.managed_system_id ? managedSystemNames[item.managed_system_id] : undefined
                }
              />
            </FieldRow>
            {kind === 'grants' ? (
              <GrantFields item={item} actorNames={actorNames} />
            ) : (
              <DenyFields item={item} actorNames={actorNames} />
            )}
            <FieldRow label={ADMIN_PERMISSIONS_COPY.id} className="px-0">
              <span className="font-mono text-xs text-text-muted">{shortId(item.id)}</span>
            </FieldRow>
          </section>
          <PermissionGrantActionForm
            key={`${kind}:${item.id}`}
            kind={kind}
            id={item.id}
            actorId={item.actor_id}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </aside>
  );
}

function PermissionScope({ id, name }: { id: string | null; name?: string | undefined }) {
  if (!id) return <span>{SCOPE_SELECTOR_COPY.workspaceAll}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name ?? GLOSSARY.managedSystem}</span>
      {!name ? <span className="font-mono text-xs text-text-muted">{shortId(id)}</span> : null}
    </span>
  );
}

function GrantFields({
  item,
  actorNames,
}: {
  item: PermissionGrantAdminItem;
  actorNames: Record<string, string>;
}) {
  return (
    <>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.grantor} className="px-0">
        <ActorValue id={item.granted_by_actor_id} actorNames={actorNames} />
      </FieldRow>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.grantedAt} className="px-0">
        <span>{formatDateTime(item.granted_at)}</span>
      </FieldRow>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.expiration} className="px-0">
        <span>
          {item.expires_at
            ? formatDateOnly(item.expires_at.slice(0, 10))
            : ADMIN_PERMISSIONS_COPY.noExpiration}
        </span>
      </FieldRow>
    </>
  );
}

function DenyFields({
  item,
  actorNames,
}: {
  item: PermissionDenyAdminItem;
  actorNames: Record<string, string>;
}) {
  return (
    <>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.denier} className="px-0">
        <ActorValue id={item.created_by_actor_id} actorNames={actorNames} />
      </FieldRow>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.deniedAt} className="px-0">
        <span>{formatDateTime(item.created_at)}</span>
      </FieldRow>
      <FieldRow label={ADMIN_PERMISSIONS_COPY.denyReason} className="px-0">
        <span className="whitespace-pre-wrap">{item.reason}</span>
      </FieldRow>
    </>
  );
}

function ActorValue({ id, actorNames }: { id: string; actorNames: Record<string, string> }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{actorNames[id] ?? GLOSSARY.unknownUser}</span>
      {!actorNames[id] ? (
        <span className="font-mono text-xs text-text-muted">{shortId(id)}</span>
      ) : null}
    </span>
  );
}
