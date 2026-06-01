// ═════════════════════════════════════════════════════════════════════════════
//  Unit tests — utils/periodResolver.js  (active-period resolution)
//
//  NO real database: a tiny stub connection records the SQL it is asked to run
//  and returns canned rows. This locks the "explicit id wins, else is_active=1,
//  else 400" contract that EVERY controller relies on to stay period-scoped —
//  and the 404 / label round-trips for loadPeriod / getActiveSemesterLabel.
// ═════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveActivePeriod,
    loadPeriod,
    getActiveSemesterLabel,
} from '../../utils/periodResolver.js';

// A stub connection: every .query() call is logged, and the next queued result
// (an array of rows) is returned in the mysql2 [rows, fields] shape.
function stubConn(results = []) {
    const calls = [];
    const queue = [...results];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            const rows = queue.length ? queue.shift() : [];
            return [rows, []];
        },
    };
}

// ── 1. explicit id short-circuits and NEVER hits the DB ──────────────────────
test('resolveActivePeriod returns the explicit id without querying', async () => {
    const conn = stubConn();
    const id = await resolveActivePeriod(conn, '42');
    assert.equal(id, 42, 'explicit id is coerced to a number');
    assert.equal(conn.calls.length, 0, 'no DB query is issued when id is explicit');
});

// ── 2. no explicit id → look up the single is_active = 1 row ──────────────────
test('resolveActivePeriod falls back to the active period row', async () => {
    const conn = stubConn([[{ id: 7 }]]);
    const id = await resolveActivePeriod(conn, undefined);
    assert.equal(id, 7);
    assert.equal(conn.calls.length, 1);
    assert.match(conn.calls[0].sql, /is_active = 1/);
});

// ── 3. no active period → 400 ────────────────────────────────────────────────
test('resolveActivePeriod throws http 400 when nothing is active', async () => {
    const conn = stubConn([[]]); // empty result set
    await assert.rejects(
        () => resolveActivePeriod(conn, undefined),
        (err) => {
            assert.equal(err.http, 400);
            assert.match(err.message, /No active exam period/);
            return true;
        },
    );
});

// ── 4. explicit id 0 / falsy is treated as "not provided" ────────────────────
test('resolveActivePeriod treats a falsy id as absent and falls back', async () => {
    const conn = stubConn([[{ id: 3 }]]);
    const id = await resolveActivePeriod(conn, 0);
    assert.equal(id, 3, 'id 0 is falsy → uses the active-period lookup');
    assert.equal(conn.calls.length, 1);
});

// ── 5. loadPeriod returns the row ────────────────────────────────────────────
test('loadPeriod returns the matching period row', async () => {
    const row = { id: 5, semester_label: '2099 Spring', exam_type: 'midterm', is_active: 0 };
    const conn = stubConn([[row]]);
    const period = await loadPeriod(conn, 5);
    assert.deepEqual(period, row);
    assert.match(conn.calls[0].sql, /FROM exam_periods WHERE id = \?/);
    assert.deepEqual(conn.calls[0].params, [5]);
});

// ── 6. loadPeriod → 404 on miss ──────────────────────────────────────────────
test('loadPeriod throws http 404 when the period does not exist', async () => {
    const conn = stubConn([[]]);
    await assert.rejects(
        () => loadPeriod(conn, 999),
        (err) => {
            assert.equal(err.http, 404);
            assert.match(err.message, /not found/i);
            return true;
        },
    );
});

// ── 7. getActiveSemesterLabel chains resolve → load → label ──────────────────
test('getActiveSemesterLabel returns the label for the active period', async () => {
    // 1st query: resolveActivePeriod (is_active lookup) → id 9
    // 2nd query: loadPeriod → the row carrying the label
    const conn = stubConn([
        [{ id: 9 }],
        [{ id: 9, semester_label: '2099 Endterm', exam_type: 'endterm', is_active: 1 }],
    ]);
    const label = await getActiveSemesterLabel(conn, undefined);
    assert.equal(label, '2099 Endterm');
    assert.equal(conn.calls.length, 2, 'resolve + load are two queries');
});

// ── 8. getActiveSemesterLabel with an explicit id skips the active lookup ─────
test('getActiveSemesterLabel with an explicit id loads that period directly', async () => {
    const conn = stubConn([
        [{ id: 11, semester_label: '2099 Explicit', exam_type: 'midterm', is_active: 0 }],
    ]);
    const label = await getActiveSemesterLabel(conn, 11);
    assert.equal(label, '2099 Explicit');
    assert.equal(conn.calls.length, 1, 'explicit id → only the loadPeriod query runs');
});
