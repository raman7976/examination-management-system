// Idempotent migration: add UNIQUE KEY uq_slot_course (slot_id, course_code) to
// scheduled_exams so duplicate course→slot assigns are rejected by the DB. The
// controller (scheduleController.assignCourses) already maps ER_DUP_ENTRY → 409;
// this is the index that finally makes that branch fire.
//
// Guarded for the live Aiven DB, in three phases:
//   Phase 0 — SELF-TEST on a disposable __TEST_ period. Seeds a known duplicate
//             (plus a seating_allocation on the row we expect to lose) and runs
//             the de-dup statement SCOPED to the scratch slot, so it provably
//             cannot touch real rows. Asserts the lowest id survives, the unique
//             row is untouched, and seating_allocations CASCADE clears the
//             orphan. Scratch rows are always cleaned up, even on failure.
//   Phase 1 — DE-DUP the real table (keep the lowest id per group).
//   Phase 2 — ADD UNIQUE KEY uq_slot_course (probed; skipped if already there).
import assert from 'node:assert/strict';
import db from '../config/mysql.js';
import { hasIndex } from './_schemaProbes.js';

const TAG = `__TEST_mig_${Date.now()}_`;

// The de-dup statement. The inner subquery is optionally scoped to a single slot
// so the self-test can exercise the exact DELETE/JOIN logic without any chance
// of deleting real production rows. The real run (scoped=false) is table-wide.
const dedupeSql = (scoped) => `
    DELETE se FROM scheduled_exams se
    JOIN (
        SELECT slot_id, course_code, MIN(id) AS keep_id
        FROM scheduled_exams
        ${scoped ? 'WHERE slot_id = ?' : ''}
        GROUP BY slot_id, course_code
        HAVING COUNT(*) > 1
    ) d ON se.slot_id = d.slot_id AND se.course_code = d.course_code
    WHERE se.id <> d.keep_id`;

// Tear down every scratch row this run created. Deleting the period cascades
// through exam_slots → scheduled_exams → seating_allocations; the classroom is a
// global reference row, removed by tag after its child allocation is gone.
async function cleanupScratch(conn) {
    await conn.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, [`${TAG}%`]);
    await conn.query(`DELETE FROM classrooms   WHERE room_name      LIKE ?`, [`${TAG}%`]);
}

async function selfTest(conn) {
    const [p] = await conn.query(
        `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, 'midterm', 0)`,
        [`${TAG}p`],
    );
    const [s] = await conn.query(
        `INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time, exam_period_id)
         VALUES ('2099-01-01', 'Tuesday', '09:00:00', '12:00:00', ?)`,
        [p.insertId],
    );
    const slotId = s.insertId;
    const [cr] = await conn.query(
        `INSERT INTO classrooms (room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type)
         VALUES (?, 30, 30, 30, 1, 1, 'normal')`,
        [`${TAG}R1`],
    );
    const classroomId = cr.insertId;

    const codeA = `${TAG}CA`;
    const codeB = `${TAG}CB`;
    // codeA: two rows (lowest id should survive). codeB: one row (must be left alone).
    const [a1] = await conn.query(`INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`, [slotId, codeA]);
    const keepId = a1.insertId;
    const [a2] = await conn.query(`INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`, [slotId, codeA]);
    const loserId = a2.insertId;
    await conn.query(`INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`, [slotId, codeB]);

    // Seating hangs off the LOSER row, so the de-dup DELETE must cascade it away.
    await conn.query(
        `INSERT INTO seating_allocations (scheduled_exam_id, classroom_id, lane, student_count, room_mode)
         VALUES (?, ?, 'G', 10, 'S')`,
        [loserId, classroomId],
    );

    await conn.query(dedupeSql(true), [slotId]);

    const [survivorsA] = await conn.query(
        `SELECT id FROM scheduled_exams WHERE slot_id = ? AND course_code = ?`, [slotId, codeA]);
    const [[{ bCount }]] = await conn.query(
        `SELECT COUNT(*) bCount FROM scheduled_exams WHERE slot_id = ? AND course_code = ?`, [slotId, codeB]);
    const [[{ orphan }]] = await conn.query(
        `SELECT COUNT(*) orphan FROM seating_allocations WHERE scheduled_exam_id = ?`, [loserId]);

    assert.equal(survivorsA.length, 1, `codeA should collapse to 1 row, got ${survivorsA.length}`);
    assert.equal(survivorsA[0].id, keepId, `survivor should be the lowest id ${keepId}, got ${survivorsA[0].id}`);
    assert.equal(bCount, 1, 'the unique codeB row must be left untouched');
    assert.equal(orphan, 0, 'seating_allocation on the discarded duplicate must cascade away');

    console.log(`✓ self-test: kept lowest id ${keepId}, removed ${loserId}, cascade cleared orphan seating, unique row intact`);
}

async function main() {
    const conn = await db.getConnection();
    try {
        // Already applied? Then duplicates can no longer exist (the index forbids
        // them) and the self-test couldn't even seed its scratch duplicate — so
        // skip the whole thing. This is what makes the migration safe to re-run.
        if (await hasIndex(conn, 'scheduled_exams', 'uq_slot_course')) {
            console.log('⤷ uq_slot_course already present — migration already applied, nothing to do.');
            return;
        }

        // Phase 0 — prove the de-dup logic on disposable scratch data first.
        try {
            await selfTest(conn);
        } finally {
            await cleanupScratch(conn);
        }

        // Phase 1 — de-dup the real table (keep the lowest id per group).
        const [del] = await conn.query(dedupeSql(false));
        console.log(`✓ de-dup real table: removed ${del.affectedRows} duplicate row(s)`);

        // Phase 2 — add the unique index.
        await conn.query(`ALTER TABLE scheduled_exams ADD UNIQUE KEY uq_slot_course (slot_id, course_code)`);
        console.log('✓ apply uq_slot_course (slot_id, course_code)');

        console.log('\n✅ scheduled_exams unique-index migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.code || '', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
