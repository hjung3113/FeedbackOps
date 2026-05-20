import * as React from 'react';
import { UserAvatar } from './UserAvatar.js';
import type { AvatarUser } from './UserAvatar.js';
import { cn } from '../utils/cn.js';

export interface UserChipProps {
  user: AvatarUser | null | undefined;
  size?: 'sm' | 'md';
  sub?: string;
  className?: string;
}

/**
 * Composes UserAvatar + display_name + optional sub-label.
 * When user is null/undefined, renders a muted "알 수 없는 사용자" placeholder
 * with a dashed-border avatar circle.
 */
export function UserChip({ user, size = 'md', sub, className }: UserChipProps): React.ReactElement {
  const nameClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const avatarSize = size === 'sm' ? 'sm' : 'md';

  if (user == null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-default',
            avatarSize === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm',
            'text-text-muted',
          )}
          aria-hidden="true"
        />
        <span className={cn(nameClass, 'text-text-muted')}>알 수 없는 사용자</span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <UserAvatar user={user} size={avatarSize} />
      <span className={cn('flex flex-col')}>
        <span className={cn(nameClass, 'text-text-primary leading-none')}>{user.display_name}</span>
        {sub !== undefined && (
          <span className="text-xs text-text-muted leading-none mt-0.5">{sub}</span>
        )}
      </span>
    </span>
  );
}
