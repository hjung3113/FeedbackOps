import { afterEach, expect, it, vi } from 'vitest';
import {
  DIALOG_CONTENT_MOTION,
  POPPER_CONTENT_MOTION,
  SCRIM_MOTION,
  SELECT_CONTENT_MOTION,
  SHEET_CONTENT_MOTION,
  prefersReducedMotion,
  readMotionTiming,
} from '../motion.js';

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

it.each([
  ['popper', POPPER_CONTENT_MOTION, 'base'],
  ['dialog', DIALOG_CONTENT_MOTION, 'base'],
  ['scrim', SCRIM_MOTION, 'base'],
  ['select', SELECT_CONTENT_MOTION, 'base'],
  ...Object.entries(SHEET_CONTENT_MOTION).map(([side, classes]) => [side, classes, 'slow']),
])('%s overlay is enter-only', (name, classes, duration) => {
  expect(classes).not.toMatch(/state=closed|animate-out|-out-/);
  expect(classes).toContain('data-[state=open]:animate-in');
  expect(classes).toContain(`data-[state=open]:animation-duration-${duration}`);
  expect(classes).toContain('data-[state=open]:ease-enter');
  if (duration === 'slow') {
    expect(classes).toContain(`data-[state=open]:slide-in-from-${name}`);
  } else {
    expect(classes).toContain('data-[state=open]:fade-in-0');
    if (name !== 'scrim') expect(classes).toContain('data-[state=open]:zoom-in-95');
  }
  if (name === 'popper' || name === 'select') {
    for (const state of ['delayed-open', 'instant-open']) {
      for (const motion of [
        'animate-in',
        'fade-in-0',
        'zoom-in-95',
        'animation-duration-base',
        'ease-enter',
      ]) {
        expect(classes).toContain(`data-[state=${state}]:${motion}`);
      }
    }
    for (const slide of [
      'data-[side=bottom]:slide-in-from-top-2',
      'data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2',
      'data-[side=top]:slide-in-from-bottom-2',
    ]) {
      expect(classes).toContain(slide);
    }
  }
});
