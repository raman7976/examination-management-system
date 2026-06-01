// ═════════════════════════════════════════════════════════════════════════════
//  Test app loader.
//
//  Forces NODE_ENV=test BEFORE importing server.js so:
//    • server.js does not call app.listen() (no real socket bound), and
//    • config/mysql.js skips its eager getConnection() (lazy pool instead).
//
//  Because ESM `import` is hoisted, we set the env var here and pull the app in
//  via a dynamic import so the ordering is guaranteed. Every integration suite
//  imports `app` from this module and drives it with supertest.
// ═════════════════════════════════════════════════════════════════════════════

process.env.NODE_ENV = 'test';

const { default: app } = await import('../../server.js');

export default app;
