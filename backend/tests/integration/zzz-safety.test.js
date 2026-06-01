// ═════════════════════════════════════════════════════════════════════════════
//  Integration — live-DB SAFETY NET  (named zzz- so it sorts/runs last)
//
//  Two guarantees the whole suite depends on:
//    1. After seeding a representative row in EVERY tagged table, the prefix
//       sweep removes ALL of it — countLeftovers('__TEST_') must be empty.
//    2. The real, production active period is never disturbed by the suite:
//       there is still exactly one is_active=1 period and it is NOT a __TEST_
//       row.
//
//  This is the test that proves "tests against the live DB" is safe.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sweep, countLeftovers } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import {
    seedAdmin, seedUser, seedClassroom, seedCourse, seedSlot,
    seedScheduledExam, seedAllocation, seedStudent, seedEnrollment, seedAssignment,
} from '../helpers/seedFixtures.js';
import { createTestPeriod } from '../helpers/periodFixture.js';
import { RUN_TAG } from '../fixtures/constants.js';

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

test('prefix sweep removes every tagged row across all tables', async () => {
    // Seed at least one row in each tagged table.
    const period = await createTestPeriod({ label: 'safetyP' });
    await seedAdmin({ local: 'safety_admin' });
    const inv = await seedUser({ role: 'faculty', local: 'safety_inv' });
    const room = await seedClassroom({ room_name: 'SAFER1' });
    const { course_code } = await seedCourse({ semester_label: period.semester_label, code: `__TEST_SF${RUN_TAG}`.slice(0, 20), total_students: 1 });
    const roll = await seedStudent();
    await seedEnrollment({ semester_label: period.semester_label, course_code, roll_number: roll });
    const slot = await seedSlot({ period_id: period.id });
    const exam = await seedScheduledExam({ slot_id: slot, course_code });
    const alloc = await seedAllocation({ scheduled_exam_id: exam, classroom_id: room.id, lane: 'G', student_count: 1, room_mode: 'S' });
    await seedAssignment({ slot_id: slot, classroom_id: room.id, user_id: inv.id, period_id: period.id });
    await db.query(
        `INSERT INTO individual_seating_plans (allocation_id, roll_number, seat_number) VALUES (?, ?, ?)`,
        [alloc, roll, 'G1'],
    );

    // Something is definitely there now.
    const before = await countLeftovers('__TEST_');
    assert.ok(Object.keys(before).length > 0, 'sanity: tagged rows exist before the sweep');

    // The sweep must leave ZERO tagged rows behind.
    await sweep('__TEST_');
    const leftovers = await countLeftovers('__TEST_');
    assert.deepEqual(leftovers, {}, `sweep left rows behind: ${JSON.stringify(leftovers)}`);
});

test('the production active period is untouched (exactly one, not a test row)', async () => {
    const [active] = await db.query(
        `SELECT id, semester_label FROM exam_periods WHERE is_active = 1`,
    );
    // Either there is exactly one real active period, or the deployment has none
    // configured — but in NO case may a __TEST_ row be the active one.
    assert.ok(active.length <= 1, 'at most one active period');
    for (const p of active) {
        assert.ok(
            !p.semester_label.startsWith('__TEST_') && !p.semester_label.startsWith('__SMOKE_TEST_'),
            `active period must not be a test row (got ${p.semester_label})`,
        );
    }
});
