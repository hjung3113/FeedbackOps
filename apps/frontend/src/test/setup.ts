import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest's `globals: false` config means @testing-library/react does NOT
// auto-register cleanup. Wire it explicitly so DOM nodes from prior tests
// don't leak into queries.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement window.scrollTo; TanStack Router's
// scroll-restoration hook calls it on every transition. Stub to keep test
// logs free of "Not implemented" noise.
if (typeof window !== 'undefined' && !window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });
} else if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
