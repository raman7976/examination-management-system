// ═════════════════════════════════════════════════════════════════════════════
//  DB handle for tests.
//
//  Re-exports the SAME mysql2 pool the app uses (config/mysql.js) so tests seed
//  and assert against the exact connection the controllers write through. Setting
//  NODE_ENV=test first keeps the pool lazy (no eager connect on import).
//
//  closePool() is called once by the global teardown so `node --test` can exit
//  instead of hanging on idle pool sockets.
// ═════════════════════════════════════════════════════════════════════════════

process.env.NODE_ENV = 'test';

const { default: db } = await import('../../config/mysql.js');

export default db;

let closed = false;
export async function closePool() {
    if (closed) return;
    closed = true;
    await db.end?.();
}
