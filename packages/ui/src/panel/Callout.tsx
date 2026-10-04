import type * as React from 'react';
import { cn } from '../utils/cn.js';

export type CalloutTone = 'amber' | 'red' | 'blue' | 'cyan' | 'emerald';

export interface CalloutProps {
  tone: CalloutTone;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<
  CalloutTone,
  { colorVar: string; backgroundAlpha: string; ringAlpha: string; titleVar: string }
> = {
  amber: {
    colorVar: '--color-amber',
    backgroundAlpha: '0.08',
    ringAlpha: '0.3',
    titleVar: '--text-warning',
  },
  red: {
    colorVar: '--color-warning-red',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    titleVar: '--text-danger',
  },
  blue: {
    colorVar: '--color-aether-blue',
    backgroundAlpha: '0.04',
    ringAlpha: '0.2',
    titleVar: '--text-secondary',
  },
  cyan: {
    colorVar: '--color-cyan-spark',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    titleVar: '--text-secondary',
  },
  emerald: {
    colorVar: '--color-emerald',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    titleVar: '--text-secondary',
  },
};

export function Callout({ tone, icon, title, children, action, className }: CalloutProps) {
  const toneStyle = TONE_STYLES[tone];
  const toneColor = `rgb(var(${toneStyle.colorVar}))`;

  // The approved prototype uses a tint and inset ring instead of the issue's initial left border.
  return (
    <div
      data-tone={tone}
      className={cn('rounded-md text-xs text-text-secondary', className)}
      style={{
        padding: 12,
        borderRadius: 6,
        background: `rgb(var(${toneStyle.colorVar}) / ${toneStyle.backgroundAlpha})`,
        boxShadow: `rgb(var(${toneStyle.colorVar}) / ${toneStyle.ringAlpha}) 0 0 0 1px inset`,
        color: 'rgb(var(--text-secondary))',
        fontSize: 'var(--text-xs)',
        lineHeight: 1.55,
      }}
    >
      {title !== undefined ? (
        <>
          <div className="mb-1.5 flex items-center gap-2">
            {icon !== undefined && (
              <span style={{ color: toneColor }} className="shrink-0">
                {icon}
              </span>
            )}
            <strong
              className="text-sm font-semibold"
              style={{ color: `rgb(var(${toneStyle.titleVar}))` }}
            >
              {title}
            </strong>
          </div>
          <div>{children}</div>
          {action !== undefined && <div className="mt-2">{action}</div>}
        </>
      ) : (
        <div className="flex items-start gap-2">
          {icon !== undefined && (
            <span style={{ color: toneColor }} className="mt-0.5 shrink-0">
              {icon}
            </span>
          )}
          <span className="flex-1">{children}</span>
          {action !== undefined && <div className="ml-auto">{action}</div>}
        </div>
      )}
    </div>
  );
}
