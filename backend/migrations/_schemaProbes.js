// ─────────────────────────────────────────────────────────────────────────────
//  Helpers to inspect schema state from information_schema.
//  All probes are safe to call repeatedly. They take a live mysql2/promise
//  connection or pool and return a boolean (or list).
// ─────────────────────────────────────────────────────────────────────────────

export async function hasTable(conn, table) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
        [table]
    );
    return r.length > 0;
}

export async function hasColumn(conn, table, column) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [table, column]
    );
    return r.length > 0;
}

export async function hasIndex(conn, table, indexName) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [table, indexName]
    );
    return r.length > 0;
}

export async function hasFK(conn, table, constraintName) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
        [table, constraintName]
    );
    return r.length > 0;
}

export async function pkColumns(conn, table) {
    const [rows] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
         ORDER BY SEQ_IN_INDEX`,
        [table]
    );
    return rows.map(r => r.COLUMN_NAME);
}

export async function hasRow(conn, table, where, params = []) {
    const [r] = await conn.query(
        `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`,
        params
    );
    return r.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Step runner: take an ordered array of { description, probe, sql, params? }
//  and execute the SQL only when the probe says it hasn't been applied yet.
//  probe must return Promise<boolean>: true = "already applied, skip".
// ─────────────────────────────────────────────────────────────────────────────

export async function runSteps(conn, steps) {
    let applied = 0, skipped = 0, failed = 0;
    for (const step of steps) {
        const head = step.description.slice(0, 80);
        try {
            const alreadyApplied = await step.probe(conn);
            if (alreadyApplied) {
                console.log(`⤷ skip  ${head} (already applied)`);
                skipped++;
                continue;
            }
            await conn.query(step.sql, step.params || []);
            console.log(`✓ apply ${head}`);
            applied++;
        } catch (err) {
            console.error(`✗ FAIL  ${head}\n        ${err.code || ''} ${err.message}`);
            failed++;
            throw err;
        }
    }
    console.log(`\n— Applied: ${applied}, Skipped: ${skipped}, Failed: ${failed} —`);
}
