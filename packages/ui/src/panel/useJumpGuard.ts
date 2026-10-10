/**
 * Private jump lifecycle for DetailPanelSectionNav. Not a package export.
 * Anchor ranking, sticky geometry, and tab rendering stay with the caller.
 */

import * as React from 'react';
import { prefersReducedMotion } from '../utils/motion.js';

/** Stall net. It starts only once the jump's scroll moves, and restarts on each pulse. */
const JUMP_SAFETY_MS = 700;
/** Bounds a jump whose scroll never starts. A moving jump does not use this. */
const JUMP_START_WATCHDOG_MS = 1500;
const JUMP_END_EPSILON_PX = 1;

type JumpPhase = 'idle' | 'jumping' | 'awaiting-scroll';

interface JumpRelease {
  root: HTMLElement;
  onScroll: () => void;
  onScrollEnd: () => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface RefBox<T> {
  current: T;
}

function clearJumpRelease(release: JumpRelease | null): void {
  if (!release) return;
  if (release.timeoutId !== null) clearTimeout(release.timeoutId);
  release.timeoutId = null;
  release.root.removeEventListener('scroll', release.onScroll);
  release.root.removeEventListener('scrollend', release.onScrollEnd);
}

/** Leave the jump and remember where it landed. No-op unless a jump is in progress. */
function releaseJump(
  phaseRef: RefBox<JumpPhase>,
  releaseRef: RefBox<JumpRelease | null>,
  landingTopRef: RefBox<number | null>,
): void {
  if (phaseRef.current !== 'jumping') return;
  landingTopRef.current = releaseRef.current?.root.scrollTop ?? null;
  clearJumpRelease(releaseRef.current);
  releaseRef.current = null;
  phaseRef.current = 'awaiting-scroll';
}

/** Where a browser will actually land. Targets outside the scroll range clamp. */
function reachableJumpTop(root: HTMLElement, targetTop: number): number {
  const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
  return Math.min(Math.max(targetTop, 0), maxScroll);
}

function scrollReachedJumpEnd(root: HTMLElement, targetTop: number): boolean {
  // The raw target is not the end when it lies past the clamp. A jump that starts
  // already on that clamp never emits scroll or scrollend; one that starts at the
  // bottom and aims upward is not at its end just because scrollTop is the maximum.
  return Math.abs(root.scrollTop - reachableJumpTop(root, targetTop)) <= JUMP_END_EPSILON_PX;
}

export interface JumpGuard {
  /** Scroll `root` toward `targetTop` and own the jump until it lands or is superseded. */
  startJump(root: HTMLElement, targetTop: number): void;
  /** True while observer and fallback selection must keep the clicked section. */
  isSuppressed(): boolean;
  /**
   * True when this scroll should re-rank. Idle scrolls admit. A jump admits once,
   * on the first scroll that leaves its landing by more than 1px.
   */
  admitUserScroll(root: HTMLElement): boolean;
}

export function useJumpGuard(): JumpGuard {
  const phaseRef = React.useRef<JumpPhase>('idle');
  const releaseRef = React.useRef<JumpRelease | null>(null);
  const landingTopRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      clearJumpRelease(releaseRef.current);
      releaseRef.current = null;
    };
  }, []);

  const startJump = React.useCallback((root: HTMLElement, targetTop: number) => {
    clearJumpRelease(releaseRef.current);
    releaseRef.current = null;
    phaseRef.current = 'jumping';
    const originTop = root.scrollTop;
    // The 700ms net must not start at the click. A late smooth scroll (the #901 repro)
    // consumes a click-timed guard before the first pixel moves.
    const release: JumpRelease = {
      root,
      timeoutId: null,
      onScroll: () => {},
      onScrollEnd: () => {
        releaseJump(phaseRef, releaseRef, landingTopRef);
      },
    };
    release.onScroll = () => {
      if (phaseRef.current !== 'jumping') return;
      if (root.scrollTop === originTop) return;
      if (scrollReachedJumpEnd(root, targetTop)) {
        releaseJump(phaseRef, releaseRef, landingTopRef);
        return;
      }
      if (release.timeoutId !== null) clearTimeout(release.timeoutId);
      release.timeoutId = setTimeout(() => {
        if (releaseRef.current !== release) return;
        releaseJump(phaseRef, releaseRef, landingTopRef);
      }, JUMP_SAFETY_MS);
    };
    releaseRef.current = release;
    root.addEventListener('scroll', release.onScroll, { passive: true });
    root.addEventListener('scrollend', release.onScrollEnd);
    root.scrollTo({ top: targetTop, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (phaseRef.current === 'jumping' && scrollReachedJumpEnd(root, targetTop)) {
      releaseJump(phaseRef, releaseRef, landingTopRef);
    } else if (phaseRef.current === 'jumping' && release.timeoutId === null) {
      // No scroll event means no stall net. Bound a browser that ignores scrollTo,
      // a root that never moves, or a root that loses its box. A moving scroll
      // replaces this timer with the stall net, so firing means none arrived.
      release.timeoutId = setTimeout(() => {
        if (releaseRef.current !== release) return;
        releaseJump(phaseRef, releaseRef, landingTopRef);
      }, JUMP_START_WATCHDOG_MS);
    }
  }, []);

  const isSuppressed = React.useCallback(() => phaseRef.current !== 'idle', []);

  const admitUserScroll = React.useCallback((root: HTMLElement) => {
    if (phaseRef.current === 'jumping') return false;
    if (phaseRef.current === 'idle') return true;
    const landingTop = landingTopRef.current;
    // The jump's own finishing pulse stays within 1px of the landing, so it does not admit.
    if (landingTop === null || Math.abs(root.scrollTop - landingTop) <= JUMP_END_EPSILON_PX) {
      return false;
    }
    phaseRef.current = 'idle';
    landingTopRef.current = null;
    return true;
  }, []);

  return { startJump, isSuppressed, admitUserScroll };
}
