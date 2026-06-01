// ─────────────────────────────────────────────────────────────────────────────
//  msw — node request-mocking server for the jsdom component suite.
//
//  axios in api.js uses a RELATIVE baseURL ('/api'); under jsdom that resolves
//  against window.location (http://localhost:3000), so handlers register the
//  same relative paths and msw matches them. Tests register per-case handlers
//  with `server.use(...)`; this module only owns the shared server instance.
// ─────────────────────────────────────────────────────────────────────────────

import { setupServer } from 'msw/node';

// Start with no default handlers — every test declares exactly what it expects,
// and the setup file flips `onUnhandledRequest: 'error'` so a stray call fails
// loudly instead of silently hitting the network.
export const server = setupServer();
