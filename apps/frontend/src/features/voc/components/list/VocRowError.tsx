import * as React from 'react';
import { Button } from '@fops/ui';
import { cn } from '@fops/ui';

export interface VocRowErrorProps {
  onRetry?: () => void;
  className?: string;
}

/**
 * Inline error row — same 60px (h-15) + px-4 frame as VocRow.
 * Renders a muted warning glyph + error copy + optional retry button.
 */
export function VocRowError({ onRetry, className }: VocRowErrorProps) {
  return (
    <div
      role="row"
      className={cn(
        'flex w-full items-center gap-3 px-4 h-15 text-sm text-text-muted',
        className,
      )}
    >
      {/* Muted warning icon using a simple unicode glyph */}
      <span aria-hidden="true" className="text-base">⚠</span>
      <span className="flex-1">이 VOC를 불러올 수 없습니다.</span>
      {onRetry !== undefined && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          type="button"
        >
          다시 시도
        </Button>
      )}
    </div>
  );
}

VocRowError.displayName = 'VocRowError';
