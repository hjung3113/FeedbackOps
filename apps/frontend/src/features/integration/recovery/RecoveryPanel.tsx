import { ListStateMessage } from '@/components/ListStateMessage';
import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import { ApiError, patchRecoveryPresentation } from '@/lib/api';
import { RECOVERY_COPY as COPY } from '@/lib/copy/recovery';
import { invalidateRecovery, invalidateRecoverySource } from '@/lib/query/recovery';
import { InternalLink } from '@/lib/router/InternalLink';
import type { RecoveryDetail, RecoveryPresentationPatch } from '@fops/shared';
import {
  Button,
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  PermissionBlockedPanel,
  Skeleton,
} from '@fops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect } from 'react';
import { RecoveryFreshness } from './RecoveryFreshness';

function sourceHref(route: string, returnTo: string) {
  const url = new URL(route, 'https://recovery.internal');
  url.searchParams.set('returnTo', returnTo);
  return url.pathname + url.search + url.hash;
}
export function RecoveryPanel({
  id,
  item,
  loading,
  error,
  updatedAt,
  onClose,
  onRetry,
  returnTo,
}: {
  id: string;
  item: RecoveryDetail | undefined;
  loading: boolean;
  error: unknown;
  updatedAt: number;
  onClose: () => void;
  onRetry: () => void;
  returnTo: string;
}) {
  const client = useQueryClient();
  const fullscreen = useContext(DetailPanelFullscreenContext);
  const mutation = useMutation({
    mutationFn: (body: RecoveryPresentationPatch) => patchRecoveryPresentation(id, body),
    // Hook-level callbacks survive selection changes/unmount; never close a newer selection.
    onSuccess: (data) =>
      Promise.all([invalidateRecovery(client), invalidateRecoverySource(client, data.category)]),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'conflict.stale_write')
        void invalidateRecovery(client);
    },
  });
  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || fullscreen?.expanded) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose, fullscreen?.expanded]);
  return (
    <section
      aria-label={COPY.title}
      className="flex h-full min-h-0 flex-col"
      data-testid="recovery-panel"
    >
      <header className="flex h-toolbar shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <h2 className="text-sm font-semibold">{COPY.title}</h2>
        <div className="flex items-center gap-2">
          <DetailPanelFullscreenToggle />
          <Button variant="subtle" size="sm" aria-label={COPY.closePanel} onClick={onClose}>
            {COPY.close}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <RecoveryFreshness computedAt={item?.computed_at} failed={!!error} updatedAt={updatedAt} />
        {loading ? (
          <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
        ) : error instanceof ApiError && error.status === 403 ? (
          <>
            <p>{COPY.denied}</p>
            <PermissionBlockedPanel state="denied" category={COPY.title} />
          </>
        ) : error ? (
          <ListStateMessage
            variant="error"
            title={error instanceof ApiError && error.status === 404 ? COPY.missing : COPY.error}
            {...(!(error instanceof ApiError && error.status === 404)
              ? { action: { label: COPY.retry, onClick: onRetry } }
              : {})}
          />
        ) : item ? (
          <div className="flex flex-col gap-4">
            <p>{item.reason}</p>
            <p>
              <span>{COPY.state[item.state]}</span> · {COPY.occurrence(item.occurrence)}
            </p>
            {item.resolution && (
              <p>
                {COPY.state[item.resolution.outcome]} · {item.resolution.resolved_at} ·{' '}
                {item.resolution.evidence === 'command' ? COPY.command : COPY.observation}
              </p>
            )}
            <p>
              {COPY.responsibility} · {item.responsible_actor_hint.label}
            </p>
            {item.source && (
              <InternalLink href={sourceHref(item.source.route, returnTo)}>
                {item.source.display_id} · {item.source.title} · {COPY.source}
              </InternalLink>
            )}
            {item.affected.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3>{COPY.affected}</h3>
                {item.affected.map((source) => (
                  <InternalLink
                    key={`${source.type}:${source.id}`}
                    href={sourceHref(source.route, returnTo)}
                  >
                    {source.display_id} · {source.title}
                  </InternalLink>
                ))}
              </div>
            )}
            {item.state === 'active' &&
              item.next_actions.map((action) => (
                <div key={action.id} className="flex flex-col gap-2">
                  {action.availability === 'available' ? (
                    <Button asChild variant="primary" size="sm">
                      <InternalLink href={sourceHref(action.target.route, returnTo)}>
                        {action.label}
                      </InternalLink>
                    </Button>
                  ) : (
                    <>
                      <p>{action.blocked_reason}</p>
                      <PermissionBlockedPanel state="denied" category={COPY.title} />
                      {action.availability === 'blocked_requestable' &&
                        action.requestable_permission && (
                          <RequestAccessButton
                            capability={action.requestable_permission.permission}
                            managedSystemId={action.requestable_permission.managed_system_id}
                            returnRouteIntent={returnTo}
                          />
                        )}
                    </>
                  )}
                </div>
              ))}
            <p className="text-xs text-text-muted">{COPY.personal}</p>
            {item.state === 'active' && (
              <div className="flex flex-wrap gap-2">
                {item.presentation.state === 'visible' ? (
                  <>
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: 'snooze', days: 1 })}
                    >
                      {COPY.snooze1}
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: 'snooze', days: 7 })}
                    >
                      {COPY.snooze7}
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: 'mute' })}
                    >
                      {COPY.mute}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'restore' })}
                  >
                    {COPY.restore}
                  </Button>
                )}
              </div>
            )}
            {mutation.isError && (
              <p role="alert">
                {mutation.error instanceof ApiError &&
                mutation.error.code === 'conflict.stale_write'
                  ? COPY.conflict
                  : COPY.patchError}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
