import autoAnimate from '@formkit/auto-animate';
import { type RefCallback, useCallback, useRef } from 'react';
import { readMotionTiming } from './motion.js';

/** Attach only to bounded lists; remount this boundary when its resource/context changes. */
export function useListMotion(): RefCallback<HTMLElement> {
  const controller = useRef<ReturnType<typeof autoAnimate> | null>(null);
  return useCallback((element) => {
    controller.current?.destroy?.();
    controller.current = null;
    if (!element) return;
    const { durationMs, easing } = readMotionTiming('base', 'standard');
    if (durationMs > 0) {
      controller.current = autoAnimate(element, { duration: durationMs, easing });
    }
  }, []);
}
