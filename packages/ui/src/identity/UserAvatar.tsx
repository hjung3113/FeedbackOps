import * as React from 'react';
import { Avatar, AvatarFallback } from '../components/shadcn/avatar.js';
import { cn } from '../utils/cn.js';

export interface AvatarUser {
  display_name: string;
  // No avatar URL in Slice 3 — initials-only fallback.
  // Future: optional avatar_url field.
}

export interface UserAvatarProps {
  user: AvatarUser;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

/**
 * Domain wrapper around the shadcn Avatar primitive.
 * Renders an initials-only avatar (no image URL in Slice 3).
 * For Korean names, charAt(0) returns the first Hangul syllable as-is.
 */
export function UserAvatar({ user, size = 'md', className }: UserAvatarProps): React.ReactElement {
  const initial = user.display_name.charAt(0).toUpperCase();
  const sizeClass = SIZE_CLASSES[size];

  return (
    <Avatar className={cn(sizeClass, className)}>
      <AvatarFallback className={sizeClass}>{initial}</AvatarFallback>
    </Avatar>
  );
}
