// ReporterCard — displays the currently logged-in reporter's info.
// Uses useMe() from @/lib/auth/useMe. Shows skeleton while loading;
// renders nothing on error (auth guard in _authed.tsx handles redirect).

import { useMe } from '@/lib/auth/useMe';
import { ROLE_LEVEL_DISPLAY_LABELS } from '@/lib/copy/enum-labels';
import type { RoleLevel } from '@fops/shared';
import { Avatar, AvatarFallback, Card, CardContent, Skeleton } from '@fops/ui';
import type * as React from 'react';

export interface ReporterCardProps {
  className?: string;
}

export function ReporterCard({ className }: ReporterCardProps): React.ReactElement | null {
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <Card padding="compact" className={className}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-text-muted">
          제출자
        </div>
        <CardContent padding="none" className="flex items-center gap-3">
          {/* oxlint-disable-next-line shadcn/no-restyle -- the reporter loading placeholder reserves the circular 32px avatar shape */}
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    // Auth guard (_authed.tsx) should have redirected; render nothing as fallback.
    return null;
  }

  const { actor } = data;
  const initial = actor.display_name.charAt(0).toUpperCase();
  // TODO: workspace name when Slice 4 exposes /workspaces/me

  return (
    <Card padding="compact" className={className}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-text-muted">
        제출자
      </div>
      <CardContent padding="none" className="flex items-center gap-2.5">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-text-primary">{actor.display_name}</span>
          <span className="text-xs text-text-muted">
            역할: {ROLE_LEVEL_DISPLAY_LABELS[actor.role_level as RoleLevel]}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
