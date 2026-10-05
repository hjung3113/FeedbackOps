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
    titleVar: '--text-warning-label', // #750: AA label color departs from the prototype mapping.
  },
  red: {
    colorVar: '--color-warning-red',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    titleVar: '--text-danger-label', // #750: AA label color departs from the prototype mapping.
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
  const style = {
    // oxlint-disable-next-line shadcn/no-inline-styles -- tone values from TONE_STYLES; Callout.test pins these style values (class conversion is a follow-up)
    '--callout-color': `rgb(var(${toneStyle.colorVar}))`,
    // oxlint-disable-next-line shadcn/no-inline-styles -- tone values from TONE_STYLES; Callout.test pins these style values (class conversion is a follow-up)
    '--callout-background': `rgb(var(${toneStyle.colorVar}) / ${toneStyle.backgroundAlpha})`,
    // oxlint-disable-next-line shadcn/no-inline-styles -- tone values from TONE_STYLES; Callout.test pins these style values (class conversion is a follow-up)
    '--callout-ring': `rgb(var(${toneStyle.colorVar}) / ${toneStyle.ringAlpha}) 0 0 0 1px inset`,
    // oxlint-disable-next-line shadcn/no-inline-styles -- tone values from TONE_STYLES; Callout.test pins these style values (class conversion is a follow-up)
    '--callout-title-color': `rgb(var(${toneStyle.titleVar}))`,
  } as React.CSSProperties;

  // The approved prototype uses a tint and inset ring instead of the issue's initial left border.
  return (
    <div
      data-tone={tone}
      className={cn(
        'rounded-md p-3 text-xs leading-note text-text-secondary bg-(--callout-background) shadow-(--callout-ring)',
        className,
      )}
      style={style}
    >
      {title !== undefined ? (
        <>
          <div className="mb-1.5 flex items-center gap-2">
            {icon !== undefined && <span className="shrink-0 text-(--callout-color)">{icon}</span>}
            <strong className="text-sm font-semibold text-(--callout-title-color)">{title}</strong>
          </div>
          <div>{children}</div>
          {action !== undefined && <div className="mt-2">{action}</div>}
        </>
      ) : (
        <div className="flex items-start gap-2">
          {icon !== undefined && (
            <span className="mt-0.5 shrink-0 text-(--callout-color)">{icon}</span>
          )}
          <span className="flex-1">{children}</span>
          {action !== undefined && <div className="ml-auto">{action}</div>}
        </div>
      )}
    </div>
  );
}
