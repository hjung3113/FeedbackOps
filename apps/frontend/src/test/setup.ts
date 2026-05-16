import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement window.scrollTo; TanStack Router's
// scroll-restoration hook calls it on every transition. Stub to keep test
// logs free of "Not implemented" noise.
if (typeof window !== 'undefined' && !window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });
} else if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
