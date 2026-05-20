// ReporterCard — displays the currently logged-in reporter's info.
// Uses useMe() from @/lib/auth/useMe. Shows skeleton while loading;
// renders nothing on error (auth guard in _authed.tsx handles redirect).

import * as React from 'react';
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  Skeleton,
  cn,
} from '@fops/ui';
import { useMe } from '@/lib/auth/useMe';

export interface ReporterCardProps {
  className?: string;
}

export function ReporterCard({ className }: ReporterCardProps): React.ReactElement | null {
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <Card className={cn('p-4', className)}>
        <CardContent className="flex items-center gap-3 p-0">
          <Skeleton className="h-10 w-10 rounded-full" />
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
    <Card className={cn('p-4', className)}>
      <CardContent className="flex items-center gap-3 p-0">
        <Avatar>
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">{actor.display_name}</span>
          <span className="text-xs text-text-muted">{actor.role_level}</span>
        </div>
      </CardContent>
    </Card>
  );
}
