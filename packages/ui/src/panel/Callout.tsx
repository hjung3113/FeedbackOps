import * as React from 'react';
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

/**
 * Tone → CSS variable map — verbatim from components.jsx CALLOUT_TONES.
 * amber  → --color-amber
 * red    → --color-warning-red
 * blue   → --color-aether-blue
 * cyan   → --color-cyan-spark
 * emerald → --color-emerald
 */
const TONE_VAR: Record<CalloutTone, string> = {
  amber:   '--color-amber',
  red:     '--color-warning-red',
  blue:    '--color-aether-blue',
  cyan:    '--color-cyan-spark',
  emerald: '--color-emerald',
};

export function Callout({ tone, icon, title, children, action, className }: CalloutProps) {
  const cssVar = TONE_VAR[tone];
  const toneColor = `var(${cssVar})`;

  return (
    <div
      data-tone={tone}
      className={cn('rounded-md overflow-hidden text-sm text-text-secondary', className)}
      style={{
        borderLeft: `4px solid ${toneColor}`,
        background: `color-mix(in srgb, ${toneColor} 8%, transparent)`,
      }}
    >
      <div className="p-3">
        {title !== undefined ? (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              {icon !== undefined && (
                <span style={{ color: toneColor }} className="flex-shrink-0">
                  {icon}
                </span>
              )}
              <strong className="text-text-primary text-sm font-semibold">{title}</strong>
            </div>
            <div className="text-text-muted text-xs leading-relaxed">{children}</div>
            {action !== undefined && (
              <div className="mt-2">{action}</div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2">
            {icon !== undefined && (
              <span style={{ color: toneColor }} className="flex-shrink-0 mt-0.5">
                {icon}
              </span>
            )}
            <span className="text-xs leading-relaxed text-text-muted flex-1">{children}</span>
            {action !== undefined && <div className="ml-auto">{action}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
