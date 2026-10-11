import { vi } from 'vitest';

/** Scoped browser APIs: real MutationObserver and real auto-animate remain in use. */
export function installListMotionEnvironment(reduced = false, tokens = true) {
  const root = document.documentElement;
  const previousStyle = root.getAttribute('style');
  if (tokens) {
    root.style.setProperty('--motion-duration-base', '200ms');
    root.style.setProperty('--motion-ease-standard', 'ease-in-out');
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced })),
  );
  class Observer {
    observe(_el: Element) {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  const intersections = vi.fn(() => new Observer());
  vi.stubGlobal('IntersectionObserver', intersections);
  const previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  const finishes: (() => void)[] = [];
  const animate = vi.fn(() => {
    const events = new EventTarget();
    let resolve!: () => void;
    const animation = {
      cancel: vi.fn(),
      playState: 'running',
      finished: new Promise<void>((done) => {
        resolve = done;
      }),
      addEventListener: events.addEventListener.bind(events),
    };
    finishes.push(() => {
      animation.playState = 'finished';
      resolve();
      events.dispatchEvent(new Event('finish'));
    });
    return animation;
  });
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  return {
    animate,
    intersections,
    finishAnimations() {
      for (const finish of finishes.splice(0)) finish();
    },
    restore() {
      if (previousStyle === null) root.removeAttribute('style');
      else root.setAttribute('style', previousStyle);
      if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
      else Reflect.deleteProperty(Element.prototype, 'animate');
      vi.unstubAllGlobals();
    },
  };
}
