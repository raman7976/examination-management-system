// ─────────────────────────────────────────────────────────────────────────────
//  Global vitest setup — runs once per test FILE before any test.
//
//   • Extends `expect` with jest-dom matchers (toBeInTheDocument, …).
//   • Boots the msw server; unhandled requests ERROR so nothing leaks to the
//     network (and the proxy in vite.config.js is never exercised under test).
//   • Resets handlers + DOM + localStorage between tests for isolation.
//   • Polyfills matchMedia (jsdom omits it; ThemeProvider reads it on mount).
// ─────────────────────────────────────────────────────────────────────────────

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { server } from './mswServer.js';

// jsdom has no matchMedia; ThemeProvider's resolveInitialTheme() calls it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),    // deprecated, kept for older callers
    removeListener: vi.fn(), // deprecated
    dispatchEvent: vi.fn(),
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});

afterAll(() => server.close());
