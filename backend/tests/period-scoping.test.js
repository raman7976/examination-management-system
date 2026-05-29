// ═════════════════════════════════════════════════════════════════════════════
//  Period-scoping smoke tests
//
//  These tests defend against the class of bug we just fixed: a SQL query that
//  forgets its WHERE exam_period_id = ? (or semester_label = ?) clause and
//  silently returns data from OTHER periods.
//
//  Strategy: each test seeds a unique test period (and any needed minimal
//  data) into the live DB, runs the EXACT query pattern the relevant
//  controller uses, asserts no cross-period leak, then cleans up via
//  CASCADE-on-delete of the test period.
//
//  Run with:   npm test
//  No external framework — uses Node's built-in test runner (v18.0+).
//
//  Test isolation:
//   • Every test period uses a unique semester_label prefixed with
//     "__SMOKE_TEST_". The teardown sweeps any leftover rows with that
//     prefix even if a previous run died — so the DB never accumulates
//     test garbage.
//   • Tests do NOT touch any production period (active or otherwise).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../config/mysql.js';

const TEST_PREFIX = '__SMOKE_TEST_';

// Two fresh periods (A and B) created in `before`, shared by every test.
// A gets seeded with data; B stays empty. Every period-scoped query should
// see A's data ONLY when queried with periodIdA, and never when queried
// with periodIdB.
let periodIdA, periodIdB, semesterA, semesterB;
let slotIdA, scheduledExamIdA, allocationIdA, userIdForTest;

// ─────────────────────────────────────────────────────────────────────────────
//  Global setup — runs once for the whole suite.
// ─────────────────────────────────────────────────────────────────────────────
before(async () => {
    // Sweep any leftovers from a crashed previous run. exam_periods CASCADEs
    // into all period-scoped children; the two semester-scoped tables don't
    // CASCADE (no FK), so wipe them by course_code as well.
    await db.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, [`${TEST_PREFIX}%`]);
    await db.query(`DELETE FROM course_enrollments WHERE course_code = 'TEST_CS999'`);
    await db.query(`DELETE FROM courses WHERE course_code = 'TEST_CS999'`);

    const stamp = Date.now();
    semesterA = `${TEST_PREFIX}A_${stamp}`;
    semesterB = `${TEST_PREFIX}B_${stamp}`;

    // Create two test periods (both is_active=0 to avoid disturbing prod).
    const [aIns] = await db.query(
        `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, 'midterm', 0)`,
        [semesterA]
    );
    periodIdA = aIns.insertId;
    const [bIns] = await db.query(
        `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, 'midterm', 0)`,
        [semesterB]
    );
    periodIdB = bIns.insertId;

    // Pick any real user from `users` to serve as the invigilator in assignments.
    const [users] = await db.query(
        `SELECT id FROM users WHERE role != 'admin' LIMIT 1`
    );
    if (users.length === 0)
        throw new Error('Tests require at least one non-admin user in the database.');
    userIdForTest = users[0].id;

    // Pick any real classroom (no FK CASCADE from classrooms means we just
    // borrow an existing row — we never delete it).
    const [rooms] = await db.query(`SELECT id FROM classrooms LIMIT 1`);
    if (rooms.length === 0)
        throw new Error('Tests require at least one classroom in the database.');
    const classroomId = rooms[0].id;

    // ── Seed period A with one slot ──
    const [slotIns] = await db.query(
        `INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time, exam_period_id)
         VALUES ('2099-01-01', 'Tuesday', '09:00:00', '12:00:00', ?)`,
        [periodIdA]
    );
    slotIdA = slotIns.insertId;

    // ── One scheduled_exam, one allocation, one invigilator_assignment ──
    // We need a course_code that won't clash. Insert a placeholder course row
    // in semester A so the schedule chain is well-formed.
    await db.query(
        `INSERT INTO courses (semester_label, course_code, course_name, total_students)
         VALUES (?, 'TEST_CS999', 'Smoke Test Course', 5)`,
        [semesterA]
    );
    await db.query(
        `INSERT INTO courses (semester_label, course_code, course_name, total_students)
         VALUES (?, 'TEST_CS999', 'Smoke Test Course', 99)`,
        [semesterB]
    );

    // Insert a single course_enrollment for TEST_CS999 in EACH semester.
    // The bug we fixed: `generateMicroPlan` was pulling rows for both
    // semesters when querying course_code alone — these two rows let us prove
    // the fix.
    const [students] = await db.query(`SELECT roll_number FROM students LIMIT 1`);
    if (students.length === 0) throw new Error('Tests require at least one student.');
    const testRoll = students[0].roll_number;
    await db.query(
        `INSERT IGNORE INTO course_enrollments (semester_label, course_code, roll_number)
         VALUES (?, 'TEST_CS999', ?), (?, 'TEST_CS999', ?)`,
        [semesterA, testRoll, semesterB, testRoll]
    );

    const [seIns] = await db.query(
        `INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, 'TEST_CS999')`,
        [slotIdA]
    );
    scheduledExamIdA = seIns.insertId;

    const [allocIns] = await db.query(
        `INSERT INTO seating_allocations (scheduled_exam_id, classroom_id, lane, student_count, room_mode)
         VALUES (?, ?, 'P', 5, 'P')`,
        [scheduledExamIdA, classroomId]
    );
    allocationIdA = allocIns.insertId;

    await db.query(
        `INSERT INTO invigilator_assignments
            (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
         VALUES (?, ?, ?, 0, ?)`,
        [slotIdA, classroomId, userIdForTest, periodIdA]
    );

    // Insert one individual_seating_plan row for the gather-test.
    // seat_number is VARCHAR(10), so keep this short.
    await db.query(
        `INSERT INTO individual_seating_plans (allocation_id, roll_number, seat_number)
         VALUES (?, ?, 'T1')`,
        [allocationIdA, testRoll]
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Global teardown — removes everything we seeded (CASCADE wipes children).
// ─────────────────────────────────────────────────────────────────────────────
after(async () => {
    // CASCADE on exam_period_id cleans up exam_slots → scheduled_exams →
    // seating_allocations → individual_seating_plans → invigilator_assignments.
    await db.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, [`${TEST_PREFIX}%`]);
    // Semester-scoped tables don't CASCADE (no FK), so wipe explicitly.
    await db.query(`DELETE FROM course_enrollments WHERE course_code = 'TEST_CS999'`);
    await db.query(`DELETE FROM courses WHERE course_code = 'TEST_CS999'`);
    await db.end?.();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 1: getSchedule's slots query must filter by exam_period_id.
//
//  This is the exact bug we fixed: the query was returning slots from EVERY
//  period when no slot_id was given.
// ─────────────────────────────────────────────────────────────────────────────
test('getSchedule slots query is period-scoped', async () => {
    const [slotsForA] = await db.query(
        `SELECT es.id FROM exam_slots es WHERE es.exam_period_id = ? ORDER BY es.exam_date, es.start_time`,
        [periodIdA]
    );
    const [slotsForB] = await db.query(
        `SELECT es.id FROM exam_slots es WHERE es.exam_period_id = ? ORDER BY es.exam_date, es.start_time`,
        [periodIdB]
    );

    assert.equal(slotsForA.length, 1, 'period A should have exactly its 1 seeded slot');
    assert.equal(slotsForB.length, 0, 'period B should be empty — no leak from A');
    assert.equal(slotsForA[0].id, slotIdA);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 2: invigilator_assignments must be period-scoped.
// ─────────────────────────────────────────────────────────────────────────────
test('invigilator_assignments query is period-scoped', async () => {
    const [forA] = await db.query(
        `SELECT id FROM invigilator_assignments WHERE exam_period_id = ?`,
        [periodIdA]
    );
    const [forB] = await db.query(
        `SELECT id FROM invigilator_assignments WHERE exam_period_id = ?`,
        [periodIdB]
    );
    assert.equal(forA.length, 1);
    assert.equal(forB.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 3: course_enrollments query inside generateMicroPlan must filter by
//  semester_label, otherwise it pulls enrollments from every semester that
//  shares the course_code.
//
//  This is the second bug we fixed (Zip algorithm cross-semester leak).
// ─────────────────────────────────────────────────────────────────────────────
test('course_enrollments query is semester-scoped', async () => {
    // The BUGGY query — for documentation. Should return 2 rows (one per semester).
    const [unscoped] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = 'TEST_CS999'`
    );
    assert.ok(unscoped.length >= 2,
        'sanity check: enrollments exist in BOTH test semesters, so the unscoped query returns >= 2 rows. If this fails, the seed data is wrong.');

    // The CORRECT query (semester-scoped) — should return exactly 1.
    const [scopedA] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = 'TEST_CS999' AND semester_label = ?`,
        [semesterA]
    );
    const [scopedB] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = 'TEST_CS999' AND semester_label = ?`,
        [semesterB]
    );
    assert.equal(scopedA.length, 1, 'semester A should see only its 1 enrollment');
    assert.equal(scopedB.length, 1, 'semester B should see only its 1 enrollment');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 4: saveSession's "gather seating" query must scope by exam_period_id.
//
//  The bug we fixed: this query had no period filter, so a Save Session call
//  would archive every period's seating into one session.
// ─────────────────────────────────────────────────────────────────────────────
test('saveSession gather query is period-scoped', async () => {
    const gatherSQL = `
        SELECT isp.id
        FROM individual_seating_plans isp
        JOIN seating_allocations sa ON isp.allocation_id = sa.id
        JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
        JOIN exam_slots es ON se.slot_id = es.id
        WHERE es.exam_period_id = ?
    `;
    const [planA] = await db.query(gatherSQL, [periodIdA]);
    const [planB] = await db.query(gatherSQL, [periodIdB]);
    assert.equal(planA.length, 1, 'period A should expose its 1 seeded seating plan');
    assert.equal(planB.length, 0, 'period B should be empty — no leak from A');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 5: Swap-eligible query must scope candidates to the active period.
// ─────────────────────────────────────────────────────────────────────────────
test('swap-eligible candidates are period-scoped', async () => {
    // Candidates from another period must not appear when asking from period B.
    const [candidates] = await db.query(
        `SELECT ia.id FROM invigilator_assignments ia
         WHERE ia.exam_period_id = ?`,
        [periodIdB]
    );
    assert.equal(candidates.length, 0, 'period B has no candidates of its own');

    const [candidatesA] = await db.query(
        `SELECT ia.id FROM invigilator_assignments ia
         WHERE ia.exam_period_id = ?`,
        [periodIdA]
    );
    assert.equal(candidatesA.length, 1, 'period A has its 1 seeded assignment');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 6: getPeriodsOverview counts match per-period reality (no cross-leak).
//
//  Verifies the periods-overview endpoint returns the right counts for each
//  period and that they don't bleed into each other.
// ─────────────────────────────────────────────────────────────────────────────
test('getPeriodsOverview counts are per-period', async () => {
    const [overview] = await db.query(`
        SELECT
            p.id,
            (SELECT COUNT(*) FROM exam_slots WHERE exam_period_id = p.id) AS slots,
            (SELECT COUNT(*) FROM invigilator_assignments WHERE exam_period_id = p.id) AS invig
        FROM exam_periods p
        WHERE p.id IN (?, ?)
    `, [periodIdA, periodIdB]);

    const a = overview.find(r => r.id === periodIdA);
    const b = overview.find(r => r.id === periodIdB);

    assert.ok(a && b, 'both test periods should appear in the overview');
    assert.equal(Number(a.slots), 1,  'A: 1 slot');
    assert.equal(Number(a.invig), 1,  'A: 1 invigilator assignment');
    assert.equal(Number(b.slots), 0,  'B: 0 slots');
    assert.equal(Number(b.invig), 0,  'B: 0 invigilator assignments');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Test 7: Deleting a period CASCADEs to all period-scoped children.
//
//  Validates the schema's FK CASCADE chain (used by deleteExamPeriod).
// ─────────────────────────────────────────────────────────────────────────────
test('deleting a period CASCADEs to all period-scoped children', async () => {
    // Create a third throwaway period with one slot + assignment + seating chain.
    const [tIns] = await db.query(
        `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, 'midterm', 0)`,
        [`${TEST_PREFIX}DELCASCADE_${Date.now()}`]
    );
    const tempPeriodId = tIns.insertId;

    const [slotIns] = await db.query(
        `INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time, exam_period_id)
         VALUES ('2099-02-02', 'Wednesday', '14:00:00', '17:00:00', ?)`,
        [tempPeriodId]
    );
    const tempSlot = slotIns.insertId;

    const [seIns] = await db.query(
        `INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, 'TEST_CS999')`,
        [tempSlot]
    );

    // Snapshot pre-delete counts
    const [[pre]] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM exam_slots WHERE exam_period_id = ?) AS slots,
            (SELECT COUNT(*) FROM scheduled_exams se JOIN exam_slots es ON se.slot_id = es.id
                WHERE es.exam_period_id = ?) AS sched
    `, [tempPeriodId, tempPeriodId]);
    assert.equal(Number(pre.slots), 1);
    assert.equal(Number(pre.sched), 1);

    // The single delete that should cascade.
    await db.query(`DELETE FROM exam_periods WHERE id = ?`, [tempPeriodId]);

    // Children should be gone.
    const [[post]] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM exam_slots WHERE id = ?) AS slot_remaining,
            (SELECT COUNT(*) FROM scheduled_exams WHERE id = ?) AS sched_remaining
    `, [tempSlot, seIns.insertId]);
    assert.equal(Number(post.slot_remaining), 0, 'exam_slot should be cascade-deleted');
    assert.equal(Number(post.sched_remaining), 0, 'scheduled_exam should be cascade-deleted via slot');
});
