// ═════════════════════════════════════════════════════════════════════════════
//  Prefix-scoped teardown sweeper — the live-DB safety net.
//
//  EVERY row a test writes is tagged with TEST_PREFIX (see fixtures/constants.js).
//  This sweeper removes ONLY tagged rows, in FK-safe order, and is idempotent so
//  it can run after each file AND once globally — even when a run crashes.
//
//  Deletion order (children before parents that don't CASCADE):
//   1. exam_periods   — CASCADEs into exam_slots → scheduled_exams →
//      seating_allocations → individual_seating_plans, plus
//      invigilator_assignments / _role_targets / _target_overrides /
//      invigilator_swap_requests (all FK→exam_periods ON DELETE CASCADE).
//   2. exam_sessions  — no period FK; tagged via academic_year. Children in
//      exam_session_seating are removed first (defensive; FK may not CASCADE).
//   3. courses / course_enrollments / course_instructors — semester-scoped
//      strings, NO FK to exam_periods, so deleted explicitly by prefix.
//   4. students / classrooms / users — globally-seeded reference rows. Safe to
//      delete now because every child pointing at them went via step 1.
//
//  Matching keys are chosen so a broad sweep can NEVER hit a real row:
//   • semester_label / email / room_name / course_code / employee_id carry the
//     full "__TEST_<runid>_" prefix.
//   • students are matched by their __TEST_ email (NOT the short roll tag) so the
//     broad sweep can't collide with a real varchar(20) roll number.
// ═════════════════════════════════════════════════════════════════════════════

import db, { closePool } from './db.js';
import { TEST_PREFIX } from '../fixtures/constants.js';

const LIKE = (prefix) => `${prefix}%`;

// Sweep every tagged row for a given prefix. Pass the run-specific TEST_PREFIX
// for a normal teardown, or the broad '__TEST_' to mop up crashed-run leftovers.
export async function sweep(prefix = TEST_PREFIX) {
    const like = LIKE(prefix);

    // 0. Unfair-means cases deliberately survive period deletion (FKs are
    //    ON DELETE SET NULL), so they are swept explicitly by their copied label.
    await db.query(`DELETE FROM unfair_means_cases WHERE semester_label LIKE ?`, [like]);

    // 1. Periods — single delete cascades through the whole period-scoped tree.
    await db.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, [like]);

    // 2. Exam sessions (tagged on academic_year). Clear children first in case
    //    exam_session_seating has no ON DELETE CASCADE.
    await db.query(
        `DELETE ess FROM exam_session_seating ess
         JOIN exam_sessions s ON ess.session_id = s.id
         WHERE s.academic_year LIKE ?`,
        [like],
    );
    await db.query(`DELETE FROM exam_sessions WHERE academic_year LIKE ?`, [like]);

    // 3. Semester-scoped tables (no FK to periods).
    await db.query(`DELETE FROM course_enrollments WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);
    await db.query(`DELETE FROM course_instructors  WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);
    await db.query(`DELETE FROM courses              WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);

    // 4. Global reference rows (their period-scoped children are already gone).
    await db.query(`DELETE FROM students   WHERE email LIKE ?`, [like]);
    await db.query(`DELETE FROM classrooms WHERE room_name LIKE ?`, [like]);
    await db.query(`DELETE FROM users      WHERE email LIKE ?`, [like]);
}

// Broad mop-up for ANY run's leftovers, plus the legacy smoke-test prefix, then
// close the pool so the test process can exit cleanly. Call once at the very end.
export async function globalTeardown() {
    await sweep('__TEST_');
    // Legacy smoke-test rows (period-scoping.test.js) + its fixed course code.
    await db.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, ['__SMOKE_TEST_%']);
    await db.query(`DELETE FROM course_enrollments WHERE course_code = 'TEST_CS999'`);
    await db.query(`DELETE FROM courses WHERE course_code = 'TEST_CS999'`);
    await closePool();
}

// Count any rows that survived a sweep — used by a dedicated safety test to
// PROVE the DB is left pristine. Returns { table: count } for non-zero tables.
export async function countLeftovers(prefix = '__TEST_') {
    const like = LIKE(prefix);
    const checks = {
        exam_periods:        [`SELECT COUNT(*) c FROM exam_periods WHERE semester_label LIKE ?`, [like]],
        courses:             [`SELECT COUNT(*) c FROM courses WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]],
        course_enrollments:  [`SELECT COUNT(*) c FROM course_enrollments WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]],
        course_instructors:  [`SELECT COUNT(*) c FROM course_instructors WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]],
        students:            [`SELECT COUNT(*) c FROM students WHERE email LIKE ?`, [like]],
        classrooms:          [`SELECT COUNT(*) c FROM classrooms WHERE room_name LIKE ?`, [like]],
        users:               [`SELECT COUNT(*) c FROM users WHERE email LIKE ?`, [like]],
        exam_sessions:       [`SELECT COUNT(*) c FROM exam_sessions WHERE academic_year LIKE ?`, [like]],
        unfair_means_cases:  [`SELECT COUNT(*) c FROM unfair_means_cases WHERE semester_label LIKE ?`, [like]],
    };
    const leftovers = {};
    for (const [table, [sql, params]] of Object.entries(checks)) {
        const [[row]] = await db.query(sql, params);
        if (Number(row.c) > 0) leftovers[table] = Number(row.c);
    }
    return leftovers;
}
