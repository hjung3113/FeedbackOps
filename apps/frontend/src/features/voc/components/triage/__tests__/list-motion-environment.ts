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
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  const previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  const animate = vi.fn(() => ({
    cancel: vi.fn(),
    playState: 'running',
    finished: new Promise(() => {}),
    addEventListener: vi.fn(),
  }));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  return {
    animate,
    restore() {
      if (previousStyle === null) root.removeAttribute('style');
      else root.setAttribute('style', previousStyle);
      if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
      else Reflect.deleteProperty(Element.prototype, 'animate');
      vi.unstubAllGlobals();
    },
  };
}
