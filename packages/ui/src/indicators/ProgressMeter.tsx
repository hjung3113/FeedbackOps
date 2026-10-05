import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface ProgressMeterProps {
  element?: 'div' | 'span';
  value: number;
  max?: number;
  size?: 'thin' | 'normal';
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  trackTone?: 'row-hover' | 'row-selected' | 'subtle';
  fillShape?: 'rounded' | 'square';
  /** Clip the fill to the track's rounded shape. Off by default: an unclipped fill keeps its own rounded caps. */
  clip?: boolean;
  className?: string;
  'data-testid'?: string;
  semantics?: 'plain' | 'decorative' | { role: 'meter' | 'progressbar'; label: string };
}

const FILL_TONE_CLASS: Record<NonNullable<ProgressMeterProps['tone']>, string> = {
  primary: 'bg-accent-primary',
  success: 'bg-accent-success',
  warning: 'bg-accent-warn',
  danger: 'bg-accent-danger',
};

const TRACK_TONE_CLASS: Record<NonNullable<ProgressMeterProps['trackTone']>, string> = {
  'row-hover': 'bg-surface-row-hover',
  'row-selected': 'bg-surface-row-selected',
  subtle: 'bg-border-subtle',
};

/** Shared progress track and fill. Runtime percentages stay in a CSS custom property. */
export function ProgressMeter({
  element = 'div',
  value,
  max = 100,
  size = 'normal',
  tone = 'primary',
  trackTone,
  fillShape = 'rounded',
  clip = false,
  className,
  'data-testid': testId,
  semantics = 'plain',
}: ProgressMeterProps) {
  const Track = element;
  const Fill = element;
  const width = `${(value / max) * 100}%`;
  const accessibilityProps =
    semantics === 'decorative'
      ? { 'aria-hidden': true }
      : semantics === 'plain'
        ? {}
        : {
            role: semantics.role,
            'aria-label': semantics.label,
            'aria-valuemin': 0,
            'aria-valuemax': max,
            'aria-valuenow': value,
          };

  return (
    <Track
      {...accessibilityProps}
      className={cn(
        'rounded-full',
        clip && 'overflow-hidden',
        size === 'thin' ? 'h-1' : 'h-1.5',
        trackTone !== undefined ? TRACK_TONE_CLASS[trackTone] : undefined,
        className,
      )}
    >
      <Fill
        className={cn(
          'block h-full w-(--progress-meter-width)',
          fillShape === 'rounded' ? 'rounded-full' : 'rounded-none',
          FILL_TONE_CLASS[tone],
        )}
        style={{ '--progress-meter-width': width } as React.CSSProperties}
        {...(testId !== undefined ? { 'data-testid': testId } : {})}
      />
    </Track>
  );
}
