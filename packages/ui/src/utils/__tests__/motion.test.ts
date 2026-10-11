import { afterEach, expect, it, vi } from 'vitest';
import { prefersReducedMotion, readMotionTiming } from '../motion.js';

afterEach(() => vi.unstubAllGlobals());

it.each([
  { preference: 'reduce', matches: true, expected: true },
  { preference: 'no-preference', matches: false, expected: false },
  { preference: 'unavailable', matches: undefined, expected: false },
])('reads reduced motion when matchMedia is $preference', ({ matches, expected }) => {
  const matchMedia = matches === undefined ? undefined : vi.fn(() => ({ matches }));
  vi.stubGlobal('matchMedia', matchMedia);

  expect(prefersReducedMotion()).toBe(expected);
  if (matchMedia) {
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  }
});

it.each([
  [' 175ms ', false, 175],
  ['0.25s', false, 250],
  ['', false, 0],
  ['200ms', true, 0],
  ['200ms junk', false, 0],
  ['-2s', false, 0],
])('reads duration %s with reduced motion %s', (value, reduced, durationMs) => {
  document.documentElement.style.setProperty('--motion-duration-base', value);
  document.documentElement.style.setProperty('--motion-ease-standard', ' ease-in ');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced })),
  );
  try {
    expect(readMotionTiming('base', 'standard')).toEqual({ durationMs, easing: 'ease-in' });
  } finally {
    document.documentElement.style.removeProperty('--motion-duration-base');
    document.documentElement.style.removeProperty('--motion-ease-standard');
  }
});
