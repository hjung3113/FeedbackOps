/**
 * Overlay motion is enter-only. A dismissable layer must unmount the moment it closes:
 * exit Presence keeps a closed layer registered as Radix's highest layer, owning Escape.
 * Define overlay motion only here and keep every Tailwind candidate literal.
 */
export const SELECT_CONTENT_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=delayed-open]:animation-duration-base data-[state=delayed-open]:ease-enter data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=instant-open]:zoom-in-95 data-[state=instant-open]:animation-duration-base data-[state=instant-open]:ease-enter data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

// Select shares the enter-only popper motion; keep both public exports.
export const POPPER_CONTENT_MOTION = SELECT_CONTENT_MOTION;

export const DIALOG_CONTENT_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=open]:zoom-in-95';

export const SCRIM_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:animation-duration-base data-[state=open]:ease-enter';

export const SHEET_CONTENT_MOTION = {
  top: 'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=open]:slide-in-from-top',
  bottom:
    'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=open]:slide-in-from-bottom',
  left: 'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=open]:slide-in-from-left',
  right:
    'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=open]:slide-in-from-right',
} as const;

/** Read at the point of motion so changes to the OS preference take effect immediately. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** The JS entry to motion tokens; missing/invalid timing and reduced motion disable motion. */
export function readMotionTiming(
  duration: 'fast' | 'base' | 'slow',
  easing: 'standard' | 'enter' | 'exit',
): { durationMs: number; easing: string } {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return { durationMs: 0, easing: '' };
  }
  const style = getComputedStyle(document.documentElement);
  const value = style.getPropertyValue(`--motion-duration-${duration}`).trim();
  const ease = style.getPropertyValue(`--motion-ease-${easing}`).trim();
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value);
  const durationMs = match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : 0;
  return {
    durationMs: prefersReducedMotion() || !Number.isFinite(durationMs) ? 0 : durationMs,
    easing: ease,
  };
}
