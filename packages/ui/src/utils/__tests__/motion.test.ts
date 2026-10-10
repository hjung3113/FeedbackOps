import { afterEach, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from '../motion.js';

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
