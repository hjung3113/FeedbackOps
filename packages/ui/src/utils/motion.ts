/** Overlay motion is defined only here. Keep every Tailwind candidate literal. */
// Select has no exit Presence; share the popper entry without changing its lifecycle.
export const SELECT_CONTENT_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=delayed-open]:animation-duration-base data-[state=delayed-open]:ease-enter data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=instant-open]:zoom-in-95 data-[state=instant-open]:animation-duration-base data-[state=instant-open]:ease-enter data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

export const POPPER_CONTENT_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=delayed-open]:animation-duration-base data-[state=delayed-open]:ease-enter data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=instant-open]:zoom-in-95 data-[state=instant-open]:animation-duration-base data-[state=instant-open]:ease-enter data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animation-duration-fast data-[state=closed]:ease-exit data-[side=bottom]:slide-out-to-top-2 data-[side=left]:slide-out-to-right-2 data-[side=right]:slide-out-to-left-2 data-[side=top]:slide-out-to-bottom-2';

export const DIALOG_CONTENT_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:animation-duration-fast data-[state=closed]:ease-exit data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95';

export const SCRIM_MOTION =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:animation-duration-base data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:animation-duration-fast data-[state=closed]:ease-exit';

export const SHEET_CONTENT_MOTION = {
  top: 'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:animation-duration-base data-[state=closed]:ease-exit data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top',
  bottom:
    'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:animation-duration-base data-[state=closed]:ease-exit data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  left: 'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:animation-duration-base data-[state=closed]:ease-exit data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
  right:
    'data-[state=open]:animate-in data-[state=open]:animation-duration-slow data-[state=open]:ease-enter data-[state=closed]:animate-out data-[state=closed]:animation-duration-base data-[state=closed]:ease-exit data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
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
